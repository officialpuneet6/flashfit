-- FlashFit Product Visibility & Ranking Management
-- Run this in Supabase SQL Editor before using the admin visibility panel.

alter table public.shopkeeper_products add column if not exists is_visible boolean default true;
alter table public.shopkeeper_products add column if not exists visibility_priority integer default 999;
alter table public.shopkeeper_products add column if not exists visibility_sort_order integer default 999;
alter table public.shopkeeper_products add column if not exists is_featured boolean default false;
alter table public.shopkeeper_products add column if not exists is_trending boolean default false;
alter table public.shopkeeper_products add column if not exists is_new_arrival boolean default false;
alter table public.shopkeeper_products add column if not exists is_best_seller boolean default false;
alter table public.shopkeeper_products add column if not exists is_recommended boolean default false;
alter table public.shopkeeper_products add column if not exists search_priority integer default 999;
alter table public.shopkeeper_products add column if not exists visible_from timestamptz;
alter table public.shopkeeper_products add column if not exists visible_until timestamptz;

alter table public.shops add column if not exists visibility_priority integer default 999;

create table if not exists public.product_category_priorities (
  id bigserial primary key,
  slug text unique not null,
  label text not null,
  sort_order integer default 999,
  is_visible boolean default true,
  updated_at timestamptz default now()
);

insert into public.product_category_priorities (slug, label, sort_order, is_visible)
values
  ('all', 'All', 1, true),
  ('women', 'Women', 2, true),
  ('men', 'Men', 3, true),
  ('kurtis', 'Kurtis', 4, true),
  ('tops', 'Tops', 5, true),
  ('t-shirts', 'T-Shirts', 6, true),
  ('jeans', 'Jeans', 7, true),
  ('dresses', 'Dresses', 8, true),
  ('kids', 'Kids', 9, true),
  ('unisex', 'Unisex', 10, true),
  ('new-arrivals', 'New Arrivals', 11, true),
  ('under-499', 'Under Rs 499', 12, true)
on conflict (slug) do nothing;

alter table public.product_category_priorities enable row level security;

drop policy if exists "flashfit category priority client access" on public.product_category_priorities;
create policy "flashfit category priority client access"
on public.product_category_priorities
for all
using (true)
with check (true);
