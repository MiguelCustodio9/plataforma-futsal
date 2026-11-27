create table if not exists public.platform_connectivity_daily (
  event_date date not null default (now() at time zone 'utc')::date,
  event_key text not null,
  event_count bigint not null default 0,
  last_occurred_at timestamptz not null default now(),
  constraint platform_connectivity_daily_pkey primary key (event_date, event_key),
  constraint platform_connectivity_daily_event_key_check check (
    event_key in ('browser_online', 'browser_offline', 'supabase_connected')
  ),
  constraint platform_connectivity_daily_event_count_check check (event_count >= 0)
);

alter table public.platform_connectivity_daily enable row level security;
revoke all on table public.platform_connectivity_daily from public, anon, authenticated;
grant select, insert, update on table public.platform_connectivity_daily to service_role;

create or replace function public.record_platform_connectivity_event(p_event_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;

  if p_event_key not in ('browser_online', 'browser_offline', 'supabase_connected') then
    raise exception 'Evento de conectividade não reconhecido.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.status = 'ativo'
      and profile.role in (
        'administrador_principal',
        'treinador_principal',
        'staff',
        'jogadora'
      )
  ) then
    raise exception 'Conta sem acesso ativo.' using errcode = '42501';
  end if;

  insert into public.platform_connectivity_daily (
    event_date, event_key, event_count, last_occurred_at
  )
  values ((now() at time zone 'utc')::date, p_event_key, 1, now())
  on conflict (event_date, event_key)
  do update set
    event_count = public.platform_connectivity_daily.event_count + 1,
    last_occurred_at = greatest(public.platform_connectivity_daily.last_occurred_at, excluded.last_occurred_at);
end;
$$;

revoke all on function public.record_platform_connectivity_event(text) from public, anon;
grant execute on function public.record_platform_connectivity_event(text) to authenticated;

create or replace function public.get_platform_connectivity_usage()
returns table (
  event_key text,
  event_count bigint,
  last_occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.status = 'ativo'
      and profile.role = 'administrador_principal'
  ) then
    raise exception 'Apenas o Administrador Principal pode consultar estes indicadores.'
      using errcode = '42501';
  end if;

  return query
  select usage.event_key,
         sum(usage.event_count)::bigint,
         max(usage.last_occurred_at)
  from public.platform_connectivity_daily as usage
  where usage.event_date >= ((now() at time zone 'utc')::date - 29)
    and usage.event_date <= (now() at time zone 'utc')::date
  group by usage.event_key
  order by usage.event_key;
end;
$$;

revoke all on function public.get_platform_connectivity_usage() from public, anon;
grant execute on function public.get_platform_connectivity_usage() to authenticated;
