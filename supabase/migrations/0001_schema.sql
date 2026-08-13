-- ════════════════════════════════════════════════════════════════════════
-- job-scout — consolidated schema (Session 10, 2026-08-05)
--
-- This file REPLACES the original 0001 + 0002_lane_ready.sql. Both were
-- squashed rather than layering an incremental 0003 on top, because:
--   • neither had ever been applied to the live project (D-36), so there is
--     no migration history to preserve;
--   • 0003 would have been majority-DROP statements undoing work that never
--     ran (0002's seven qualify columns, the loosened stage CHECK, profile's
--     original shape, four tables that moved out);
--   • ALTER/DROP on columns that v_jobs_enriched and v_skill_gap depend on
--     needs careful drop-and-recreate ordering that a fresh CREATE avoids.
-- This supersedes D-60's "its seven schema columns are dropped in 0003"
-- phrasing — they are simply never created here.
--
-- Principles carried forward: immutable source (jobs) vs. versioned AI output
-- (job_enrichments); preserve raw+clean JD; source-reliability dedup;
-- event-driven bus + audit (job_events); incremental analytics (rollup_*).
--
-- Apply via Supabase MCP apply_migration, or `supabase db push`, or paste
-- into the Supabase SQL editor. RLS is deferred to the dashboard build
-- (Phase 7); until then access is via the service-role key only.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ── profile: structured master-résumé data (D-46, D-47) ─────────────────
-- Single row. Shape deliberately mirrors resume-builder's live
-- `candidate_profile` table so a future cross-module sync is a copy rather
-- than a translation. Feeds `background_match` (D-47): named overlaps like
-- "both ex-Infosys" come from employment history and education, never from a
-- skills list.
create table if not exists profile (
  id              int primary key default 1,
  summary         text,                          -- positioning blurb (replaces the old `headline`)
  contact         jsonb default '{}'::jsonb,     -- {email, phone, linkedin, portfolio_url}
  -- [{company, title, location, dates, business_model, domain, bullets[]}]
  --   location      = plain geography ("Hyderabad"), NOT product context
  --   business_model = same saas|b2c|other enum job_enrichments uses, so a job's
  --                    business model is comparable to hers by equality
  --   domain        = product + category, free text ("Enovia · Product Lifecycle Management")
  experience      jsonb default '[]'::jsonb,
  education       jsonb default '[]'::jsonb,     -- [{institution, degree, field, dates, honors[]}]
  certifications  jsonb default '[]'::jsonb,     -- [{name, issuer, date, details[]}]
  projects        jsonb default '[]'::jsonb,     -- [{title, dates, bullets[]}]
  awards          jsonb default '[]'::jsonb,     -- [{title, issuer, date}]
  -- Grouped by category, e.g. {"AI Product Management": [...], "Analytics": [...]}.
  -- Grouped→flat is a one-line transform later; flat→grouped is unrecoverable.
  skills          jsonb default '{}'::jsonb,
  resume_raw_text text,                          -- backstop if structured extraction missed something
  resume_filename text,
  updated_at      timestamptz default now(),
  constraint profile_singleton check (id = 1)
);

-- ── company_watchlist: companies she is ACTIVELY PURSUING (D-44) ─────────
-- v1 job is exactly one thing: driving a dedicated Apify company-search task
-- per company (D-52). `weight` and `active` are stored but inert in v1
-- (D-52, D-74) — nothing reads them until weighting returns in v2.
-- `ats_type`/`ats_slug` are deliberately absent: the manual per-company ATS
-- configuration they existed for is superseded by auto-detection in the
-- deferred careers-page design (see scope.md v3).
create table if not exists company_watchlist (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,
  company_slug text not null unique,
  weight       int default 3,                -- 1..5; inert in v1
  active       boolean default true,         -- inert in v1
  created_at   timestamptz default now()
);

