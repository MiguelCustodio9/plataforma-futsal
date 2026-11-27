-- Métricas agregadas de ocupação atual para o painel de utilização.
-- A função só devolve totais; nunca expõe nomes, caminhos ou metadados dos ficheiros.

create or replace function public.get_platform_usage_storage_snapshot()
returns table (
  database_size_bytes bigint,
  storage_size_bytes bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database())::bigint,
    coalesce(
      (
        select sum(
          case
            when (objects.metadata ->> 'size') ~ '^[0-9]+$'
              then (objects.metadata ->> 'size')::bigint
            else 0
          end
        )
        from storage.objects as objects
      ),
      0
    )::bigint;
$$;

revoke all on function public.get_platform_usage_storage_snapshot() from public;
revoke all on function public.get_platform_usage_storage_snapshot() from anon;
revoke all on function public.get_platform_usage_storage_snapshot() from authenticated;
grant execute on function public.get_platform_usage_storage_snapshot() to service_role;
