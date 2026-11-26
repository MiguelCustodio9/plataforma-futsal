-- Perfis e papéis privados. Aplicar apenas depois de rever o modelo e confirmar o projeto Supabase.
create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum (
    'administrador_principal',
    'treinador_principal',
    'staff',
    'jogadora'
  );
exception
  when duplicate_object then null;
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
exception
  when duplicate_object then null;
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

create or replace function public.set_updated_at()
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
for each row execute function public.set_updated_at();

-- Função de autorização sem recursão nas políticas RLS.
create or replace function public.current_user_has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = required_role
      and p.status = 'ativo'::public.account_status
  );
$$;

revoke all on function public.current_user_has_role(public.app_role) from public, anon;
grant execute on function public.current_user_has_role(public.app_role) to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.current_user_has_role('administrador_principal'::public.app_role)
);

-- Só o próprio utilizador pode alterar o nome apresentado. O papel e o estado
-- não são concedidos para atualização pelo cliente.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "profiles_update_own_display_name" on public.profiles;
create policy "profiles_update_own_display_name"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Estado de utilização única do bootstrap. Sem acesso direto pelo cliente.
create table if not exists public.initial_admin_bootstrap (
  singleton boolean primary key default true check (singleton),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.initial_admin_bootstrap(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.initial_admin_bootstrap enable row level security;
revoke all on table public.initial_admin_bootstrap from public, anon, authenticated;

-- Só a Edge Function, através da service role, pode atribuir este papel.
create or replace function public.bootstrap_first_admin(
  p_user_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumed_at timestamptz;
begin
  if p_user_id is null or p_display_name is null
     or length(trim(p_display_name)) not between 1 and 120 then
    raise exception 'invalid bootstrap input';
  end if;

  -- Serializa chamadas concorrentes; apenas uma poderá concluir o bootstrap.
  perform pg_advisory_xact_lock(hashtextextended('platform-first-admin-bootstrap', 0));

  select consumed_at
    into v_consumed_at
    from public.initial_admin_bootstrap
   where singleton = true
   for update;

  if v_consumed_at is not null then
    raise exception 'bootstrap already consumed';
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
     set consumed_at = now()
   where singleton = true
     and consumed_at is null;

  if not found then
    raise exception 'bootstrap already consumed';
  end if;
end;
$$;

revoke all on function public.bootstrap_first_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid, text) to service_role;
