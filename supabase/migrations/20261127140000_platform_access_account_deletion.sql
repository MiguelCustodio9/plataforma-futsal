-- Permitir auditar a eliminação de contas de acesso sem apagar a ficha desportiva.
alter table public.platform_access_audit
  drop constraint if exists platform_access_audit_event_type_check;

alter table public.platform_access_audit
  add constraint platform_access_audit_event_type_check
  check (event_type in (
    'account_suspended',
    'account_reactivated',
    'account_invited',
    'account_invite_resent',
    'account_deleted'
  ));
