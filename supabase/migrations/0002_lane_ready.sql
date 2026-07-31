-- ════════════════════════════════════════════════════════════════════════
-- 0002 — Lane-ready prep (ADDITIVE, non-breaking, no behavior change, no renames)
-- Prepares the schema for the future Qualification stage + deterministic Lane
-- Engine so no migration is needed later. All new columns/tables are unused
-- until Phase 2. Does NOT create application_assets (deferred to Phase 4).
-- ════════════════════════════════════════════════════════════════════════

-- ── job_enrichments: qualification signals, lane, urgency, + versioning ──
alter table job_enrichments
  add column if not exists signals             jsonb,          -- structured qualification signals
  add column if not exists opportunity_score   int,            -- AI 0..100 (user-overridable → locked)
  add column if not exists lane                text,           -- A/B/C/D (computed by Lane Engine)
  add column if not exists lane_reasons        jsonb,
  add column if not exists urgency             text,           -- time-based; separate from lane
  add column if not exists qualification_version text,         -- version the qualification logic
  add column if not exists lane_rules_version    text;         -- version the lane rules

-- Loosen the stage CHECK so new stages (e.g. 'qualify') never need a migration.
-- App-level validation lives in the TS `EnrichStage` type.
alter table job_enrichments drop constraint if exists job_enrichments_stage_check;

-- ── job_tracking: personal preference (user-only) + lightweight referral ─
alter table job_tracking
  add column if not exists dream_company   boolean default false,
  add column if not exists avoid_company   boolean default false,
  add column if not exists domain_interest text[] default '{}',
  add column if not exists referral_needed boolean default false,
  add column if not exists referral_status text,
  add column if not exists person_contacted text;

-- Add 'inbox' (captured, not yet processed) to the status workflow.
alter table job_tracking drop constraint if exists job_tracking_status_check;
alter table job_tracking add constraint job_tracking_status_check
  check (status in ('inbox','new','researching','tailoring_resume','applied',
                    'interview','offer','rejected','archived'));

-- ── app_config: single active goal + lane rules + urgency prefs (config, not code) ──
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
-- Seed inert defaults (nothing reads these until Phase 2).
insert into app_config (key, value) values
  ('active_goal',  '"ai_pm"'::jsonb),   -- exactly ONE active goal in v1 (no weighting engine)
  ('lane_rules',   '{}'::jsonb),
  ('urgency_prefs','{}'::jsonb)
on conflict (key) do nothing;

-- ── v_jobs_enriched: add the future `qualify` stage (appended columns) so the
--    dashboard never assumes `recommend` is the terminal stage. ──
create or replace view v_jobs_enriched as
select
  j.*,
  c.is_technical, c.technical_depth, c.is_ai, c.business_model,
  c.institute_requirement, c.confidence as classify_confidence, c.needs_review,
  rm.resume_match_score,
  sk.skills,
  sal.salary_min, sal.salary_max, sal.salary_currency, sal.salary_period, sal.salary_status,
  rec.priority, rec.recommend_reasons,
  t.status, t.notes, t.locked_fields, t.resume_version_used,
  -- appended: qualification stage (unused until Phase 2)
  q.signals, q.opportunity_score, q.lane, q.lane_reasons, q.urgency,
  q.qualification_version, q.lane_rules_version,
  -- appended: personal preference (user-controlled)
  t.dream_company, t.avoid_company, t.domain_interest,
  t.referral_needed, t.referral_status, t.person_contacted
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'     and c.is_active
left join job_enrichments rm  on rm.job_id = j.id and rm.stage = 'resume_match' and rm.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'        and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'        and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'     and rec.is_active
left join job_enrichments q   on q.job_id  = j.id and q.stage  = 'qualify'       and q.is_active
left join job_tracking t      on t.job_id  = j.id;
