-- FlashFit Shopkeeper Product Details edit fields
-- Run in Supabase SQL Editor if product edit returns schema cache / missing column errors.

alter table public.shopkeeper_products add column if not exists cost_price numeric default 0;
alter table public.shopkeeper_products add column if not exists image_url_2 text;
alter table public.shopkeeper_products add column if not exists image_url_3 text;
alter table public.shopkeeper_products add column if not exists image_url_4 text;
alter table public.shopkeeper_products add column if not exists print_pattern text;
alter table public.shopkeeper_products add column if not exists fit_type text;
alter table public.shopkeeper_products add column if not exists sleeve_type text;
alter table public.shopkeeper_products add column if not exists neck_type text;
alter table public.shopkeeper_products add column if not exists occasion text;
alter table public.shopkeeper_products add column if not exists care_instructions text;
alter table public.shopkeeper_products add column if not exists size_chart text;
alter table public.shopkeeper_products add column if not exists updated_at timestamptz default now();
