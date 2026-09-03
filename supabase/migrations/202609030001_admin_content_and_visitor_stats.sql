create table if not exists public.site_visitor_periods (
  visitor_id uuid not null,
  period_type text not null
    check (period_type in ('all', 'week', 'month', 'year')),
  period_start date not null,
  first_seen timestamptz not null default timezone('utc', now()),
  last_seen timestamptz not null default timezone('utc', now()),
  primary key (visitor_id, period_type, period_start)
);

create index if not exists site_visitor_periods_current_period_idx
  on public.site_visitor_periods (period_type, period_start, visitor_id);

alter table public.site_visitor_periods enable row level security;

revoke all on table public.site_visitor_periods from anon, authenticated;

create or replace function public.record_site_visit(p_visitor_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.site_visitor_periods (
    visitor_id,
    period_type,
    period_start,
    first_seen,
    last_seen
  )
  values
    (
      p_visitor_id,
      'all',
      date '1970-01-01',
      timezone('utc', now()),
      timezone('utc', now())
    ),
    (
      p_visitor_id,
      'week',
      date_trunc('week', timezone('utc', now()))::date,
      timezone('utc', now()),
      timezone('utc', now())
    ),
    (
      p_visitor_id,
      'month',
      date_trunc('month', timezone('utc', now()))::date,
      timezone('utc', now()),
      timezone('utc', now())
    ),
    (
      p_visitor_id,
      'year',
      date_trunc('year', timezone('utc', now()))::date,
      timezone('utc', now()),
      timezone('utc', now())
    )
  on conflict (visitor_id, period_type, period_start)
  do update set last_seen = excluded.last_seen;
$$;

revoke all on function public.record_site_visit(uuid) from public;
grant execute on function public.record_site_visit(uuid) to anon, authenticated;

create or replace function public.get_visitor_stats()
returns table (
  period_type text,
  period_start date,
  visitor_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  with requested_periods(period_type, period_start) as (
    values
      ('all'::text, date '1970-01-01'),
      ('week'::text, date_trunc('week', timezone('utc', now()))::date),
      ('month'::text, date_trunc('month', timezone('utc', now()))::date),
      ('year'::text, date_trunc('year', timezone('utc', now()))::date)
  )
  select
    requested_periods.period_type,
    requested_periods.period_start,
    count(site_visitor_periods.visitor_id)::bigint
  from requested_periods
  left join public.site_visitor_periods
    on site_visitor_periods.period_type = requested_periods.period_type
   and site_visitor_periods.period_start = requested_periods.period_start
  group by requested_periods.period_type, requested_periods.period_start;
end;
$$;

revoke all on function public.get_visitor_stats() from public;
grant execute on function public.get_visitor_stats() to authenticated;
