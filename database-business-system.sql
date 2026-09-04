-- FlashFit business extension schema.
-- Run after database-notifications.sql. This does not alter existing business logic.

alter table public.shops add column if not exists is_open boolean default true;
alter table public.shops add column if not exists shop_open boolean default true;

alter table public.shopkeeper_products add column if not exists inventory_buffer_enabled boolean default false;
alter table public.shopkeeper_products add column if not exists inventory_buffer_qty integer default 0;
alter table public.shopkeeper_products add column if not exists online_stock_qty integer;

create table if not exists public.shop_wallets (
  id bigserial primary key,
  shop_id bigint not null unique,
  pending_commission numeric not null default 0,
  paid_commission numeric not null default 0,
  cod_collection numeric not null default 0,
  online_collection numeric not null default 0,
  wallet_balance numeric not null default 0,
  last_settlement_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cod_cash_settlements (
  id bigserial primary key,
  order_id bigint not null unique,
  order_number text,
  customer_id text,
  shop_id bigint,
  delivery_partner_id bigint,
  settlement_otp text,
  cod_amount numeric not null default 0,
  delivery_charge numeric not null default 0,
  flashfit_commission numeric not null default 0,
  shopkeeper_keeps numeric not null default 0,
  settlement_time timestamptz,
  settlement_status text not null default 'cash_collected',
  audit_log jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cod_cash_settlements_shop on public.cod_cash_settlements (shop_id, settlement_status, created_at desc);
create index if not exists idx_cod_cash_settlements_partner on public.cod_cash_settlements (delivery_partner_id, settlement_status, created_at desc);

create table if not exists public.wallet_transactions (
  id bigserial primary key,
  shop_id bigint,
  partner_id bigint,
  user_id text,
  order_id bigint,
  order_number text,
  amount numeric not null default 0,
  transaction_type text not null,
  status text not null default 'recorded',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_transactions_shop on public.wallet_transactions (shop_id, created_at desc);
create index if not exists idx_wallet_transactions_partner on public.wallet_transactions (partner_id, created_at desc);

create table if not exists public.shop_weekly_settlements (
  id bigserial primary key,
  shop_id bigint not null,
  week_start date,
  week_end date,
  total_orders integer not null default 0,
  cod_orders integer not null default 0,
  online_orders integer not null default 0,
  delivery_charges numeric not null default 0,
  flashfit_commission numeric not null default 0,
  amount_paid numeric not null default 0,
  pending_amount numeric not null default 0,
  settlement_status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.flashfit_audit_logs (
  id bigserial primary key,
  action text not null,
  role text,
  user_label text,
  order_id bigint,
  order_number text,
  ip_address text,
  device text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.shop_wallets enable row level security;
alter table public.cod_cash_settlements enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.shop_weekly_settlements enable row level security;
alter table public.flashfit_audit_logs enable row level security;

drop policy if exists "flashfit business extension client access" on public.shop_wallets;
create policy "flashfit business extension client access" on public.shop_wallets for all using (true) with check (true);

drop policy if exists "flashfit cod settlement client access" on public.cod_cash_settlements;
create policy "flashfit cod settlement client access" on public.cod_cash_settlements for all using (true) with check (true);

drop policy if exists "flashfit wallet transaction client access" on public.wallet_transactions;
create policy "flashfit wallet transaction client access" on public.wallet_transactions for all using (true) with check (true);

drop policy if exists "flashfit weekly settlement client access" on public.shop_weekly_settlements;
create policy "flashfit weekly settlement client access" on public.shop_weekly_settlements for all using (true) with check (true);

drop policy if exists "flashfit audit client access" on public.flashfit_audit_logs;
create policy "flashfit audit client access" on public.flashfit_audit_logs for all using (true) with check (true);
