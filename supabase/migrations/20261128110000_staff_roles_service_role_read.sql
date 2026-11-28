-- Permite à Edge Function administrativa consultar as funções permanentes do Staff.
-- A função usa service_role; os restantes papéis mantêm as permissões e políticas RLS existentes.

grant select on table public.staff_member_roles to service_role;
