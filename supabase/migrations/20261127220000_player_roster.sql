-- Módulo Plantel — registo permanente das jogadoras.
-- A inscrição por época e a associação à lista central de clubes serão ligadas
-- quando os módulos Épocas e Clubes estiverem implementados.

do $$
begin
  create type public.player_status as enum ('ativa','lesionada','inativa','arquivada');
exception when duplicate_object then null;
end
$$;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  sex text not null check (sex in ('Feminino','Masculino','Outro')),
  positions text[] not null default '{}',
  birth_date date not null,
  birth_country text,
  birth_locality text,
  nationality text not null,
  second_nationality text,
  dominant_foot text not null check (dominant_foot in ('Direito','Esquerdo','Ambidestro')),
  preferred_number smallint check (preferred_number between 1 and 99),
  practice_years smallint check (practice_years between 0 and 80),
  previous_club text,
  other_sports text,
  abdominal_perimeter numeric(5,1) check (abdominal_perimeter between 0 and 300),
  photo_path text,
  status public.player_status not null default 'ativa',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_positions_valid check (
    positions <@ array['GR','Fixo','Ala','Pivot','Universal']::text[]
    and (not ('Universal' = any(positions)) or cardinality(positions) = 1)
  )
);

create index if not exists players_name_lower_idx on public.players (lower(name));
create index if not exists players_status_idx on public.players (status);
create index if not exists players_profile_idx on public.players (profile_id);

create or replace function public.current_user_can_manage_players()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'ativo'::public.account_status
      and p.role = 'treinador_principal'::public.app_role
  );
$$;

create or replace function public.current_user_can_read_players()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'ativo'::public.account_status
      and p.role in ('treinador_principal'::public.app_role, 'staff'::public.app_role)
  );
$$;

create or replace function public.players_set_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.created_by := old.created_by;
    new.updated_by := (select auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists players_set_audit_fields on public.players;
create trigger players_set_audit_fields
before insert or update on public.players
for each row execute function public.players_set_audit_fields();

alter table public.players enable row level security;
revoke all on table public.players from public, anon, authenticated;
grant select on table public.players to authenticated;
grant insert (name, full_name, sex, positions, birth_date, birth_country, birth_locality, nationality, second_nationality, dominant_foot, preferred_number, practice_years, previous_club, other_sports, abdominal_perimeter, photo_path, status, profile_id)
  on public.players to authenticated;
grant update (name, full_name, sex, positions, birth_date, birth_country, birth_locality, nationality, second_nationality, dominant_foot, preferred_number, practice_years, previous_club, other_sports, abdominal_perimeter, photo_path, status, profile_id)
  on public.players to authenticated;

drop policy if exists "players_read_sports_staff_and_self" on public.players;
create policy "players_read_sports_staff_and_self"
on public.players for select to authenticated
using (
  public.current_user_can_read_players()
  or profile_id = (select auth.uid())
);

drop policy if exists "players_insert_trainer_only" on public.players;
create policy "players_insert_trainer_only"
on public.players for insert to authenticated
with check (public.current_user_can_manage_players());

drop policy if exists "players_update_trainer_only" on public.players;
create policy "players_update_trainer_only"
on public.players for update to authenticated
using (public.current_user_can_manage_players())
with check (public.current_user_can_manage_players());

drop policy if exists "players_delete_trainer_only" on public.players;
create policy "players_delete_trainer_only"
on public.players for delete to authenticated
using (public.current_user_can_manage_players());

revoke all on function public.current_user_can_manage_players() from public, anon;
revoke all on function public.current_user_can_read_players() from public, anon;
revoke all on function public.players_set_audit_fields() from public, anon, authenticated;
grant execute on function public.current_user_can_manage_players() to authenticated;
grant execute on function public.current_user_can_read_players() to authenticated;

comment on table public.players is
  'Ficha desportiva permanente da jogadora. Dados específicos de cada época ficam em inscrições de época futuras.';
