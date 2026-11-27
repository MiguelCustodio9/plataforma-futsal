-- Módulo Plantel — contactos, encarregados de educação e percurso desportivo.
-- Complementa a ficha permanente existente; não inclui dados técnicos/táticos
-- nem inventa protocolos de avaliação física ainda não confirmados.

alter table public.players
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

create table if not exists public.player_guardians (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  relationship text not null check (length(trim(relationship)) between 1 and 80),
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists player_guardians_player_idx on public.player_guardians(player_id);

create table if not exists public.player_career_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  club_name text not null check (length(trim(club_name)) between 1 and 200),
  team_name text,
  season_label text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint player_career_dates_valid check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists player_career_history_player_idx on public.player_career_history(player_id);

create table if not exists public.player_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  field_name text not null check (length(trim(field_name)) between 1 and 100),
  requested_value text not null check (length(trim(requested_value)) between 1 and 2000),
  status text not null default 'pendente' check (status in ('pendente','aceite','rejeitado')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists player_profile_change_requests_player_idx
  on public.player_profile_change_requests(player_id, created_at desc);

create or replace function public.player_related_set_audit_fields()
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

drop trigger if exists player_guardians_set_audit_fields on public.player_guardians;
create trigger player_guardians_set_audit_fields
before insert or update on public.player_guardians
for each row execute function public.player_related_set_audit_fields();

drop trigger if exists player_career_set_audit_fields on public.player_career_history;
create trigger player_career_set_audit_fields
before insert or update on public.player_career_history
for each row execute function public.player_related_set_audit_fields();

alter table public.player_guardians enable row level security;
alter table public.player_career_history enable row level security;
alter table public.player_profile_change_requests enable row level security;

revoke all on public.player_guardians, public.player_career_history, public.player_profile_change_requests from public, anon, authenticated;
grant select, insert, update, delete on public.player_guardians, public.player_career_history to authenticated;
grant select, insert, update on public.player_profile_change_requests to authenticated;

drop policy if exists "player_guardians_read_staff_and_self" on public.player_guardians;
create policy "player_guardians_read_staff_and_self"
on public.player_guardians for select to authenticated
using (
  public.current_user_can_read_players()
  or exists (
    select 1 from public.players p
    where p.id = player_id and p.profile_id = (select auth.uid())
  )
);

drop policy if exists "player_guardians_manage_trainer" on public.player_guardians;
create policy "player_guardians_manage_trainer"
on public.player_guardians for all to authenticated
using (public.current_user_can_manage_players())
with check (public.current_user_can_manage_players());

drop policy if exists "player_career_read_staff_and_self" on public.player_career_history;
create policy "player_career_read_staff_and_self"
on public.player_career_history for select to authenticated
using (
  public.current_user_can_read_players()
  or exists (
    select 1 from public.players p
    where p.id = player_id and p.profile_id = (select auth.uid())
  )
);

drop policy if exists "player_career_manage_trainer" on public.player_career_history;
create policy "player_career_manage_trainer"
on public.player_career_history for all to authenticated
using (public.current_user_can_manage_players())
with check (public.current_user_can_manage_players());

drop policy if exists "player_profile_requests_read_staff_and_self" on public.player_profile_change_requests;
create policy "player_profile_requests_read_staff_and_self"
on public.player_profile_change_requests for select to authenticated
using (
  public.current_user_can_read_players()
  or requested_by = (select auth.uid())
);

drop policy if exists "player_profile_requests_insert_self" on public.player_profile_change_requests;
create policy "player_profile_requests_insert_self"
on public.player_profile_change_requests for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and exists (
    select 1 from public.players p
    where p.id = player_id and p.profile_id = (select auth.uid())
  )
);

drop policy if exists "player_profile_requests_review_staff" on public.player_profile_change_requests;
create policy "player_profile_requests_review_staff"
on public.player_profile_change_requests for update to authenticated
using (public.current_user_can_read_players())
with check (public.current_user_can_read_players());

revoke all on function public.player_related_set_audit_fields() from public, anon, authenticated;
