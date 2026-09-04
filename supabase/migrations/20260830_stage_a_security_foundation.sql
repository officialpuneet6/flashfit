-- FlashFit Stage A: additive, feature-gated security foundation.
-- DO NOT use this migration for Stage B policy/grant cutover. Legacy policies,
-- grants, credentials and direct browser flows intentionally remain untouched.

create table if not exists public.security_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.security_feature_flags(key, enabled) values
  ('secure_checkout_v1', false), ('secure_payu_v1', false),
  ('secure_notifications_v1', false), ('secure_push_v1', false),
  ('secure_gps_v1', false)
on conflict (key) do nothing;

alter table public.security_feature_flags enable row level security;
create policy "stage a admins manage security flags" on public.security_feature_flags
  for all to public using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.platform_permission_grants (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(user_id, permission)
);
alter table public.platform_permission_grants enable row level security;
create policy "stage a admins manage permission grants" on public.platform_permission_grants
  for all to public using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.has_platform_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_platform_admin() or exists (
      select 1 from public.platform_permission_grants
      where user_id = auth.uid() and permission = p_permission and active
    )
  );
$$;

create or replace function public.get_security_feature_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, enabled), '{}'::jsonb) from public.security_feature_flags;
$$;

-- Legacy credentials remain intact. These nullable links are the Stage A bridge.
alter table public.shops add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.delivery_partners add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.seller_orders add column if not exists product_image_url text;
alter table public.seller_orders add column if not exists updated_at timestamptz default now();
alter table public.seller_orders add column if not exists shipping_fee numeric default 0;
alter table public.seller_orders add column if not exists delivery_mode text;
alter table public.seller_orders add column if not exists fulfilment_location_id bigint;
alter table public.seller_orders add column if not exists payment_received_at timestamptz;
create unique index if not exists idx_shops_auth_user_id_unique on public.shops(auth_user_id) where auth_user_id is not null;
create unique index if not exists idx_delivery_partners_auth_user_id_unique on public.delivery_partners(auth_user_id) where auth_user_id is not null;

