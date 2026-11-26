-- Módulo 01 — Staff: registos, funções permanentes e permissões.
-- Aplicar manualmente no SQL Editor do Supabase depois de rever este ficheiro.
-- Não executar novamente a migration inicial nem usar supabase db push.

do $$
begin
  create type public.staff_member_status as enum (
    'pendente',
    'convite_enviado',
    'ativo',
    'suspenso',
    'convite_expirado',
    'arquivado'
  );
exception when duplicate_object then null;
end
$$;

create or replace function public.current_user_can_manage_staff()
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
      and p.status = 'ativo'::public.account_status
      and p.role in (
        'administrador_principal'::public.app_role,
        'treinador_principal'::public.app_role
      )
  );
$$;

revoke all on function public.current_user_can_manage_staff() from public, anon;
grant execute on function public.current_user_can_manage_staff() to authenticated;

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  email text not null check (length(trim(email)) between 3 and 320),
  birth_date date,
  photo_path text,
  status public.staff_member_status not null default 'pendente',
  invite_sent_at timestamptz,
  invite_expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_members_email_lower_uidx
  on public.staff_members (lower(email));
create index if not exists staff_members_status_idx
  on public.staff_members (status);
create index if not exists staff_members_name_lower_idx
  on public.staff_members (lower(name));

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.profiles_set_updated_at();

create table if not exists public.staff_member_roles (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  role_name text not null check (role_name in (
    'Treinador Principal',
    'Treinador Estagiário',
    'Treinador Adjunto',
    'Treinador de GR',
    'Delegado',
    'Presidente',
    'Diretor',
    'Fisioterapeuta',
    'Massagista',
    'Enfermeira',
    'Estagiário'
  )),
  created_at timestamptz not null default now(),
  unique (staff_member_id, role_name)
);

create index if not exists staff_member_roles_member_idx
  on public.staff_member_roles (staff_member_id);

alter table public.staff_members enable row level security;
alter table public.staff_member_roles enable row level security;

revoke all on table public.staff_members from public, anon, authenticated;
revoke all on table public.staff_member_roles from public, anon, authenticated;

grant select, insert, update on table public.staff_members to authenticated;
grant select, insert, delete on table public.staff_member_roles to authenticated;

drop policy if exists "staff_members_read_active_accounts" on public.staff_members;
create policy "staff_members_read_active_accounts"
on public.staff_members for select to authenticated
using (
  exists (
    select 1
    from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.status = 'ativo'::public.account_status
  )
);

drop policy if exists "staff_members_insert_managers" on public.staff_members;
create policy "staff_members_insert_managers"
on public.staff_members for insert to authenticated
with check (
  public.current_user_can_manage_staff()
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "staff_members_update_managers" on public.staff_members;
create policy "staff_members_update_managers"
on public.staff_members for update to authenticated
using (public.current_user_can_manage_staff())
with check (public.current_user_can_manage_staff());

drop policy if exists "staff_member_roles_read_active_accounts" on public.staff_member_roles;
create policy "staff_member_roles_read_active_accounts"
on public.staff_member_roles for select to authenticated
using (
  exists (
    select 1
    from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.status = 'ativo'::public.account_status
  )
);

drop policy if exists "staff_member_roles_insert_managers" on public.staff_member_roles;
create policy "staff_member_roles_insert_managers"
on public.staff_member_roles for insert to authenticated
with check (public.current_user_can_manage_staff());

drop policy if exists "staff_member_roles_delete_managers" on public.staff_member_roles;
create policy "staff_member_roles_delete_managers"
on public.staff_member_roles for delete to authenticated
using (public.current_user_can_manage_staff());

comment on table public.staff_members is
  'Registos privados dos elementos do Staff. A gestão é exclusiva do Administrador Principal e do Treinador Principal.';
comment on table public.staff_member_roles is
  'Funções permanentes de cada elemento do Staff; um elemento pode ter várias funções.';
comment on function public.current_user_can_manage_staff() is
  'Autoriza exclusivamente Administrador Principal e Treinador Principal ativos a gerir o Staff.';
