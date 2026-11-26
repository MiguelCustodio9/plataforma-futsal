-- Perfis e papéis privados. Aplicar apenas depois de rever o modelo e confirmar o projeto Supabase.
do $$
begin
  create type public.app_role as enum (
    'administrador_principal',
    'treinador_principal',
    'staff',
    'jogadora'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.account_status as enum (
    'ativo',
    'convite_pendente',
    'suspenso',
    'arquivado'
  );
exception when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  role public.app_role not null default 'jogadora',
  status public.account_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);
alter table public.profiles enable row level security;

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.profiles_set_updated_at();

create or replace function public.current_user_has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = required_role
      and p.status = 'ativo'::public.account_status
  );
$$;

revoke all on function public.current_user_has_role(public.app_role) from public, anon;
grant execute on function public.current_user_has_role(public.app_role) to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.current_user_has_role('administrador_principal'::public.app_role)
);

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "profiles_update_own_display_name" on public.profiles;
create policy "profiles_update_own_display_name"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create table if not exists public.initial_admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  consumed_at timestamptz,
  reserved_at timestamptz,
  reservation_token uuid,
  created_at timestamptz not null default now(),
  constraint initial_admin_reservation_pair check (
    (reserved_at is null and reservation_token is null)
    or (reserved_at is not null and reservation_token is not null)
  )
);

insert into public.initial_admin_bootstrap(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.initial_admin_bootstrap enable row level security;
revoke all on table public.initial_admin_bootstrap from public, anon, authenticated;

-- Reserva o bootstrap antes de enviar o convite. A reserva expira após 15 minutos.
create or replace function public.reserve_initial_admin_bootstrap()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumed_at timestamptz;
  v_reserved_at timestamptz;
  v_token uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('platform-first-admin-bootstrap', 0));

  select consumed_at, reserved_at
    into v_consumed_at, v_reserved_at
    from public.initial_admin_bootstrap
   where singleton = true
   for update;

  if v_consumed_at is not null then
    raise exception 'bootstrap already consumed';
  end if;

  if v_reserved_at is not null and v_reserved_at > now() - interval '15 minutes' then
    raise exception 'bootstrap currently reserved';
  end if;

  if exists (
    select 1 from public.profiles
    where role = 'administrador_principal'::public.app_role
  ) then
    raise exception 'initial administrator already exists';
  end if;

  update public.initial_admin_bootstrap
     set reserved_at = now(), reservation_token = v_token
   where singleton = true;

  return v_token;
end;
$$;

create or replace function public.complete_initial_admin_bootstrap(
  p_reservation_token uuid,
  p_user_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reservation_token is null or p_user_id is null
     or p_display_name is null
     or length(trim(p_display_name)) not between 1 and 120 then
    raise exception 'invalid bootstrap input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-first-admin-bootstrap', 0));

  perform 1
    from public.initial_admin_bootstrap
   where singleton = true
     and consumed_at is null
     and reservation_token = p_reservation_token
     and reserved_at > now() - interval '15 minutes'
   for update;

  if not found then
    raise exception 'bootstrap reservation invalid or expired';
  end if;

  if exists (
    select 1 from public.profiles
    where role = 'administrador_principal'::public.app_role
  ) then
    raise exception 'initial administrator already exists';
  end if;

  insert into public.profiles(id, display_name, role, status)
  values (
    p_user_id,
    trim(p_display_name),
    'administrador_principal'::public.app_role,
    'ativo'::public.account_status
  );

  update public.initial_admin_bootstrap
     set consumed_at = now(), reserved_at = null, reservation_token = null
   where singleton = true
     and reservation_token = p_reservation_token;

  if not found then
    raise exception 'bootstrap reservation lost';
  end if;
end;
$$;

create or replace function public.release_initial_admin_bootstrap(p_reservation_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.initial_admin_bootstrap
     set reserved_at = null, reservation_token = null
   where singleton = true
     and consumed_at is null
     and reservation_token = p_reservation_token;
end;
$$;

revoke all on function public.reserve_initial_admin_bootstrap() from public, anon, authenticated;
revoke all on function public.complete_initial_admin_bootstrap(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_initial_admin_bootstrap(uuid) from public, anon, authenticated;
grant execute on function public.reserve_initial_admin_bootstrap() to service_role;
grant execute on function public.complete_initial_admin_bootstrap(uuid, uuid, text) to service_role;
grant execute on function public.release_initial_admin_bootstrap(uuid) to service_role;
