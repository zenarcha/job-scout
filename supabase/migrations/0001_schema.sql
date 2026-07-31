-- ════════════════════════════════════════════════════════════════════════
-- Remote PM Job Tracker — schema v1
-- Principles: immutable source (jobs) vs. versioned AI output (job_enrichments);
-- preserve raw+clean JD; confidence gating; source-reliability dedup;
-- event-driven bus + audit (job_events); incremental analytics (rollup_*).
-- Apply via Supabase MCP apply_migration, or `supabase db push`.
-- RLS is intentionally deferred to a later migration (Phase 7, when the
-- dashboard + auth land). Until then, access is via the service-role key only.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ── user profile & resume versions ──────────────────────────────────────
create table if not exists profile (
  id            int primary key default 1,
  full_name     text,
  headline      text,
  skills        text[] default '{}',        -- baseline skills for skills-gap
  preferences   jsonb  default '{}'::jsonb,  -- e.g. desired seniority, comp floor
  updated_at    timestamptz default now(),
  constraint profile_singleton check (id = 1)
);

create table if not exists resume_versions (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,                 -- e.g. "v3 - AI PM focus"
  text       text not null,
  is_active  boolean default false,
  created_at timestamptz default now()
);
-- at most one active resume version
create unique index if not exists resume_versions_one_active
  on resume_versions ((is_active)) where is_active;

-- ── company watchlist (drives company-based discovery + ATS polling) ─────
create table if not exists company_watchlist (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,
  company_slug text not null unique,
  ats_type     text check (ats_type in ('greenhouse','lever','ashby','none')) default 'none',
  ats_slug     text,                         -- board slug for the ATS API
  weight       int default 3,                -- 1..5 boost for recommendation priority
  active       boolean default true,
  created_at   timestamptz default now()
);

-- ── jobs: IMMUTABLE source record (one per source posting) ───────────────
create table if not exists jobs (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,           -- linkedin | indeed | greenhouse | lever | ashby | google
  external_id       text not null,           -- source's job id
  source_reliability text not null default 'medium'
                    check (source_reliability in ('high','medium')),
  canonical_job_id  uuid references jobs(id), -- self-ref: cross-source duplicate grouping
  company           text,
  company_slug      text,
  role_title        text,
  apply_url         text,
  location          text,
  posted_at         timestamptz,
  jd_raw            text,                     -- original HTML/Markdown, never overwritten
  jd_clean          text,                     -- cleaned plain text
  parsed            jsonb default '{}'::jsonb,-- structured fields parsed at ingest
  first_seen_at     timestamptz default now(),
  last_checked_at   timestamptz default now(),
  link_status       text default 'live'
                    check (link_status in ('live','expired','not_found','closed','unknown')),
  recruiter_name    text,
  recruiter_linkedin text,
  recruiter_email   text,
  hiring_manager    text,
  created_at        timestamptz default now(),
  unique (source, external_id)
);
create index if not exists jobs_company_slug_idx on jobs(company_slug);
create index if not exists jobs_canonical_idx    on jobs(canonical_job_id);
create index if not exists jobs_first_seen_idx   on jobs(first_seen_at desc);

-- ── job_enrichments: VERSIONED AI output, one row per (job, stage, version)
-- Each stage fills only the columns it owns; the rest stay null.
create table if not exists job_enrichments (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references jobs(id) on delete cascade,
  stage               text not null
                      check (stage in ('classify','resume_match','skills','salary','recommend')),
  is_active           boolean default true,   -- current authoritative row for this (job,stage)
  classifier_version  text not null,
  prompt_version      text not null,
  provider            text,                   -- gemini | cerebras | grok
  model               text,
  confidence          numeric,                -- 0..1 (classify)
  needs_review        boolean default false,  -- true when confidence < 0.6

  -- classify outputs
  remote_type           text check (remote_type in ('remote_india','remote_global','other')),
  is_technical          text check (is_technical in ('technical','non_technical')),
  technical_depth       int,                  -- 1..5
  is_ai                 text check (is_ai in ('ai','non_ai')),
  business_model        text check (business_model in ('saas','b2c','other')),
  institute_requirement text check (institute_requirement in ('iit_iim_required','preferred','none')),

  -- resume_match output
  resume_match_score  int,                    -- 0..100
  resume_version_id   uuid references resume_versions(id),

  -- skills output
  skills              text[],

  -- salary output (parse-only; never estimated)
  salary_min          numeric,
  salary_max          numeric,
  salary_currency     text,
  salary_period       text,                   -- year | month | lpa | hour
  salary_status       text check (salary_status in ('stated','unknown')),

  -- recommend output
  priority            text check (priority in ('high','med','low')),
  recommend_reasons   jsonb,                  -- ["AI PM","Remote India","84% match",...]

  raw_output          jsonb,                  -- full model response for debugging/reclassify
  created_at          timestamptz default now()
);
-- exactly one active row per (job, stage)
create unique index if not exists job_enrichments_active_uniq
  on job_enrichments (job_id, stage) where is_active;
create index if not exists job_enrichments_job_idx on job_enrichments(job_id);
create index if not exists job_enrichments_review_idx
  on job_enrichments(needs_review) where needs_review;

-- ── job_tracking: user-mutable state (kept out of immutable jobs) ────────
create table if not exists job_tracking (
  job_id              uuid primary key references jobs(id) on delete cascade,
  status              text not null default 'new'
                      check (status in ('new','researching','tailoring_resume','applied',
                                        'interview','offer','rejected','archived')),
  notes               text,
  locked_fields       text[] default '{}',    -- fields the user overrode; AI must not touch
  resume_version_used uuid references resume_versions(id),
  updated_at          timestamptz default now()
);

