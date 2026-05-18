create table if not exists public.mojo_session_reports (
  id bigserial primary key,
  mojo_session_key text not null unique,
  report_date date not null,
  agent_name text,
  session_type text,
  list_name text,
  calls integer not null default 0,
  appointments integer not null default 0,
  leads integer not null default 0,
  dial_seconds integer,
  talk_seconds integer,
  pause_seconds integer,
  start_time text,
  end_time text,
  pulled_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create table if not exists public.mojo_session_report_results (
  id bigserial primary key,
  session_report_id bigint not null references public.mojo_session_reports(id) on delete cascade,
  result text not null,
  total_calls integer not null default 0,
  talk_seconds integer,
  dial_seconds integer,
  raw jsonb not null default '{}'::jsonb,
  unique(session_report_id, result)
);

create index if not exists mojo_session_reports_report_date_idx
  on public.mojo_session_reports(report_date desc);

create index if not exists mojo_session_reports_agent_idx
  on public.mojo_session_reports(agent_name);
