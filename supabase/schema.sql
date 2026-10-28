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