-- ── remote_companies: companies CONFIRMED to hire remote from India (D-44)
-- Distinct from the watchlist: recorded with evidence, without any commitment
-- to pursue. Promotion catalog → watchlist stays a deliberate manual act.
-- Columns reviewed and signed off 2026-08-07 (Session 19) — D-44's open column list is
-- resolved. `last_confirmed_at` is added by migration 0004, not here, so this file stays
-- a faithful record of what 0001 created. Population is automatic from discovery runs.
create table if not exists remote_companies (
  id            uuid primary key default gen_random_uuid(),
  company       text not null,
  company_slug  text not null unique,
  evidence_url  text,                        -- the real posting that qualified it
  evidence_note text,
  added_at      timestamptz default now()
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
  -- D-41: these are two different things and one field silently discarded one.
  --   posting_url = the LinkedIn (or source) posting — stable, shareable with a referrer
  --   apply_url   = the external destination, when the posting exposes one.
  -- A null apply_url is itself signal (LinkedIn Easy Apply has no external URL).
  posting_url       text,
  apply_url         text,
  location          text,
  posted_at         timestamptz,
  jd_raw            text,                     -- original HTML/Markdown, never overwritten
  jd_clean          text,                     -- cleaned plain text
  parsed            jsonb default '{}'::jsonb,-- structured fields parsed at ingest
  -- D-72: postings rejected by the ingest pre-filter are PERSISTED with a
  -- reason rather than discarded, so the filter itself is auditable and its
  -- false-negative rate is measurable. Null = kept.
  dropped_reason    text,
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
-- Partial index: enrichPending() and every read model filter on "not dropped".
create index if not exists jobs_not_dropped_idx  on jobs(first_seen_at desc) where dropped_reason is null;

-- ── job_enrichments: VERSIONED AI output, one row per (job, stage, version)
-- Each stage fills only the columns it owns; the rest stay null.
-- Supersede-never-overwrite (D-6, D-9): a re-run deactivates the prior row
-- and inserts a new one, so old and new sit side by side.
create table if not exists job_enrichments (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references jobs(id) on delete cascade,
  -- 'resume_match' is deliberately absent: D-37/D-38 deferred that stage to v2
  -- and its output columns are not created here, so such a row would have
  -- nowhere to write.
  stage               text not null
                      check (stage in ('classify','geo_recheck','skills','salary','recommend')),
  is_active           boolean default true,   -- current authoritative row for this (job,stage)
  classifier_version  text not null,
  prompt_version      text not null,
  provider            text,                   -- gemini | cerebras | grok
  model               text,
  -- D-70: stored, never acted on. No review queue, no review agent — uncertainty
  -- surfaces as a marker on the notification instead. Kept because it is free to
  -- record and D-71's hand-tagging pass may want to correlate against it.
  confidence          numeric,                -- 0..1 (classify)
  needs_review        boolean default false,

  -- ── classify outputs ──
  remote_type           text check (remote_type in ('remote_india','remote_global','other')),
  -- D-73: separates "the JD explicitly says India/Asia/global-remote" from
  -- "the JD said nothing about geography and the classifier fell back to a
  -- permissive default". Without this, an explicit fact and a fail-open guess
  -- are stored identically and the uncertainty cannot be surfaced or counted.
  geo_explicit          boolean,
  is_technical          text check (is_technical in ('technical','non_technical')),
  technical_depth       int,                  -- 1..5
  is_ai                 text check (is_ai in ('ai','non_ai')),
  business_model        text check (business_model in ('saas','b2c','other')),
  institute_requirement text check (institute_requirement in ('iit_iim_required','preferred','none')),
  -- D-39: what the company/product actually does (hr_tech, fintech, devtools…).
  -- Open text for now — D-67's closed-vocabulary argument does not apply because
  -- nothing in the v1 priority rule reads it (its consumer, domain_interest, is v2).
  domain                text,
  -- D-67: AI selection over a CLOSED vocabulary, seeded from the tags Sakshi has
  -- actually used in Notion for months. The vocabulary itself lives in app_config
  -- (not hardcoded in prompts.ts like the other enums) so a sixth tag is a data
  -- edit, not a code change.
  background_match      text[],
  -- D-68: genuine matches with no existing tag land here instead. NEVER feeds the
  -- priority rule until Sakshi promotes one into the vocabulary — otherwise
  -- free-form drift re-enters ranking through the back door and defeats D-67.
  background_match_suggested text[],

  -- ── geo_recheck output (D-75) ──
  -- A second, narrower AI pass over rows where remote_type='remote_india' AND
  -- geo_explicit=false. Writes its own verdict rather than overwriting classify's
  -- row, so a wrong override stays traceable (D-6/D-9).
  geo_verdict           text check (geo_verdict in ('eligible','ineligible','uncertain')),
  geo_verdict_reasoning text,

  -- ── skills output ──
  -- [{skill, required}] — `required` distinguishes must-haves from nice-to-haves
  -- so a per-job display can show only what the role actually demands without
  -- discarding the preferred set.
  skills              jsonb,

  -- ── salary output (parse-only regex; never estimated — D-12) ──
  salary_min          numeric,
  salary_max          numeric,
  salary_currency     text,
  salary_period       text check (salary_period in ('lpa','year','month')),
  -- Three-way, not two: 'not_mentioned' (the JD says nothing about pay) and
  -- 'unrecognizable_format' (it does, but the parser could not read it) were
  -- previously both 'unknown', which made the parser's own failure rate
  -- unmeasurable.
  salary_status       text check (salary_status in ('stated','not_mentioned','unrecognizable_format')),

  -- ── recommend output (deterministic rule in code — D-53, D-62, D-66) ──
  priority            text check (priority in ('high','med','low')),
  recommend_reasons   jsonb,                  -- ["AI PM","Remote India","Support Company",...]

  raw_output          jsonb,                  -- full model response, for debugging/reclassify
  created_at          timestamptz default now()
);
-- exactly one active row per (job, stage)
create unique index if not exists job_enrichments_active_uniq
  on job_enrichments (job_id, stage) where is_active;
create index if not exists job_enrichments_job_idx on job_enrichments(job_id);

-- ── job_feedback: per-field corrections; also the lock mechanism (D-48, D-69)
-- A correction IS a lock: recording "the AI was wrong, it should say X" and
-- "do not overwrite my X" as two mechanisms would mean keeping them in sync
-- forever. writeEnrichment reads this instead of the old
-- job_tracking.locked_fields, which is what lets job_tracking leave job-scout.
--
-- Deliberately carries NO job_id and NO stage column: both are reachable via
-- enrichment_id → job_enrichments, and storing them again would duplicate a
-- fact that already lives elsewhere. (Same shape as LangSmith's feedback API:
-- run_id + key + correction, no redundant parent id.)
--
-- Attaching to enrichment_id rather than job_id also means a correction is
-- scoped to the exact attempt it judged — so D-71's accuracy work can ask
-- "how good was prompt version N" rather than only "was this job ever wrong".
create table if not exists job_feedback (
  id              uuid primary key default gen_random_uuid(),
  enrichment_id   uuid not null references job_enrichments(id) on delete cascade,
  field           text not null,             -- e.g. 'remote_type', 'geo_verdict'
  verdict         boolean not null,          -- true = 👍 correct · false = 👎 incorrect
  -- jsonb, not text, so it round-trips every field type this can correct:
  -- "remote_india", false, 3, ["HR Tech"]. Only meaningful when verdict = false.
  -- A thumbs-down with NO corrected_value is still valuable (it feeds D-71's
  -- accuracy count) but does NOT lock the field — nothing is known to put there.
  corrected_value jsonb,
  created_at      timestamptz default now()
);
create index if not exists job_feedback_enrichment_idx on job_feedback(enrichment_id);

-- ── job_events: append-only event bus + audit trail (D-10) ──────────────
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
  -- Ties a cost row to the exact attempt that spent it. Without this, two
  -- re-classifications of the same job are indistinguishable in the cost log,
  -- so "did the new prompt cost more than the old one?" is unanswerable.
  enrichment_id     uuid references job_enrichments(id) on delete set null,
  stage             text,
  provider          text,
  model             text,
  prompt_version    text,
  prompt_tokens     int default 0,
  completion_tokens int default 0,
  est_cost_usd      numeric default 0,
  created_at        timestamptz default now()
);
create index if not exists ai_usage_created_idx    on ai_usage(created_at);
create index if not exists ai_usage_enrichment_idx on ai_usage(enrichment_id);