-- ── decisions: why she applied / skipped (the decision log) ─────────────
create table if not exists decisions (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references jobs(id) on delete cascade,
  action              text not null check (action in ('apply','skip','shortlist')),
  reasons             text[] default '{}',
  notes               text,
  resume_version_used uuid references resume_versions(id),
  decided_at          timestamptz default now()
);
create index if not exists decisions_job_idx on decisions(job_id);

-- ── status_history: pipeline transitions (powers timing analytics) ──────
create table if not exists status_history (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  from_status text,
  to_status  text not null,
  changed_at timestamptz default now()
);
create index if not exists status_history_job_idx on status_history(job_id, changed_at);

-- ── job_events: append-only event bus + audit trail ─────────────────────
create table if not exists job_events (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid references jobs(id) on delete cascade,
  type       text not null,                  -- JobCreated | ClassificationDone | ... | StageFailed
  stage      text,
  payload    jsonb default '{}'::jsonb,
  error      text,
  created_at timestamptz default now()
);
create index if not exists job_events_job_idx  on job_events(job_id, created_at);
create index if not exists job_events_type_idx on job_events(type, created_at);

-- ── ai_usage: token/cost/quota tracking (even on free tiers) ────────────
create table if not exists ai_usage (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references jobs(id) on delete set null,
  stage             text,
  provider          text,
  model             text,
  prompt_version    text,
  prompt_tokens     int default 0,
  completion_tokens int default 0,
  est_cost_usd      numeric default 0,
  created_at        timestamptz default now()
);
create index if not exists ai_usage_created_idx on ai_usage(created_at);

-- ── idempotency: processed Apify run ids (dedup duplicate webhooks) ──────
create table if not exists processed_runs (
  run_id      text primary key,
  source      text,
  item_count  int,
  processed_at timestamptz default now()
);

-- ── incremental analytics rollups (updated on events, not recomputed) ───
create table if not exists rollup_company (
  company_slug text primary key,
  company      text,
  open_roles   int default 0,
  updated_at   timestamptz default now()
);
create table if not exists rollup_skills (
  skill        text primary key,
  count_100    int default 0,   -- occurrences within the most recent 100 jobs window
  updated_at   timestamptz default now()
);
create table if not exists rollup_funnel (
  metric       text primary key, -- scraped | applied | interview | offer | rejected | responses
  value        int default 0,
  updated_at   timestamptz default now()
);
create table if not exists rollup_ai_cost (
  day          date primary key,
  requests     int default 0,
  prompt_tokens int default 0,
  completion_tokens int default 0,
  est_cost_usd numeric default 0
);

-- ════════════════════════════════════════════════════════════════════════
-- Convenience views (read models). The dashboard reads v_jobs_enriched.
-- ════════════════════════════════════════════════════════════════════════

-- Flatten active enrichment rows (one per stage) + tracking onto each job.
create or replace view v_jobs_enriched as
select
  j.*,
  c.is_technical, c.technical_depth, c.is_ai, c.business_model,
  c.institute_requirement, c.confidence as classify_confidence, c.needs_review,
  rm.resume_match_score,
  sk.skills,
  sal.salary_min, sal.salary_max, sal.salary_currency, sal.salary_period, sal.salary_status,
  rec.priority, rec.recommend_reasons,
  t.status, t.notes, t.locked_fields, t.resume_version_used
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'     and c.is_active
left join job_enrichments rm  on rm.job_id = j.id and rm.stage = 'resume_match' and rm.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'        and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'        and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'     and rec.is_active
left join job_tracking t      on t.job_id  = j.id;

-- Company grouping ("Microsoft — 7 open roles"). Canonical rows only.
create or replace view v_company_rollup as
select company_slug, max(company) as company, count(*) as open_roles
from jobs
where canonical_job_id is null
  and link_status = 'live'
group by company_slug
order by open_roles desc;

-- Freshness buckets.
create or replace view v_freshness as
select
  id, company, role_title,
  extract(epoch from (now() - first_seen_at))/3600.0 as hours_since_discovered,
  case when posted_at is null then null
       else extract(day from (now() - posted_at)) end as days_since_posted,
  case
    when now() - first_seen_at < interval '24 hours'  then '<24h'
    when now() - first_seen_at < interval '72 hours'  then '24-72h'
    when now() - first_seen_at < interval '7 days'    then '1w'
    else 'older'
  end as freshness_bucket
from jobs
where link_status = 'live';

-- Skills-gap: market demand (last 100 jobs) vs. profile baseline.
create or replace view v_skill_gap as
with recent as (
  select id from jobs order by first_seen_at desc limit 100
),
exploded as (
  select unnest(e.skills) as skill
  from job_enrichments e
  join recent r on r.id = e.job_id
  where e.stage = 'skills' and e.is_active
),
counts as (
  select skill, count(*) as demand from exploded group by skill
),
total as (select count(*) as n from recent)
select
  c.skill,
  c.demand,
  round(100.0 * c.demand / nullif((select n from total), 0), 0) as demand_pct,
  (c.skill = any(coalesce((select skills from profile where id = 1), '{}'::text[]))) as have_it
from counts c
order by c.demand desc;

-- AI cost rollup convenience view.
create or replace view v_ai_cost as
select
  date(created_at) as day,
  count(*) as requests,
  sum(prompt_tokens) as prompt_tokens,
  sum(completion_tokens) as completion_tokens,
  round(sum(est_cost_usd)::numeric, 4) as est_cost_usd
from ai_usage
group by 1 order by 1 desc;
