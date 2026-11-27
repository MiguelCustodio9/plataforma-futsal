-- Reforço de permissões e armazenamento privado dos emblemas da plataforma.
-- Aplicar manualmente no SQL Editor depois de 20261127100000_platform_settings.sql.

revoke update on table public.platform_settings from authenticated;
grant update (
  club_name, club_emblem_path, club_colors,
  team_name, team_emblem_path, team_colors,
  country, locality, timezone
) on table public.platform_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-branding',
  'platform-branding',
  false,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 3145728,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "platform_branding_admin_select" on storage.objects;
create policy "platform_branding_admin_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'platform-branding'
  and (storage.foldername(name))[1] in ('clube', 'equipa')
  and public.current_user_has_role('administrador_principal'::public.app_role)
);

drop policy if exists "platform_branding_admin_insert" on storage.objects;
create policy "platform_branding_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'platform-branding'
  and (storage.foldername(name))[1] in ('clube', 'equipa')
  and public.current_user_has_role('administrador_principal'::public.app_role)
);

revoke all on function public.platform_settings_before_update() from public, anon, authenticated;
revoke all on function public.platform_settings_after_update() from public, anon, authenticated;
