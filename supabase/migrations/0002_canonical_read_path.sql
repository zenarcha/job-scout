-- ════════════════════════════════════════════════════════════════════════
-- job-scout — canonical read path + enrichment run outcomes (Session 14, 2026-08-06)
--
-- The first incremental migration. 0001 was a full drop-and-reapply (D-96)
-- and that squash window closed the moment it was applied to the live
-- project — from here, schema changes layer on top.
--
-- Deliberately NOT named 0003: the migration ledger already holds a July
-- `0002_lane_ready` (superseded by D-86 and dropped in D-96's reset), and the
-- docs have been through one round of "which 0003?" confusion already.
-- Supabase versions by applied timestamp, not filename, so a distinct name is
-- unambiguous without colliding.
--
-- Fixes two defects that only the first live end-to-end run could find. Both
-- corrupt the read path the dashboard (D-89/D-93) sits on.
--   D-98 — v_jobs_enriched double-lists deduped jobs.
--   D-99 — a job counts as enriched when only its non-AI stage succeeded.
-- ════════════════════════════════════════════════════════════════════════

-- ── D-98: the read model shows canonical rows only ──────────────────────
-- Cross-source dedup works — duplicates are correctly linked via
-- canonical_job_id — but this view filtered on dropped_reason alone, so the
-- dashboard would list one job twice. v_company_rollup (canonical-filtered)
-- and services/notify/notify.ts (same) already got this right; the main read
-- model was the odd one out.
--
-- The select list below is unchanged from 0001. In particular the classify
-- block still projects remote_type — Session 9's long-standing defect, fixed
-- in 0001 and preserved here. `create or replace view` requires the output
-- column list stay identical anyway, so do not reorder or drop columns.
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
where j.dropped_reason is null
  and j.canonical_job_id is null;   -- D-98

-- ── D-99: record what each enrichment run actually did ──────────────────
-- enrichPending used to infer completion from a side effect: did the
-- `recommend` stage leave an active row. `recommend` is a deterministic
-- in-code rule (D-53/D-62/D-66) that succeeds whether or not the AI stages
-- did — so when Google retired gemini-2.5-flash mid-run, both jobs were
-- stamped complete holding zero classification and every retry was a silent
-- no-op.
--
-- Its own table rather than columns on `jobs`: 0001's governing principle is
-- immutable source (jobs) vs. versioned AI output (job_enrichments), and run
-- status is neither. enrichJob already computes {ok, failed} and threw it
-- away; this is where it lands.
create table if not exists enrich_runs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- Stage names, not a boolean: which stages failed is the actionable fact.
  -- A stage that declined to run (geo_recheck on a non-assumed-eligible job,
  -- D-75) lands in ok_stages, never in failed_stages — see the view below.
  ok_stages     text[] not null default '{}',
  failed_stages text[] not null default '{}'
);

create index if not exists enrich_runs_job_started_idx
  on enrich_runs (job_id, started_at desc);

-- ── The single authority on what still needs enrichment ─────────────────
-- Both fixes collapse into one predicate, so there is exactly one place that
-- decides what work is outstanding.
--
-- Why this handles the conditional stage for free: runGeoRecheck returns
-- early WITHOUT throwing when a job was never assumed-eligible
-- (lib/enrich/geoRecheck.ts:31), so a deliberate skip is recorded as ok and
-- can never look like a failure. "Skipped on purpose" and "failed" stop being
-- confusable — which is precisely what made the naive "require all five
-- stages" fix wrong.
-- Dropped rather than replaced: `create or replace view` cannot rename an output
-- column, and this view's shape changed during its own verification run.
-- Its only reader is enrichPending, which selects `id`.
drop view if exists v_enrich_pending;

create view v_enrich_pending as
select
  j.id,
  j.first_seen_at,
  coalesce(f.consecutive_failures, 0) as consecutive_failures,
  last.failed_stages                  as last_failed_stages
from jobs j
left join lateral (
  select r.failed_stages, r.started_at
  from enrich_runs r
  where r.job_id = j.id
  order by r.started_at desc
  limit 1
) last on true
-- Consecutive failures SINCE THE LAST CLEAN RUN, not runs ever. Counting total
-- runs was wrong: a job legitimately re-enriched several times (a prompt-version
-- bump, D-71's validation pass) would exhaust its budget while perfectly healthy,
-- and then never retry the first time it actually broke. A clean run resets it.
left join lateral (
  select count(*) as consecutive_failures
  from enrich_runs r2
  where r2.job_id = j.id
    and cardinality(r2.failed_stages) > 0
    and r2.started_at > coalesce(
      (select max(r3.started_at)
       from enrich_runs r3
       where r3.job_id = j.id and cardinality(r3.failed_stages) = 0),
      '-infinity'::timestamptz)
) f on true
where j.dropped_reason is null                -- D-72: dropped postings never consume AI quota
  and j.canonical_job_id is null              -- D-98: never enrich a duplicate
  and (last.started_at is null                -- never run
       or cardinality(last.failed_stages) > 0)-- D-99: last run had a real failure → retry
  -- SUPERSEDED BY 0003 (D-101). The UNREVIEWED note below was signed off in
  -- Session 15 and the answer was not just "pick a number": the cap as written
  -- here is a one-way door. Read 0003_parking_and_classify_fields.sql, not this.
  -- Left in place because an applied migration is a historical record.
  --
  -- UNREVIEWED DEFAULT: needs Sakshi sign-off. Retry cap has cost implications
  -- both ways — without one, a permanently-malformed job re-burns AI quota on
  -- every run; with one, a job failing 3x in a row goes quiet and needs manual
  -- attention. Note a provider outage hits every job at once, so a low cap could
  -- silence the whole feed after three failed cycles.
  and coalesce(f.consecutive_failures, 0) < 3;
