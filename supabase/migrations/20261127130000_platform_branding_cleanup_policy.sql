-- Permite ao Administrador remover apenas uploads novos em caso de falha ao guardar.
-- Os restantes perfis não podem eliminar ficheiros do bucket de identidade.

drop policy if exists "platform_branding_admin_delete" on storage.objects;
create policy "platform_branding_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'platform-branding'
  and (storage.foldername(name))[1] in ('clube', 'equipa')
  and public.current_user_has_role('administrador_principal'::public.app_role)
);
