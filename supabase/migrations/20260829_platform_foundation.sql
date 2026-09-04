-- FlashFit platform foundation (additive, safe to run after the existing SQL files).
-- This migration deliberately does not alter seller_orders, user_orders, payments,
-- authentication, or existing inventory behaviour.

create table if not exists public.platform_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'team', 'shopkeeper', 'delivery_partner', 'customer')),
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_user_roles where user_id = auth.uid() and role = 'admin');
$$;

create table if not exists public.fulfilment_locations (
  id bigserial primary key, name text not null, code text not null unique,
  location_type text not null check (location_type in ('store','dark_store','warehouse','pickup_point','fulfilment_center')),
  address text, pincode text, city text, state text, latitude numeric, longitude numeric,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  opening_time time, closing_time time, service_radius_km numeric, priority integer not null default 100,
  inventory_capable boolean not null default true, delivery_capable boolean not null default false,
  order_capacity integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_fulfilment_locations_service on public.fulfilment_locations(status, pincode, priority);

create table if not exists public.delivery_zones (
  id bigserial primary key, name text not null, code text not null unique, city text, state text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','MAINTENANCE')),
  flash_enabled boolean not null default false, standard_enabled boolean not null default true,
  flash_min_minutes integer, flash_max_minutes integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.delivery_zone_pincodes (
  zone_id bigint not null references public.delivery_zones(id) on delete cascade,
  pincode text not null, primary key (zone_id, pincode)
);
create index if not exists idx_delivery_zone_pincodes_pin on public.delivery_zone_pincodes(pincode);

create table if not exists public.location_inventory (
  id bigserial primary key, location_id bigint not null references public.fulfilment_locations(id) on delete restrict,
  product_id bigint not null, variant_id text, sku text, quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  stock_status text not null default 'ACTIVE' check (stock_status in ('ACTIVE','LOW_STOCK','OUT_OF_STOCK','DAMAGED','RETURNED','IN_TRANSIT')),
  updated_at timestamptz not null default now(), unique(location_id, product_id, variant_id)
);
create index if not exists idx_location_inventory_lookup on public.location_inventory(location_id, product_id);

create table if not exists public.catalog_categories (
  id bigserial primary key, parent_id bigint references public.catalog_categories(id) on delete restrict,
  name text not null, slug text not null unique, description text, image_url text, status text not null default 'ACTIVE', sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.category_attributes (
  id bigserial primary key, category_id bigint not null references public.catalog_categories(id) on delete cascade,
  name text not null, attribute_key text not null, input_type text not null check (input_type in ('text','number','dropdown','multi-select','color','size','checkbox','toggle','date','image','url','rich_text')),
  options jsonb not null default '[]'::jsonb, is_required boolean not null default false, is_searchable boolean not null default false,
  is_filterable boolean not null default false, is_enabled boolean not null default true, sort_order integer not null default 100,
  unique(category_id, attribute_key)
);

create table if not exists public.platform_settings (
  setting_key text primary key, value jsonb not null, scope text not null default 'global', location_id bigint references public.fulfilment_locations(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
create table if not exists public.logistics_assignment_weights (
  id bigserial primary key, scope text not null default 'global', location_id bigint references public.fulfilment_locations(id) on delete cascade,
  distance_weight numeric not null default 1, eta_weight numeric not null default 1, workload_weight numeric not null default 1,
  urgency_weight numeric not null default 1, zone_weight numeric not null default 1, capacity_weight numeric not null default 1,
  active boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.delivery_location_samples (
  id bigserial primary key, partner_id bigint not null, order_id bigint not null, latitude numeric not null, longitude numeric not null,
  accuracy_meters numeric, recorded_at timestamptz not null default now()
);
create index if not exists idx_delivery_location_samples_order on public.delivery_location_samples(order_id, recorded_at desc);

-- Returns flash only when a configured active zone, a delivery-capable location,
-- and positive local available stock all exist. Otherwise standard stays available.
create or replace function public.get_delivery_quote(p_customer_pincode text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_zone public.delivery_zones%rowtype; v_location_id bigint; v_missing_stock boolean;
begin
  select z.* into v_zone from public.delivery_zones z join public.delivery_zone_pincodes zp on zp.zone_id = z.id
   where zp.pincode = trim(p_customer_pincode) and z.status = 'ACTIVE' limit 1;
  if not found or not v_zone.flash_enabled then return jsonb_build_object('mode','STANDARD','eligible',false,'reason','No active flash-delivery zone'); end if;
  select l.id into v_location_id from public.fulfilment_locations l
   where l.status = 'ACTIVE' and l.delivery_capable and (l.pincode = trim(p_customer_pincode) or l.service_radius_km is not null)
   order by l.priority asc limit 1;
  if v_location_id is null then return jsonb_build_object('mode','STANDARD','eligible',false,'reason','No eligible fulfilment location'); end if;
  select exists(select 1 from jsonb_array_elements(p_items) i where not exists (
    select 1 from public.location_inventory li where li.location_id = v_location_id and li.product_id = (i->>'product_id')::bigint
      and li.quantity > li.reserved_quantity and li.stock_status = 'ACTIVE')) into v_missing_stock;
  if v_missing_stock then return jsonb_build_object('mode','STANDARD','eligible',false,'reason','Local inventory unavailable'); end if;
  return jsonb_build_object('mode','FLASH','eligible',true,'location_id',v_location_id,'min_minutes',v_zone.flash_min_minutes,'max_minutes',v_zone.flash_max_minutes);
end; $$;

-- The client may record a position only for its own delivery-partner role and only
-- for an assigned active order. Direct writes to the samples table stay blocked.
create or replace function public.record_partner_location(p_order_id bigint, p_latitude numeric, p_longitude numeric, p_accuracy_meters numeric default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_partner_id bigint;
begin
  select dp.id into v_partner_id from public.delivery_partners dp join public.platform_user_roles r on r.user_id = auth.uid()
   where r.role = 'delivery_partner' and (to_jsonb(dp)->>'user_id' = auth.uid()::text or to_jsonb(dp)->>'auth_user_id' = auth.uid()::text) limit 1;
  if v_partner_id is null then raise exception 'Delivery partner authentication required'; end if;
  if not exists (select 1 from public.seller_orders so where so.id = p_order_id and so.delivery_partner_id = v_partner_id and lower(coalesce(so.order_status,'')) in ('assigned','accepted','packed','out_for_delivery')) then
    raise exception 'No active assigned delivery';
  end if;
  insert into public.delivery_location_samples(partner_id, order_id, latitude, longitude, accuracy_meters) values (v_partner_id,p_order_id,p_latitude,p_longitude,p_accuracy_meters);
  return true;
end; $$;

alter table public.platform_user_roles enable row level security;
alter table public.fulfilment_locations enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.delivery_zone_pincodes enable row level security;
alter table public.location_inventory enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.category_attributes enable row level security;
alter table public.platform_settings enable row level security;
alter table public.logistics_assignment_weights enable row level security;
alter table public.delivery_location_samples enable row level security;

create policy "public reads active delivery zones" on public.delivery_zones for select using (status = 'ACTIVE');
create policy "public reads active zone pincodes" on public.delivery_zone_pincodes for select using (exists (select 1 from public.delivery_zones z where z.id = zone_id and z.status = 'ACTIVE'));
create policy "public reads published catalog categories" on public.catalog_categories for select using (status = 'ACTIVE');
create policy "public reads enabled category attributes" on public.category_attributes for select using (is_enabled);
create policy "admins manage platform roles" on public.platform_user_roles for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage locations" on public.fulfilment_locations for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage zones" on public.delivery_zones for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage zone pincodes" on public.delivery_zone_pincodes for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage location inventory" on public.location_inventory for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage catalog categories" on public.catalog_categories for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage category attributes" on public.category_attributes for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage platform settings" on public.platform_settings for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins manage logistics weights" on public.logistics_assignment_weights for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins view delivery location samples" on public.delivery_location_samples for select using (public.is_platform_admin());

grant execute on function public.get_delivery_quote(text, jsonb) to anon, authenticated;
grant execute on function public.record_partner_location(bigint, numeric, numeric, numeric) to authenticated;
