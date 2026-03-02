-- Messenger V4 phase 3-9 data model additions.

create table if not exists public.v4_messenger_appointments (
  id text primary key,
  thread_id text not null references public.v4_message_threads(id) on delete cascade,
  scheduled_at_utc timestamp not null,
  status text not null default 'SCHEDULED',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create unique index if not exists v4_messenger_appointments_thread_uniq
  on public.v4_messenger_appointments(thread_id);
create index if not exists v4_messenger_appointments_status_idx
  on public.v4_messenger_appointments(status);
create index if not exists v4_messenger_appointments_scheduled_idx
  on public.v4_messenger_appointments(scheduled_at_utc);

create table if not exists public.v4_completion_reports (
  id text primary key,
  thread_id text not null references public.v4_message_threads(id) on delete cascade,
  submitted_by_role text not null,
  completed_at_utc timestamp not null,
  summary_text text not null,
  punctuality integer,
  communication integer,
  quality integer,
  cooperation integer,
  created_at timestamp not null default now()
);

create unique index if not exists v4_completion_reports_thread_role_uniq
  on public.v4_completion_reports(thread_id, submitted_by_role);
create index if not exists v4_completion_reports_thread_idx
  on public.v4_completion_reports(thread_id);

create table if not exists public.score_appraisals (
  id text primary key,
  user_id text not null references public."User"(id) on delete cascade,
  role text not null,
  jobs_evaluated integer not null default 0,
  avg_punctuality double precision,
  avg_communication double precision,
  avg_quality double precision,
  avg_cooperation double precision,
  total_score double precision,
  prompt_hash text,
  version text not null default 'v1',
  updated_at timestamp not null default now()
);

create unique index if not exists score_appraisals_user_role_uniq
  on public.score_appraisals(user_id, role);
create index if not exists score_appraisals_score_idx
  on public.score_appraisals(total_score);

create table if not exists public.ai_enforcement_events (
  id text primary key,
  user_id text not null references public."User"(id) on delete cascade,
  job_id text,
  conversation_id text,
  category text not null,
  confidence double precision not null,
  severity integer not null,
  evidence_excerpt text,
  context_summary text,
  action_taken text not null default 'NONE',
  created_at timestamp not null default now()
);

create index if not exists ai_enforcement_events_user_idx
  on public.ai_enforcement_events(user_id);
create index if not exists ai_enforcement_events_convo_idx
  on public.ai_enforcement_events(conversation_id);
create index if not exists ai_enforcement_events_job_idx
  on public.ai_enforcement_events(job_id);

create table if not exists public.disputes (
  id text primary key,
  user_id text not null references public."User"(id) on delete cascade,
  role text not null,
  job_id text,
  conversation_id text,
  subject text not null,
  message text not null,
  status text not null default 'OPEN',
  attachment_pointers jsonb,
  created_at timestamp not null default now()
);

create index if not exists disputes_user_idx on public.disputes(user_id);
create index if not exists disputes_status_idx on public.disputes(status);
create index if not exists disputes_conversation_idx on public.disputes(conversation_id);
create index if not exists disputes_job_idx on public.disputes(job_id);
