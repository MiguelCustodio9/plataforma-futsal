-- Administração — registar também a criação de convites de acesso.
-- Aplicar manualmente no SQL Editor do Supabase depois da migration de auditoria inicial.

alter table public.platform_access_audit
  drop constraint if exists platform_access_audit_event_type_check;

alter table public.platform_access_audit
  add constraint platform_access_audit_event_type_check
  check (event_type in (
    'account_suspended',
    'account_reactivated',
    'account_invited'
  ));
