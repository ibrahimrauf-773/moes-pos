-- Moe's POS sync table (Supabase free plan). Run in the SQL editor once.
-- Replace CHANGE-ME-SHOP-KEY with a long random secret and enter the same value in Settings → Sync on every device.
create table if not exists public.moes_records(
  id text primary key,            -- "<store>:<uuid>"  (idempotent upserts)
  store text not null,
  device_id text,
  updated_at bigint not null default 0,
  data jsonb not null,
  seq bigserial                   -- pull cursor
);
create index if not exists moes_records_seq on public.moes_records(seq);
-- Every write gets a new seq so other devices pull it; older writes never overwrite newer ones.
create or replace function public.moes_touch() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' and new.updated_at < old.updated_at then return old; end if;
  new.seq := nextval(pg_get_serial_sequence('public.moes_records','seq'));
  return new;
end $$;
drop trigger if exists moes_touch on public.moes_records;
create trigger moes_touch before insert or update on public.moes_records for each row execute function public.moes_touch();
-- Recipes are never synced; refuse them even if a client tries.
alter table public.moes_records drop constraint if exists moes_no_secure;
alter table public.moes_records add constraint moes_no_secure check (store <> 'secure');
-- Row level security: only clients sending the shop key header can read/write.
alter table public.moes_records enable row level security;
create or replace function public.moes_shop_ok() returns boolean language sql stable as $$
  select coalesce((current_setting('request.headers', true)::json ->> 'x-shop-key') = 'CHANGE-ME-SHOP-KEY', false) $$;
drop policy if exists moes_rw on public.moes_records;
create policy moes_rw on public.moes_records for all to anon using (public.moes_shop_ok()) with check (public.moes_shop_ok());
grant select, insert, update on public.moes_records to anon;
grant usage on sequence public.moes_records_seq_seq to anon;

-- ============================================================================
-- PLAN (not applied, not used by the POS yet): online ordering + sold-out sync.
-- Review before running. The POS sold-out toggle will upsert menu_availability;
-- the website reads it. Website inserts into online_orders; POS accepts them.
-- ============================================================================
do $$ begin
  create type public.online_order_status as enum
    ('received','accepted','preparing','ready','out_for_delivery','delivered','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.online_orders(
  id uuid primary key default gen_random_uuid(),
  order_no int,                                   -- assigned by POS on accept
  source text not null default 'website' check (source in ('website','whatsapp','phone')),
  order_type text not null check (order_type in ('delivery','pickup')),
  status public.online_order_status not null default 'received',
  customer_name text not null,
  customer_phone text not null,
  address text, landmark text, map_link text, zone text,
  items jsonb not null,                           -- [{item_id, name, qty, heat, price}]
  notes text,
  subtotal numeric(10,2) not null,
  delivery_charge numeric(10,2) not null default 0,
  discount_kind text check (discount_kind in ('percent','amount','promo')),
  discount_value numeric(10,2) default 0,
  discount_code text,
  discount_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_method text not null default 'cod' check (payment_method in ('cod','bank')),
  payment_proof_url text,                         -- storage path of bank-transfer screenshot
  payment_verified boolean not null default false,
  cancel_reason text,
  received_at timestamptz not null default now(),
  accepted_at timestamptz, preparing_at timestamptz, ready_at timestamptz,
  out_for_delivery_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists online_orders_status_idx on public.online_orders(status, received_at desc);

create table if not exists public.menu_availability(
  item_id text primary key,                       -- matches POS menu item id
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text                                 -- POS staff id who toggled sold-out
);

alter table public.online_orders enable row level security;
alter table public.menu_availability enable row level security;
-- Website (anon): may INSERT orders and SELECT availability only. POS uses moes_shop_ok() for full access.
-- create policy oo_insert on public.online_orders for insert to anon with check (status='received');
-- create policy oo_pos on public.online_orders for all to anon using (public.moes_shop_ok()) with check (public.moes_shop_ok());
-- create policy ma_read on public.menu_availability for select to anon using (true);
-- create policy ma_pos on public.menu_availability for all to anon using (public.moes_shop_ok()) with check (public.moes_shop_ok());
