-- Permissões mínimas para as Edge Functions de convites.
-- O papel service_role é usado exclusivamente no servidor e continua sujeito
-- às permissões SQL da tabela, apesar de ignorar as políticas RLS.

grant usage on schema public to service_role;

grant select, insert, delete
  on table public.profiles
  to service_role;

grant select, update
  on table public.staff_members
  to service_role;