-- ── idempotency: processed Apify run ids (dedup duplicate webhooks) ──────
create table if not exists processed_runs (
  run_id      text primary key,
  source      text,
  item_count  int,
  processed_at timestamptz default now()
);

-- ── app_config: values Sakshi can edit without a code change ────────────
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
-- D-67's closed vocabulary, seeded from the tags she has actually assigned by
-- hand in Notion for months — not reverse-engineered from a design discussion.
-- Promoting a background_match_suggested value (D-68) means appending to this
-- array; no deploy required.
insert into app_config (key, value) values
  ('background_match_vocabulary',
   '["Support Company","Role Match – Support Work","Research Experience","HR Tech","CPG company"]'::jsonb),
  -- Telegram getUpdates cursor for the feedback poller (D-77). Polling avoids
  -- standing up this project's first live HTTP endpoint just for two buttons.
  ('telegram_update_offset', '0'::jsonb)
on conflict (key) do nothing;

-- ── incremental analytics rollups (updated on events, not recomputed) ───
-- Inert in v1. Kept pending the v2 analytics conversation rather than dropped:
-- unlike the qualify columns (D-60), these encode no guess at an undesigned
-- feature — they are plain counters whose shape is not in question.
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
-- Read models.
--
-- Not created here, and why:
--   job_tracking / decisions / status_history — post-discovery tracking, which
--     D-42 moved to the separate tracker module. D-48 removed job-scout's last
--     dependency (locked_fields → job_feedback), so this is a clean removal.
--   resume_versions — D-38/D-46: the versioned full-text résumé store belongs
--     to resume-builder. Matching itself lives there too (lib/tailor.ts).
--   v_skill_gap — both its inputs (profile.skills, job_enrichments.skills)
--     changed shape here, it was never wired to anything, and the v2 feature it
--     serves is unbuilt. Rebuilding it against the real shapes when that feature
--     lands is cheaper than carrying a broken view.
-- ════════════════════════════════════════════════════════════════════════

