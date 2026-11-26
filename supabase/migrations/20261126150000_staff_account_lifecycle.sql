-- Módulo 01 — auditoria de acessos Staff e preservação da ficha.
-- Aplicar manualmente no SQL Editor do Supabase. Não executar migrations anteriores.

alter table public.staff_members
  add column if not exists account_deleted_at timestamptz;

create table if not exists public.staff_account_audit (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid references public.staff_members(id) on delete set null,
  target_auth_user_id uuid,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('invite_resent', 'account_deleted')),
  created_at timestamptz not null default now()
);

create index if not exists staff_account_audit_member_idx
  on public.staff_account_audit (staff_member_id, created_at desc);

alter table public.staff_account_audit enable row level security;
revoke all on table public.staff_account_audit from public, anon, authenticated;
grant insert, select on table public.staff_account_audit to service_role;

revoke all on table public.staff_members from public, anon, authenticated;
grant select on table public.staff_members to authenticated;
grant insert (name, full_name, email, birth_date, photo_path, status)
  on table public.staff_members to authenticated;
grant update (name, full_name, email, birth_date, photo_path, status, invite_sent_at, invite_expires_at, account_deleted_at)
  on table public.staff_members to authenticated;

comment on column public.staff_members.account_deleted_at is
  'Data em que a conta de acesso foi eliminada; a ficha Staff e o histórico são preservados.';
comment on table public.staff_account_audit is
  'Auditoria imutável das operações de reenvio de convite e eliminação de contas Staff.';
