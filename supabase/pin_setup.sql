-- One-time PIN setup links (Elle's staff and any self-set-PIN user). Applied as migration "pin_setup_links".
-- Only SHA-256 hashes of tokens are stored; PINs never reach the server (the phone sends salted PIN hashes only).
create table if not exists public.moes_pin_tokens(
  staff_id text primary key,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  fails int not null default 0,
  created_at timestamptz not null default now());
alter table public.moes_pin_tokens enable row level security;   -- no policies: no direct access for anon/authenticated
revoke all on public.moes_pin_tokens from anon, authenticated;

-- POS (signed-in 'pos' session, owner PIN checked in the app) issues/regenerates a link: clears the PIN until it is set.
create or replace function public.moes_issue_pin_token(p_staff text, p_token_hash text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare exp timestamptz := now() + interval '7 days';
begin
  if not public.is_pos() then raise exception 'not allowed'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;
  if not exists(select 1 from public.moes_records where id='staff:'||p_staff and data->>'role' <> 'owner') then raise exception 'unknown staff'; end if;
  insert into public.moes_pin_tokens(staff_id,token_hash,expires_at) values(p_staff,p_token_hash,exp)
    on conflict(staff_id) do update set token_hash=excluded.token_hash, expires_at=excluded.expires_at, used_at=null, fails=0, created_at=now();
  update public.moes_records set data = data || jsonb_build_object('pinHash',null,'needsSetup',true,'mustChangePin',false,'updatedAt',(extract(epoch from clock_timestamp())*1000)::bigint),
    updated_at=(extract(epoch from clock_timestamp())*1000)::bigint where id='staff:'||p_staff;
  return exp;
end $$;

-- Setup page (anon): who is this link for? Also returns staff ids so the phone can salt-hash the PIN per id for the collision check.
create or replace function public.moes_setpin_info(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.moes_pin_tokens; nm text;
begin
  select * into t from public.moes_pin_tokens where token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex');
  if t is null or t.used_at is not null or t.expires_at < now() then raise exception 'This link is invalid or has expired. Ask the owner for a new one.'; end if;
  select data->>'name' into nm from public.moes_records where id='staff:'||t.staff_id;
  return jsonb_build_object('name',nm,'ids',(select jsonb_agg(data->>'id') from public.moes_records where store='staff'));
end $$;

-- Setup page (anon): p_hashes = {staffId: hashPin(pin,'moes:'+staffId)} for every staff id. Sets the PIN hash and burns the token.
create or replace function public.moes_set_pin(p_token text, p_hashes jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.moes_pin_tokens; h text; nowms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  select * into t from public.moes_pin_tokens where token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') for update;
  if t is null or t.used_at is not null or t.expires_at < now() then raise exception 'This link is invalid or has expired. Ask the owner for a new one.'; end if;
  h := p_hashes->>t.staff_id;
  if h is null or h !~ '^[A-Za-z0-9+/]{43}=$' then raise exception 'bad request'; end if;
  if exists(select 1 from public.moes_records r where r.store='staff' and r.data->>'id' <> t.staff_id and coalesce((r.data->>'active')::boolean,true)
            and r.data->>'pinHash' is not null and r.data->>'pinHash' = p_hashes->>(r.data->>'id')) then
    update public.moes_pin_tokens set fails=fails+1, used_at=case when fails+1>=5 then now() else null end where staff_id=t.staff_id;
    return 'taken';
  end if;
  update public.moes_records set data = data || jsonb_build_object('pinHash',h,'needsSetup',false,'mustChangePin',false,'pinSetAt',nowms,'updatedAt',nowms), updated_at=nowms
    where id='staff:'||t.staff_id;
  update public.moes_pin_tokens set used_at=now() where staff_id=t.staff_id;
  return 'ok';
end $$;
revoke all on function public.moes_issue_pin_token(text,text) from public, anon;
grant execute on function public.moes_issue_pin_token(text,text) to authenticated;
revoke all on function public.moes_setpin_info(text) from public;
revoke all on function public.moes_set_pin(text,jsonb) from public;
grant execute on function public.moes_setpin_info(text) to anon, authenticated;
grant execute on function public.moes_set_pin(text,jsonb) to anon, authenticated;