create table if not exists public.checkout_idempotency_keys (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  request_fingerprint text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create table if not exists public.inventory_reservations (
  id bigserial primary key,
  reservation_key uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id bigint,
  product_id bigint not null,
  shop_id bigint,
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','released','consumed','expired')),
  expires_at timestamptz not null default now() + interval '20 minutes',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_inventory_reservations_active on public.inventory_reservations(product_id, status, expires_at);
create table if not exists public.commerce_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  provider text not null check (provider in ('PAYU','COD')),
  status text not null default 'pending' check (status in ('pending','payment_requested','paid','failed','cancelled','refunded')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'INR',
  provider_transaction_id text unique,
  provider_payment_id text unique,
  order_ids jsonb not null default '[]'::jsonb,
  callback_payload jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key, provider)
);
create table if not exists public.payment_callback_events (
  id bigserial primary key,
  provider text not null, provider_transaction_id text not null,
  payload_hash text not null, payload jsonb not null,
  processed_at timestamptz, created_at timestamptz not null default now(),
  unique(provider, provider_transaction_id, payload_hash)
);
create table if not exists public.notification_event_keys (
  event_key text primary key, notification_id bigint, created_at timestamptz not null default now()
);
create table if not exists public.notification_recipient_links (
  id bigserial primary key,
  notification_role text not null check (notification_role in ('admin','user','shopkeeper','delivery_partner')),
  legacy_recipient_id text not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(notification_role, legacy_recipient_id), unique(notification_role, auth_user_id)
);

alter table public.checkout_idempotency_keys enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.commerce_payment_intents enable row level security;
alter table public.payment_callback_events enable row level security;
alter table public.notification_event_keys enable row level security;
alter table public.notification_recipient_links enable row level security;
create policy "stage a customer reads own checkout keys" on public.checkout_idempotency_keys for select to authenticated using (user_id = auth.uid());
create policy "stage a customer reads own reservations" on public.inventory_reservations for select to authenticated using (user_id = auth.uid());
create policy "stage a customer reads own payment intents" on public.commerce_payment_intents for select to authenticated using (user_id = auth.uid());
create policy "stage a finance reads payment callbacks" on public.payment_callback_events for select to authenticated using (public.has_platform_permission('finance.read'));
create policy "stage a admins manage notification recipient links" on public.notification_recipient_links for all to public using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.create_secure_checkout(
  p_items jsonb, p_delivery jsonb, p_payment_method text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_item jsonb; v_product record; v_qty integer; v_total numeric(12,2) := 0;
  v_orders jsonb := '[]'::jsonb; v_order_id bigint; v_first_order_id bigint; v_order_number text; v_fingerprint text;
  v_existing jsonb; v_method text := upper(trim(p_payment_method)); v_intent_id uuid;
  v_shipping numeric(12,2) := 0; v_quote jsonb; v_mode text := 'STANDARD'; v_location_id bigint;
  v_requested_mode text := upper(coalesce(p_delivery->>'delivery_preference','STANDARD'));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_method not in ('COD','PAYU','UPI') then raise exception 'Unsupported payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 25 or jsonb_typeof(p_delivery) <> 'object' then raise exception 'Invalid cart'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 16 or char_length(p_idempotency_key) > 160 then raise exception 'Invalid checkout request'; end if;
  if coalesce(p_delivery->>'pincode','') !~ '^[0-9]{6}$' or not exists (select 1 from public.serviceable_pincodes where pincode=p_delivery->>'pincode' and active=true) then raise exception 'Delivery is unavailable for this address'; end if;
  v_quote := public.get_delivery_quote(p_delivery->>'pincode', p_items);
  if coalesce((v_quote->>'eligible')::boolean,false) then v_mode := 'FLASH'; v_location_id := nullif(v_quote->>'location_id','')::bigint; end if;
  if v_requested_mode = 'FLASH' and v_mode <> 'FLASH' then raise exception 'Flash delivery is unavailable for this cart'; end if;
  v_fingerprint := md5(coalesce(p_items::text,'') || coalesce(p_delivery::text,'') || v_method);
  insert into public.checkout_idempotency_keys(user_id,idempotency_key,request_fingerprint)
    values(v_user,p_idempotency_key,v_fingerprint)
    on conflict(user_id,idempotency_key) do nothing;
  select response into v_existing from public.checkout_idempotency_keys where user_id=v_user and idempotency_key=p_idempotency_key for update;
  if exists (select 1 from public.checkout_idempotency_keys where user_id=v_user and idempotency_key=p_idempotency_key and request_fingerprint <> v_fingerprint) then raise exception 'Checkout request cannot be reused'; end if;
  if v_existing is not null then return v_existing; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_qty < 1 or v_qty > 20 or coalesce((v_item->>'product_id')::bigint,0) < 1 then raise exception 'Invalid cart item'; end if;
    select id,shop_id,title,customer_price,shop_price,commission_amount,delivery_fee,image_url,stock_qty
      into v_product from public.shopkeeper_products where id=(v_item->>'product_id')::bigint for update;
    if not found then raise exception 'An item is unavailable'; end if;
    -- Mark stale holds for this locked product before calculating availability.
    -- This is deliberately state-only: it never changes physical stock.
    update public.inventory_reservations set status='expired', updated_at=now()
      where product_id=v_product.id and status='reserved' and expires_at <= now();
    if coalesce(v_product.stock_qty,0) - coalesce((select sum(quantity) from public.inventory_reservations where product_id=v_product.id and status='reserved' and expires_at > now()),0) < v_qty then raise exception 'An item is unavailable'; end if;
    v_order_number := 'FF-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || v_product.id || '-' || floor(random()*9000+1000)::text;
    insert into public.seller_orders(shop_id,user_id,order_number,customer_name,customer_mobile,customer_address,product_id,product_title,product_image_url,shop_price,commission_amount,delivery_fee,shipping_fee,delivery_mode,fulfilment_location_id,platform_earning,shop_payout,qty,total,payment_mode,payment_status,payment_reference,order_status)
    values(v_product.shop_id,v_user,v_order_number,coalesce(p_delivery->>'full_name',''),coalesce(p_delivery->>'mobile',''),coalesce(p_delivery->>'address',''),v_product.id,v_product.title,v_product.image_url,coalesce(v_product.shop_price,0),coalesce(v_product.commission_amount,0),coalesce(v_product.delivery_fee,0),0,v_mode,v_location_id,coalesce(v_product.commission_amount,0),coalesce(v_product.shop_price,0),v_qty,(coalesce(v_product.customer_price,0)*v_qty),case when v_method='COD' then 'COD' else 'PAYU' end,'pending',case when v_method='COD' then 'COD' else 'PAYU_PENDING' end,'pending') returning id into v_order_id;
    insert into public.user_orders(user_id,order_number,status,total) values(v_user,v_order_number,'pending',coalesce(v_product.customer_price,0)*v_qty);
    insert into public.inventory_reservations(user_id,order_id,product_id,shop_id,quantity) values(v_user,v_order_id,v_product.id,v_product.shop_id,v_qty);
    if v_first_order_id is null then v_first_order_id := v_order_id; end if;
    v_shipping := greatest(v_shipping, coalesce(v_product.delivery_fee,0));
    v_total := v_total + coalesce(v_product.customer_price,0)*v_qty;
    v_orders := v_orders || jsonb_build_array(jsonb_build_object('id',v_order_id,'order_number',v_order_number));
  end loop;
  update public.seller_orders set shipping_fee=v_shipping, total=total+v_shipping, updated_at=now() where id=v_first_order_id;
  update public.user_orders set total=total+v_shipping where user_id=v_user and order_number=(select order_number from public.seller_orders where id=v_first_order_id);
  v_total := v_total + v_shipping;
  insert into public.commerce_payment_intents(user_id,idempotency_key,provider,amount,order_ids)
    values(v_user,p_idempotency_key,case when v_method='COD' then 'COD' else 'PAYU' end,v_total,v_orders)
    on conflict(user_id,idempotency_key,provider) do update set updated_at=now()
    returning id into v_intent_id;
  v_existing := jsonb_build_object('orders',v_orders,'payment_intent_id',v_intent_id,'amount',v_total,'shipping_fee',v_shipping,'delivery_mode',v_mode,'payment_method',v_method);
  update public.checkout_idempotency_keys set response=v_existing where user_id=v_user and idempotency_key=p_idempotency_key;
  return v_existing;
end; $$;

create or replace function public.finalize_secure_payment_intent(
  p_intent_id uuid, p_outcome text, p_provider_payment_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_intent public.commerce_payment_intents%rowtype; v_reservation public.inventory_reservations%rowtype; v_outcome text := lower(trim(p_outcome)); v_order_ids bigint[]; v_partner_id bigint; v_rider_allowed boolean := false;
begin
  if v_outcome not in ('paid','failed') then raise exception 'Invalid payment outcome'; end if;
  select * into v_intent from public.commerce_payment_intents where id=p_intent_id for update;
  if not found then raise exception 'Payment intent not found'; end if;
  select array_agg((value->>'id')::bigint) into v_order_ids from jsonb_array_elements(v_intent.order_ids);
  -- A webhook/service role or finance permission may settle any intent. A rider
  -- may settle only their own delivered COD order(s), never a browser payment.
  if auth.role() <> 'service_role' and not public.has_platform_permission('finance.settle') then
    select id into v_partner_id from public.delivery_partners where auth_user_id=auth.uid() limit 1;
    select v_intent.provider='COD' and count(*) > 0 and bool_and(
      delivery_partner_id=v_partner_id
      and lower(coalesce(order_status,''))='delivered'
      and exists (select 1 from public.cod_cash_settlements cs where cs.order_id=seller_orders.id)
    )
      into v_rider_allowed from public.seller_orders where id=any(v_order_ids);
    if not coalesce(v_rider_allowed,false) then raise exception 'Not authorized to finalize payment'; end if;
  end if;
  if v_intent.status in ('paid','failed') then return jsonb_build_object('id',v_intent.id,'status',v_intent.status,'idempotent',true); end if;
  if v_intent.status not in ('pending','payment_requested') then raise exception 'Payment intent cannot be finalized'; end if;
  for v_reservation in select * from public.inventory_reservations where order_id = any(v_order_ids) order by product_id,id for update loop
    if v_reservation.status <> 'reserved' then raise exception 'Reservation cannot be finalized'; end if;
    if v_outcome = 'paid' then
      update public.shopkeeper_products set stock_qty=stock_qty-v_reservation.quantity, updated_at=now()
        where id=v_reservation.product_id and stock_qty >= v_reservation.quantity;
      if not found then raise exception 'Inventory changed before payment confirmation'; end if;
      update public.inventory_reservations set status='consumed', updated_at=now() where id=v_reservation.id and status='reserved';
    else
      update public.inventory_reservations set status='released', updated_at=now() where id=v_reservation.id and status='reserved';
    end if;
  end loop;
  update public.commerce_payment_intents set status=v_outcome, provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id), updated_at=now() where id=v_intent.id;
  update public.seller_orders set payment_status=case when v_outcome='paid' then 'paid' else 'failed' end, payment_reference=coalesce(p_provider_payment_id,payment_reference), payment_received_at=case when v_outcome='paid' then now() else null end where id=any(v_order_ids) and payment_status='pending';
  return jsonb_build_object('id',v_intent.id,'status',v_outcome,'idempotent',false);
end; $$;

create or replace function public.release_secure_inventory_reservations(p_payment_intent_id uuid, p_reason text default 'cancelled')
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  -- A customer must never release a PayU hold after a payment has been
  -- requested: a later verified callback must retain a valid reservation.
  -- PayU failures are released only by the verified finalizer above.
  update public.inventory_reservations r set status='released', updated_at=now()
    from public.commerce_payment_intents i
    where i.id=p_payment_intent_id and i.user_id=auth.uid()
      and i.provider='COD' and i.status='pending'
      and r.order_id in (select (value->>'id')::bigint from jsonb_array_elements(i.order_ids))
      and r.status='reserved';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    update public.commerce_payment_intents set status='cancelled', updated_at=now()
      where id=p_payment_intent_id and user_id=auth.uid() and provider='COD' and status='pending';
  end if;
  return v_count;
end; $$;

create or replace function public.get_secure_payment_intent(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_intent public.commerce_payment_intents%rowtype;
begin
  select * into v_intent from public.commerce_payment_intents where id=p_intent_id and user_id=auth.uid();
  if not found then raise exception 'Payment intent not found'; end if;
  if v_intent.status not in ('pending','payment_requested') then raise exception 'Payment intent is not payable'; end if;
  return jsonb_build_object('id',v_intent.id,'provider',v_intent.provider,'amount',v_intent.amount,'currency',v_intent.currency,'orders',v_intent.order_ids);
end; $$;

create or replace function public.get_secure_payment_status(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_intent public.commerce_payment_intents%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_intent from public.commerce_payment_intents where id=p_intent_id and user_id=auth.uid();
  if not found then raise exception 'Payment not found'; end if;
  return jsonb_build_object('id',v_intent.id,'status',v_intent.status,'provider',v_intent.provider,'amount',v_intent.amount);
end; $$;

create or replace function public.secure_transition_order(p_order_id bigint, p_next_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.seller_orders%rowtype; v_partner_id bigint; v_next text := lower(trim(p_next_status));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_order from public.seller_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select id into v_partner_id from public.delivery_partners where auth_user_id=auth.uid() limit 1;
  if public.has_platform_permission('orders.manage') then null;
  elsif v_order.shop_id in (select id from public.shops where auth_user_id=auth.uid()) and v_next in ('accepted','packed') then null;
  elsif v_order.delivery_partner_id=v_partner_id and lower(coalesce(v_order.order_status,'')) in ('assigned','accepted','packed','out_for_delivery') and v_next in ('accepted','out_for_delivery','delivered','cancelled') then null;
  else raise exception 'Not authorized for this order transition'; end if;
  update public.seller_orders set order_status=v_next, updated_at=now() where id=p_order_id;
  return jsonb_build_object('id',p_order_id,'status',v_next);
end; $$;

create or replace function public.secure_upsert_push_subscription(p_endpoint text, p_subscription jsonb, p_device_id text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null or p_endpoint is null or char_length(p_endpoint) > 4096 or jsonb_typeof(p_subscription) <> 'object' then raise exception 'Invalid subscription'; end if;
  select role into v_role from public.platform_user_roles where user_id=auth.uid() limit 1;
  v_role := coalesce(v_role,'user');
  insert into public.push_subscriptions(role,recipient_id,user_id,device_id,endpoint,subscription,active,updated_at)
  values(v_role,auth.uid()::text,auth.uid()::text,p_device_id,p_endpoint,p_subscription,true,now())
  on conflict(endpoint) do update set role=excluded.role,recipient_id=excluded.recipient_id,user_id=excluded.user_id,device_id=excluded.device_id,subscription=excluded.subscription,active=true,updated_at=now();
  return true;
end; $$;

create or replace function public.secure_update_inventory(p_product_id bigint, p_quantity_delta integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_product public.shopkeeper_products%rowtype; v_shop_id bigint;
begin
  if auth.uid() is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 10000 then raise exception 'Invalid inventory request'; end if;
  select * into v_product from public.shopkeeper_products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  select id into v_shop_id from public.shops where auth_user_id=auth.uid() limit 1;
  if not public.has_platform_permission('inventory.manage') and v_product.shop_id is distinct from v_shop_id then raise exception 'Not authorized to update inventory'; end if;
  if coalesce(v_product.stock_qty,0) + p_quantity_delta < 0 then raise exception 'Insufficient stock'; end if;
  update public.shopkeeper_products set stock_qty=coalesce(stock_qty,0)+p_quantity_delta, updated_at=now() where id=p_product_id;
  insert into public.flashfit_audit_logs(action,role,user_label,status,payload)
    values('inventory_adjustment','secure_operation',auth.uid()::text,'recorded',jsonb_build_object('product_id',p_product_id,'quantity_delta',p_quantity_delta,'reason',left(coalesce(p_reason,''),250)));
  return jsonb_build_object('product_id',p_product_id,'quantity_delta',p_quantity_delta);
end; $$;

create or replace function public.secure_create_platform_notification(
  p_event_type text, p_title text, p_body text, p_recipient_role text, p_recipient_id text, p_event_key text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if auth.uid() is null or not public.has_platform_permission('notifications.send') then raise exception 'Not authorized to create notifications'; end if;
  if p_event_type is null or p_recipient_role not in ('admin','user','shopkeeper','delivery_partner') or p_recipient_id is null or char_length(p_title) > 160 or char_length(p_body) > 1000 then raise exception 'Invalid notification'; end if;
  if p_event_key is not null then
    select notification_id into v_id from public.notification_event_keys where event_key=p_event_key;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.platform_notifications(event_type,title,body,role,recipient_id,actor_id,actor_role)
    values(p_event_type,p_title,p_body,p_recipient_role,p_recipient_id,auth.uid()::text,'secure_operation') returning id into v_id;
  if p_event_key is not null then insert into public.notification_event_keys(event_key,notification_id) values(p_event_key,v_id); end if;
  return v_id;
end; $$;

create or replace function public.secure_create_cod_settlement(p_order_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.seller_orders%rowtype; v_partner_id bigint; v_intent_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_order from public.seller_orders where id=p_order_id for update;
  if not found or lower(coalesce(v_order.payment_mode,'')) <> 'cod' then raise exception 'COD order not found'; end if;
  select id into v_partner_id from public.delivery_partners where auth_user_id=auth.uid() limit 1;
  if not public.has_platform_permission('finance.settle') and v_order.delivery_partner_id is distinct from v_partner_id then raise exception 'Not authorized for settlement'; end if;
  if lower(coalesce(v_order.order_status,'')) <> 'delivered' then raise exception 'Order must be delivered'; end if;
  insert into public.cod_cash_settlements(order_id,order_number,customer_id,shop_id,delivery_partner_id,cod_amount,delivery_charge,flashfit_commission,shopkeeper_keeps,settlement_status)
    values(v_order.id,v_order.order_number,v_order.user_id::text,v_order.shop_id,v_order.delivery_partner_id,coalesce(v_order.total,0),coalesce(v_order.delivery_fee,0),coalesce(v_order.commission_amount,0),greatest(0,coalesce(v_order.total,0)-coalesce(v_order.delivery_fee,0)-coalesce(v_order.commission_amount,0)),'cash_collected')
    on conflict(order_id) do nothing;
  select id into v_intent_id from public.commerce_payment_intents
    where provider='COD' and order_ids @> jsonb_build_array(jsonb_build_object('id',v_order.id))
    order by created_at desc limit 1;
  if v_intent_id is null then raise exception 'COD payment intent not found'; end if;
  perform public.finalize_secure_payment_intent(v_intent_id,'paid',null);
  return jsonb_build_object('order_id',v_order.id,'status','cash_collected');
end; $$;

-- V1 remains untouched for legacy riders. Route to V2 only when secure_gps_v1 is enabled.
create or replace function public.record_partner_location_v2(p_order_id bigint, p_latitude numeric, p_longitude numeric, p_accuracy_meters numeric default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_partner_id bigint; v_last public.delivery_location_samples%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or coalesce(p_accuracy_meters,0) < 0 or coalesce(p_accuracy_meters,0) > 5000 then raise exception 'Invalid location'; end if;
  select dp.id into v_partner_id from public.delivery_partners dp join public.platform_user_roles r on r.user_id=auth.uid()
    where r.role='delivery_partner' and dp.auth_user_id=auth.uid() limit 1;
  if v_partner_id is null then raise exception 'Delivery partner authentication required'; end if;
  if not exists (select 1 from public.seller_orders so where so.id=p_order_id and so.delivery_partner_id=v_partner_id and lower(coalesce(so.order_status,'')) in ('assigned','accepted','packed','out_for_delivery')) then raise exception 'No active assigned delivery'; end if;
  select * into v_last from public.delivery_location_samples where partner_id=v_partner_id and order_id=p_order_id order by recorded_at desc limit 1;
  if found and v_last.recorded_at > now() - interval '8 seconds' and abs(v_last.latitude-p_latitude) < 0.00005 and abs(v_last.longitude-p_longitude) < 0.00005 then return true; end if;
  insert into public.delivery_location_samples(partner_id,order_id,latitude,longitude,accuracy_meters) values(v_partner_id,p_order_id,p_latitude,p_longitude,p_accuracy_meters);
  return true;
end; $$;

-- Stage A does not revoke existing or default privileges. Each privileged
-- operation enforces identity and authorization internally; privilege cutover
-- belongs to Stage B after staging verification.
grant execute on function public.has_platform_permission(text) to authenticated;
grant execute on function public.get_security_feature_flags() to anon, authenticated;
grant execute on function public.create_secure_checkout(jsonb,jsonb,text,text) to authenticated;
grant execute on function public.finalize_secure_payment_intent(uuid,text,text) to authenticated, service_role;
grant execute on function public.get_secure_payment_intent(uuid) to authenticated;
grant execute on function public.get_secure_payment_status(uuid) to authenticated;
grant execute on function public.release_secure_inventory_reservations(uuid,text) to authenticated;
grant execute on function public.secure_transition_order(bigint,text) to authenticated;
grant execute on function public.secure_upsert_push_subscription(text,jsonb,text) to authenticated;
grant execute on function public.secure_update_inventory(bigint,integer,text) to authenticated;
grant execute on function public.secure_create_platform_notification(text,text,text,text,text,text) to authenticated;
grant execute on function public.secure_create_cod_settlement(bigint) to authenticated;
grant execute on function public.record_partner_location_v2(bigint,numeric,numeric,numeric) to authenticated;
