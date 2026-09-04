-- FlashFit centralized notification system.
-- Run this once in Supabase SQL editor, then enable Realtime for platform_notifications.

create table if not exists public.platform_notifications (
  id bigserial primary key,
  event_type text not null,
  title text not null,
  body text not null,
  priority text not null default 'normal',
  role text not null check (role in ('admin', 'user', 'shopkeeper', 'delivery_partner')),
  recipient_id text not null,
  actor_role text,
  actor_id text,
  order_id bigint,
  order_number text,
  entity_type text,
  entity_id text,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_notifications_recipient
  on public.platform_notifications (role, recipient_id, read_at, created_at desc);

create index if not exists idx_platform_notifications_event
  on public.platform_notifications (event_type, priority, created_at desc);

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  role text not null check (role in ('admin', 'user', 'shopkeeper', 'delivery_partner')),
  recipient_id text not null,
  user_id text,
  device_id text,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_recipient
  on public.push_subscriptions (role, recipient_id, active);

alter publication supabase_realtime add table public.platform_notifications;

alter table public.platform_notifications enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "notification read insert client" on public.platform_notifications;
create policy "notification read insert client"
on public.platform_notifications
for all
using (true)
with check (true);

drop policy if exists "push subscription client upsert" on public.push_subscriptions;
create policy "push subscription client upsert"
on public.push_subscriptions
for all
using (true)
with check (true);
