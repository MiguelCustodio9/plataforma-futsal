-- Administração — auditoria das alterações ao estado das contas.
-- Aplicar manualmente no SQL Editor do Supabase. Não executar migrations anteriores.

create table if not exists public.platform_access_audit (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid references public.profiles(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('account_suspended', 'account_reactivated')),
  previous_status public.account_status not null,
  new_status public.account_status not null,
  created_at timestamptz not null default now()
);

create index if not exists platform_access_audit_target_created_idx
  on public.platform_access_audit (target_profile_id, created_at desc);
create index if not exists platform_access_audit_actor_created_idx
  on public.platform_access_audit (actor_profile_id, created_at desc);

alter table public.platform_access_audit enable row level security;
revoke all on table public.platform_access_audit from public, anon, authenticated;
grant insert, select on table public.platform_access_audit to service_role;

comment on table public.platform_access_audit is
  'Auditoria de suspensão e reativação de contas executadas pelo Administrador Principal.';
