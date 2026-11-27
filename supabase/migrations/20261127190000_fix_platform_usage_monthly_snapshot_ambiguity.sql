-- Corrige a ambiguidade entre o parâmetro de saída snapshot_month e a chave da tabela.
-- A função mantém o comportamento de atualização mensal e preserva os meses anteriores.

create or replace function public.record_platform_usage_monthly_snapshot(
  p_database_size_bytes bigint,
  p_storage_size_bytes bigint,
  p_api_requests_count bigint
)
returns table (
  snapshot_month date,
  database_size_bytes bigint,
  storage_size_bytes bigint,
  api_requests_count bigint,
  captured_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := date_trunc('month', now())::date;
begin
  insert into public.platform_usage_monthly_snapshots as existing (
    snapshot_month,
    database_size_bytes,
    storage_size_bytes,
    api_requests_count,
    captured_at
  )
  values (
    current_month,
    p_database_size_bytes,
    p_storage_size_bytes,
    p_api_requests_count,
    now()
  )
  on conflict on constraint platform_usage_monthly_snapshots_pkey do update set
    database_size_bytes = coalesce(excluded.database_size_bytes, existing.database_size_bytes),
    storage_size_bytes = coalesce(excluded.storage_size_bytes, existing.storage_size_bytes),
    api_requests_count = coalesce(excluded.api_requests_count, existing.api_requests_count),
    captured_at = now();

  return query
  select
    s.snapshot_month,
    s.database_size_bytes,
    s.storage_size_bytes,
    s.api_requests_count,
    s.captured_at
  from public.platform_usage_monthly_snapshots as s
  where s.snapshot_month >= (current_month - interval '11 months')::date
  order by s.snapshot_month desc;
end;
$$;

revoke all on function public.record_platform_usage_monthly_snapshot(bigint, bigint, bigint) from public;
revoke all on function public.record_platform_usage_monthly_snapshot(bigint, bigint, bigint) from anon;
revoke all on function public.record_platform_usage_monthly_snapshot(bigint, bigint, bigint) from authenticated;
grant execute on function public.record_platform_usage_monthly_snapshot(bigint, bigint, bigint) to service_role;
