-- Corrige as permissões por coluna da ficha do Plantel.
-- contact_phone e contact_email foram adicionados depois dos grants iniciais;
-- o formulário envia estes campos também na criação de uma nova atleta.
grant insert (contact_phone, contact_email)
  on table public.players to authenticated;

grant update (contact_phone, contact_email)
  on table public.players to authenticated;
