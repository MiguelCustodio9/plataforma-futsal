-- Módulo Plantel — aperfeiçoamentos da ficha individual.
-- Mantém os registos antigos de encarregados na tabela legada, sem os apagar.
-- A ficha passa a usar contactos estruturados de pai/mãe e email do EE.

alter table public.players
  add column if not exists weight_kg numeric(6,2),
  add column if not exists height_cm numeric(6,2);

alter table public.players
  add column if not exists bmi numeric(6,2)
  generated always as (
    case
      when weight_kg is not null and height_cm is not null
      then round((weight_kg * 10000) / (height_cm * height_cm), 2)
      else null
    end
  ) stored;

alter table public.players
  drop constraint if exists players_weight_kg_valid,
  add constraint players_weight_kg_valid check (weight_kg is null or weight_kg between 1 and 300),
  drop constraint if exists players_height_cm_valid,
  add constraint players_height_cm_valid check (height_cm is null or height_cm between 50 and 250),
  drop constraint if exists players_positions_max_two,
  add constraint players_positions_max_two
    check (cardinality(positions) <= 2 and (cardinality(positions) < 2 or positions[1] <> positions[2]))
    not valid;

grant insert (weight_kg, height_cm) on public.players to authenticated;
grant update (weight_kg, height_cm) on public.players to authenticated;

alter table public.player_career_history
  add column if not exists games_played integer,
  add column if not exists goals integer,
  add column if not exists assists integer;

alter table public.player_career_history
  drop constraint if exists player_career_games_nonnegative,
  add constraint player_career_games_nonnegative check (games_played is null or games_played >= 0),
  drop constraint if exists player_career_goals_nonnegative,
  add constraint player_career_goals_nonnegative check (goals is null or goals >= 0),
  drop constraint if exists player_career_assists_nonnegative,
  add constraint player_career_assists_nonnegative check (assists is null or assists >= 0);

create table if not exists public.player_guardian_contacts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete cascade,
  father_name text check (father_name is null or length(trim(father_name)) <= 200),
  father_phone text check (father_phone is null or length(trim(father_phone)) <= 40),
  mother_name text check (mother_name is null or length(trim(mother_name)) <= 200),
  mother_phone text check (mother_phone is null or length(trim(mother_phone)) <= 40),
  guardian_email text check (guardian_email is null or length(trim(guardian_email)) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists player_guardian_contacts_player_idx
  on public.player_guardian_contacts(player_id);

drop trigger if exists player_guardian_contacts_set_audit_fields on public.player_guardian_contacts;
create trigger player_guardian_contacts_set_audit_fields
before insert or update on public.player_guardian_contacts
for each row execute function public.player_related_set_audit_fields();

alter table public.player_guardian_contacts enable row level security;
revoke all on public.player_guardian_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.player_guardian_contacts to authenticated;

drop policy if exists "player_guardian_contacts_read_staff_and_self" on public.player_guardian_contacts;
create policy "player_guardian_contacts_read_staff_and_self"
on public.player_guardian_contacts for select to authenticated
using (
  public.current_user_can_read_players()
  or exists (
    select 1 from public.players p
    where p.id = player_id and p.profile_id = (select auth.uid())
  )
);

drop policy if exists "player_guardian_contacts_manage_trainer" on public.player_guardian_contacts;
create policy "player_guardian_contacts_manage_trainer"
on public.player_guardian_contacts for all to authenticated
using (public.current_user_can_manage_players())
with check (public.current_user_can_manage_players());

comment on column public.players.bmi is
  'Índice de Massa Corporal calculado automaticamente a partir do peso (kg) e da altura (cm).';
comment on table public.player_guardian_contacts is
  'Contactos do pai, da mãe e email do Encarregado de Educação. Não cria contas de acesso.';
comment on column public.player_career_history.games_played is
  'Número de jogos realizados pela atleta nesse clube/equipa/época do histórico.';
comment on column public.player_career_history.goals is
  'Número de golos marcados pela atleta nesse clube/equipa/época do histórico.';
comment on column public.player_career_history.assists is
  'Número de assistências da atleta nesse clube/equipa/época do histórico.';
