-- AuthMail MVP: aplicar APENAS em projeto Supabase NOVO e exclusivo.
-- Nunca executar em ImobPro, ZapOS ou banco de produção existente.
begin;

create table if not exists public.authmail_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  address text not null unique,
  kind text not null check (kind in ('temporary','permanent')),
  label text not null default '' check (char_length(label) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint authmail_address_normalized check (address = lower(address)),
  constraint authmail_kind_expiry check (
    (kind = 'temporary' and expires_at is not null)
    or (kind = 'permanent' and expires_at is null)
  )
);

create index if not exists authmail_aliases_owner_date_idx
  on public.authmail_aliases(owner_id, created_at desc);

create table if not exists public.authmail_messages (
  id uuid primary key default gen_random_uuid(),
  alias_id uuid not null references public.authmail_aliases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_email_id text not null,
  from_address text not null default '',
  subject text not null default '',
  body_text text not null default '',
  otp_code text,
  received_at timestamptz not null default now(),
  unique(alias_id,provider_email_id),
  constraint authmail_code_format check (otp_code is null or otp_code ~ '^[0-9]{4,8}$'),
  constraint authmail_body_length check (char_length(body_text) <= 40000)
);

create index if not exists authmail_messages_alias_date_idx
  on public.authmail_messages(alias_id, received_at desc);

-- Defense in depth: Data API permite apenas SELECT do próprio usuário.
alter table public.authmail_aliases enable row level security;
alter table public.authmail_messages enable row level security;
revoke all on public.authmail_aliases from public, anon, authenticated;
revoke all on public.authmail_messages from public, anon, authenticated;
grant select on public.authmail_aliases to authenticated;
grant select on public.authmail_messages to authenticated;

create policy authmail_aliases_select_own on public.authmail_aliases
  for select to authenticated using (owner_id = (select auth.uid()));
create policy authmail_messages_select_own on public.authmail_messages
  for select to authenticated using (owner_id = (select auth.uid()));

-- Criação atômica server-only: limitação por usuário e 96 bits aleatórios no nome.
-- Segurança da função: EXECUTE revogado para PUBLIC/anon/authenticated;
-- chamada exclusivamente pelo backend com a chave secreta do Supabase.
create or replace function public.authmail_create_alias(
  p_owner uuid, p_domain text, p_kind text,
  p_ttl_minutes integer, p_label text
)
returns public.authmail_aliases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.authmail_aliases;
  v_local text;
  v_expiration timestamptz;
begin
  if p_owner is null or not exists(select 1 from auth.users where id = p_owner) then
    raise exception 'invalid owner' using errcode = 'P0001';
  end if;
  if p_kind not in ('temporary','permanent') or p_domain is null
    or p_domain !~ '^[a-z0-9.-]{4,253}$' or p_domain <> lower(p_domain)
    or p_domain not like '%.%' then
    raise exception 'invalid kind or domain' using errcode = 'P0001';
  end if;
  if (p_kind = 'temporary' and (p_ttl_minutes is null or p_ttl_minutes not in (15,60,1440,10080)))
    or (p_kind = 'permanent' and p_ttl_minutes is not null)
    or char_length(coalesce(p_label,'')) > 80 then
    raise exception 'invalid settings' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_owner::text));
  if (select count(*) from public.authmail_aliases where owner_id = p_owner and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily alias limit reached' using errcode = 'P0001';
  end if;
  if (select count(*) from public.authmail_aliases where owner_id = p_owner and is_active = true
    and (expires_at is null or expires_at > now())) >= 50 then
    raise exception 'active alias limit reached' using errcode = 'P0001';
  end if;

  v_local := 'a' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,24);
  v_expiration := case when p_kind = 'temporary'
    then now() + pg_catalog.make_interval(mins => p_ttl_minutes)
    else null end;

  insert into public.authmail_aliases (owner_id,address,kind,label,expires_at)
  values (p_owner, v_local || '@' || p_domain, p_kind, coalesce(p_label,''), v_expiration)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.authmail_create_alias(uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.authmail_create_alias(uuid,text,text,integer,text) to service_role;
commit;
