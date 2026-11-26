-- Permite às Edge Functions ativar um perfil Staff após validar o convite.
-- O acesso é exclusivo do papel interno service_role e limitado à coluna status.
grant update (status) on table public.profiles to service_role;
