-- Segurança e atividade — preservar contexto mínimo das eliminações na auditoria.
alter table public.platform_access_audit
  add column if not exists details jsonb not null default '{}'::jsonb;

comment on column public.platform_access_audit.details is
  'Contexto administrativo não sensível para auditoria, por exemplo nome e email da conta eliminada.';
