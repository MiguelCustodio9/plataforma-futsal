-- Módulo Configurações da plataforma — dados globais, versões de identidade e auditoria.
-- Aplicar manualmente no SQL Editor do Supabase após rever o projeto.
-- Não executar remotamente a partir deste workflow.

create table if not exists public.platform_settings (
  singleton boolean primary key default true check (singleton),
  club_name text not null default '' check (char_length(club_name) <= 160),
  club_emblem_path text,
  club_colors jsonb not null default '{}'::jsonb check (jsonb_typeof(club_colors) = 'object'),
  team_name text not null default '' check (char_length(team_name) <= 160),
  team_emblem_path text,
  team_colors jsonb not null default '{}'::jsonb check (jsonb_typeof(team_colors) = 'object'),
  country text not null default 'Portugal' check (char_length(country) <= 120),
  locality text not null default '' check (char_length(locality) <= 160),
  timezone text not null default 'Europe/Lisbon' check (char_length(timezone) between 1 and 80),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.platform_settings enable row level security;
revoke all on table public.platform_settings from public, anon, authenticated;
grant select, update on table public.platform_settings to authenticated;

drop policy if exists "platform_settings_admin_select" on public.platform_settings;
create policy "platform_settings_admin_select"
on public.platform_settings for select to authenticated
using (public.current_user_has_role('administrador_principal'::public.app_role));

drop policy if exists "platform_settings_admin_update" on public.platform_settings;
create policy "platform_settings_admin_update"
on public.platform_settings for update to authenticated
using (public.current_user_has_role('administrador_principal'::public.app_role))
with check (public.current_user_has_role('administrador_principal'::public.app_role));

create table if not exists public.platform_identity_versions (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('clube', 'equipa')),
  entity_name text not null,
  emblem_path text,
  colors jsonb not null default '{}'::jsonb check (jsonb_typeof(colors) = 'object'),
  effective_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null
);

alter table public.platform_identity_versions enable row level security;
revoke all on table public.platform_identity_versions from public, anon, authenticated;
grant select on table public.platform_identity_versions to authenticated;

drop policy if exists "platform_identity_versions_admin_select" on public.platform_identity_versions;
create policy "platform_identity_versions_admin_select"
on public.platform_identity_versions for select to authenticated
using (public.current_user_has_role('administrador_principal'::public.app_role));

create table if not exists public.platform_settings_audit (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  setting_key text not null,
  previous_value jsonb,
  new_value jsonb,
  outcome text not null default 'concluida' check (outcome in ('concluida', 'falhada')),
  created_at timestamptz not null default now()
);

create index if not exists platform_settings_audit_created_idx
  on public.platform_settings_audit(created_at desc);
create index if not exists platform_settings_audit_actor_idx
  on public.platform_settings_audit(actor_profile_id, created_at desc);

alter table public.platform_settings_audit enable row level security;
revoke all on table public.platform_settings_audit from public, anon, authenticated;
grant select on table public.platform_settings_audit to authenticated;

drop policy if exists "platform_settings_audit_admin_select" on public.platform_settings_audit;
create policy "platform_settings_audit_admin_select"
on public.platform_settings_audit for select to authenticated
using (public.current_user_has_role('administrador_principal'::public.app_role));

create or replace function public.platform_settings_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists platform_settings_before_update on public.platform_settings;
create trigger platform_settings_before_update
before update on public.platform_settings
for each row execute function public.platform_settings_before_update();

create or replace function public.platform_settings_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_old jsonb;
  v_new jsonb;
begin
  for v_key in
    select key
    from jsonb_object_keys(to_jsonb(new)) as keys(key)
    where key not in ('singleton', 'updated_by', 'created_at', 'updated_at')
  loop
    v_old := to_jsonb(old) -> v_key;
    v_new := to_jsonb(new) -> v_key;
    if v_old is distinct from v_new then
      insert into public.platform_settings_audit(actor_profile_id, setting_key, previous_value, new_value)
      values (auth.uid(), v_key, v_old, v_new);
    end if;
  end loop;

  if old.club_name is distinct from new.club_name
     or old.club_emblem_path is distinct from new.club_emblem_path
     or old.club_colors is distinct from new.club_colors then
    insert into public.platform_identity_versions(entity_type, entity_name, emblem_path, colors, changed_by)
    values ('clube', new.club_name, new.club_emblem_path, new.club_colors, auth.uid());
  end if;

  if old.team_name is distinct from new.team_name
     or old.team_emblem_path is distinct from new.team_emblem_path
     or old.team_colors is distinct from new.team_colors then
    insert into public.platform_identity_versions(entity_type, entity_name, emblem_path, colors, changed_by)
    values ('equipa', new.team_name, new.team_emblem_path, new.team_colors, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists platform_settings_after_update on public.platform_settings;
create trigger platform_settings_after_update
after update on public.platform_settings
for each row execute function public.platform_settings_after_update();

-- Captura a identidade inicial para que a primeira alteração também preserve a versão anterior.
insert into public.platform_identity_versions(entity_type, entity_name, emblem_path, colors)
select 'clube', club_name, club_emblem_path, club_colors
from public.platform_settings
where singleton = true
  and not exists (select 1 from public.platform_identity_versions where entity_type = 'clube');

insert into public.platform_identity_versions(entity_type, entity_name, emblem_path, colors)
select 'equipa', team_name, team_emblem_path, team_colors
from public.platform_settings
where singleton = true
  and not exists (select 1 from public.platform_identity_versions where entity_type = 'equipa');

comment on table public.platform_settings is
  'Configurações globais editáveis exclusivamente pelo Administrador Principal.';
comment on table public.platform_identity_versions is
  'Versões imutáveis da identidade do clube e equipa para preservar a evolução histórica.';
comment on table public.platform_settings_audit is
  'Histórico imutável das alterações às configurações globais.';
