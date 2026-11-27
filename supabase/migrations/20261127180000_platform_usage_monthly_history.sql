-- Histórico mensal persistente de utilização.
-- Cada consulta atualiza o registo do mês em curso; os meses anteriores ficam preservados.

create table if not exists public.platform_usage_monthly_snapshots (
  snapshot_month date primary key,
  database_size_bytes bigint,
  storage_size_bytes bigint,
  api_requests_count bigint,
  captured_at timestamptz not null default now(),
  constraint platform_usage_monthly_snapshots_month_start
    check (extract(day from snapshot_month) = 1),
  constraint platform_usage_monthly_snapshots_nonnegative
    check (
      (database_size_bytes is null or database_size_bytes >= 0)
      and (storage_size_bytes is null or storage_size_bytes >= 0)
      and (api_requests_count is null or api_requests_count >= 0)
    )
);

alter table public.platform_usage_monthly_snapshots enable row level security;

revoke all on table public.platform_usage_monthly_snapshots from public;
revoke all on table public.platform_usage_monthly_snapshots from anon;
revoke all on table public.platform_usage_monthly_snapshots from authenticated;
grant select, insert, update on table public.platform_usage_monthly_snapshots to service_role;

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
  insert into public.platform_usage_monthly_snapshots (
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
  on conflict (snapshot_month) do update set
    database_size_bytes = coalesce(excluded.database_size_bytes, public.platform_usage_monthly_snapshots.database_size_bytes),
    storage_size_bytes = coalesce(excluded.storage_size_bytes, public.platform_usage_monthly_snapshots.storage_size_bytes),
    api_requests_count = coalesce(excluded.api_requests_count, public.platform_usage_monthly_snapshots.api_requests_count),
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