-- Flatten active enrichment rows (one per stage) onto each job.
-- NOTE: every prior version of this view omitted `remote_type`, so the
-- Remote-India chip could never render and recommend received `undefined` for
-- the single most important classification in the product. Projecting the
-- classify block explicitly is the fix.
create or replace view v_jobs_enriched as
select
  j.*,
  c.remote_type, c.geo_explicit,
  c.is_technical, c.technical_depth, c.is_ai, c.business_model,
  c.institute_requirement, c.domain,
  c.background_match, c.background_match_suggested,
  c.confidence as classify_confidence, c.needs_review,
  c.id as classify_enrichment_id,
  gr.geo_verdict, gr.geo_verdict_reasoning,
  sk.skills,
  sal.salary_min, sal.salary_max, sal.salary_currency, sal.salary_period, sal.salary_status,
  rec.priority, rec.recommend_reasons
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'    and c.is_active
left join job_enrichments gr  on gr.job_id = j.id and gr.stage = 'geo_recheck' and gr.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'      and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'      and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'   and rec.is_active
where j.dropped_reason is null;

-- Company grouping ("Microsoft — 7 open roles"). Canonical rows only.
create or replace view v_company_rollup as
select company_slug, max(company) as company, count(*) as open_roles
from jobs
where canonical_job_id is null
  and link_status = 'live'
  and dropped_reason is null
group by company_slug
order by open_roles desc;

-- Freshness buckets. Feeds D-45's staleness rule (30-day grace, then 30-day re-checks).
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
where link_status = 'live'
  and dropped_reason is null;

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
