create table if not exists public.platform_feature_usage_daily (
  usage_date date not null default (now() at time zone 'utc')::date,
  feature_key text not null,
  event_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint platform_feature_usage_daily_pkey primary key (usage_date, feature_key),
  constraint platform_feature_usage_daily_feature_key_check check (
    feature_key in (
      'dashboard',
      'staff',
      'access_management',
      'platform_settings',
      'security_activity',
      'usage_limits'
    )
  ),
  constraint platform_feature_usage_daily_event_count_check check (event_count >= 0)
);

alter table public.platform_feature_usage_daily enable row level security;

revoke all on table public.platform_feature_usage_daily from public, anon, authenticated;
grant select, insert, update on table public.platform_feature_usage_daily to service_role;

create or replace function public.record_platform_feature_usage(p_feature_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;

  if p_feature_key not in (
    'dashboard',
    'staff',
    'access_management',
    'platform_settings',
    'security_activity',
    'usage_limits'
  ) then
    raise exception 'Funcionalidade não reconhecida.' using errcode = '22023';
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

  insert into public.platform_feature_usage_daily (
    usage_date,
    feature_key,
    event_count,
    updated_at
  )
  values (
    (now() at time zone 'utc')::date,
    p_feature_key,
    1,
    now()
  )
  on conflict (usage_date, feature_key)
  do update set
    event_count = public.platform_feature_usage_daily.event_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.record_platform_feature_usage(text) from public, anon;
grant execute on function public.record_platform_feature_usage(text) to authenticated;

create or replace function public.get_platform_feature_usage()
returns table (
  feature_key text,
  event_count bigint
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
  select usage.feature_key, sum(usage.event_count)::bigint
  from public.platform_feature_usage_daily as usage
  where usage.usage_date >= ((now() at time zone 'utc')::date - 29)
    and usage.usage_date <= (now() at time zone 'utc')::date
  group by usage.feature_key
  order by sum(usage.event_count) desc, usage.feature_key asc;
end;
$$;

revoke all on function public.get_platform_feature_usage() from public, anon;
grant execute on function public.get_platform_feature_usage() to authenticated;
