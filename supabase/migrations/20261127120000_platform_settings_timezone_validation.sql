-- Validação de identificadores de fuso horário IANA no servidor.
-- Aplicar manualmente depois das migrações de configurações.

create or replace function public.platform_settings_validate_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names
    where name = new.timezone
  ) then
    raise exception 'invalid IANA timezone identifier';
  end if;
  return new;
end;
$$;

drop trigger if exists platform_settings_validate_timezone on public.platform_settings;
create trigger platform_settings_validate_timezone
before insert or update of timezone on public.platform_settings
for each row execute function public.platform_settings_validate_timezone();

revoke all on function public.platform_settings_validate_timezone() from public, anon, authenticated;
