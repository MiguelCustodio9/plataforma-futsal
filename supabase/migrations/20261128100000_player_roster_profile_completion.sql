-- Conclusão da ficha do Plantel: antropometria, contactos EE e estatísticas de carreira.
-- Inclui golos sofridos para atletas com posição de guarda-redes.

alter table public.players
  add column if not exists weight_kg numeric(5,2),
  add column if not exists height_cm numeric(5,2),
  add column if not exists bmi numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_weight_range') then
    alter table public.players add constraint players_weight_range
      check (weight_kg is null or weight_kg between 1 and 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_height_range') then
    alter table public.players add constraint players_height_range
      check (height_cm is null or height_cm between 50 and 250);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_weight_height_pair') then
    alter table public.players add constraint players_weight_height_pair
      check ((weight_kg is null and height_cm is null) or (weight_kg is not null and height_cm is not null));
  end if;
end
$$;

create or replace function public.players_calculate_bmi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.weight_kg is not null and new.height_cm is not null and new.height_cm > 0 then
    new.bmi := round((new.weight_kg / ((new.height_cm / 100) * (new.height_cm / 100)))::numeric, 2);
  else
    new.bmi := null;
  end if;
  return new;
end;
$$;

drop trigger if exists players_calculate_bmi on public.players;
create trigger players_calculate_bmi
before insert or update of weight_kg, height_cm on public.players
for each row execute function public.players_calculate_bmi();

grant insert (weight_kg, height_cm) on public.players to authenticated;
grant update (weight_kg, height_cm) on public.players to authenticated;

-- Reforça a regra das posições também na base de dados.
alter table public.players drop constraint if exists players_positions_valid;
alter table public.players add constraint players_positions_valid check (
  positions <@ array['GR','Fixo','Ala','Pivot','Universal']::text[]
  and cardinality(positions) between 1 and 2
  and (cardinality(positions) < 2 or positions[1] <> positions[2])
  and (not ('Universal' = any(positions)) or cardinality(positions) = 1)
);

-- Um registo por atleta: pai, mãe e email do encarregado de educação.
create table if not exists public.player_guardian_contacts (
  player_id uuid primary key references public.players(id) on delete cascade,
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

drop trigger if exists player_guardian_contacts_audit on public.player_guardian_contacts;
create trigger player_guardian_contacts_audit
before insert or update on public.player_guardian_contacts
for each row execute function public.player_related_set_audit_fields();

alter table public.player_guardian_contacts enable row level security;
revoke all on public.player_guardian_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.player_guardian_contacts to authenticated;

drop policy if exists player_guardian_contacts_read on public.player_guardian_contacts;
create policy player_guardian_contacts_read
on public.player_guardian_contacts for select to authenticated
using (
  public.current_user_can_read_players()
  or exists (
    select 1 from public.players p
    where p.id = player_id and p.profile_id = (select auth.uid())
  )
);

drop policy if exists player_guardian_contacts_manage on public.player_guardian_contacts;
create policy player_guardian_contacts_manage
on public.player_guardian_contacts for all to authenticated
using (public.current_user_can_manage_players())
with check (public.current_user_can_manage_players());

-- Estatísticas manuais do percurso anterior. As estatísticas da época atual
-- serão alimentadas automaticamente pelo módulo de jogos.
alter table public.player_career_history
  add column if not exists games_played integer,
  add column if not exists goals integer,
  add column if not exists assists integer,
  add column if not exists goals_conceded integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_career_stats_nonnegative') then
    alter table public.player_career_history add constraint player_career_stats_nonnegative
      check (
        (games_played is null or games_played >= 0)
        and (goals is null or goals >= 0)
        and (assists is null or assists >= 0)
        and (goals_conceded is null or goals_conceded >= 0)
      );
  end if;
end
$$;

revoke all on function public.players_calculate_bmi() from public, anon, authenticated;
