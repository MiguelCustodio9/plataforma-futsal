-- Segurança e atividade — permitir à Edge Function consultar a auditoria das configurações.
-- A função usa service_role no servidor; RLS não substitui privilégios SQL da tabela.

grant select on table public.platform_settings_audit to service_role;
