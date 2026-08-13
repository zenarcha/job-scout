-- ════════════════════════════════════════════════════════════════════════
-- job-scout — enrichment parking + two new classify outputs (Session 16, 2026-08-06)
--
-- On the name: the docs have already been through one round of "which 0003?",
-- where a `0003` referred to in prose actually meant the consolidated 0001
-- (D-96's full reset). This is the third *real* migration file. The descriptive
-- suffix disambiguates it the same way `0002_canonical_read_path` did against
-- the dropped July `0002_lane_ready`. Supabase versions by applied timestamp,
-- not filename.
--
-- Three decisions land here, all taken in Session 15:
--   D-101 — a job that gives up must be visible, must self-heal, and must be
--           retryable on demand. Replaces D-99's UNREVIEWED retry budget.
--   D-92  — role_summary: the one line saying what the job actually IS.
--   D-94  — years-of-experience, AI-extracted on the same classify call.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- SECTION A — D-101: the retry cap stops being a one-way door
-- ════════════════════════════════════════════════════════════════════════
--
-- What was wrong with the cap 0002 shipped: a job reaching it dropped out of
-- v_enrich_pending permanently. The counter resets on a clean run — but a clean
-- run can never happen, because the job is no longer being selected. A closed
-- loop, exitable only by a manual `--job <id>`, which is precisely the step D-99
-- existed to eliminate. A provider outage lasting longer than the cap would park
-- the entire feed and leave it parked AFTER the provider recovered.
--
-- The fix is not a bigger number. It is that giving up becomes temporary and
-- visible instead of permanent and silent — how dead-letter queues actually
-- behave (SQS parks a message for inspection; Sidekiq spreads ~25 retries over
-- ~21 days rather than stopping dead).
--
-- Dropped rather than replaced: `create or replace view` cannot change the
-- output column list, and this gains one. Its only reader is enrichPending,
-- which selects `id` (lib/enrich/pipeline.ts).
drop view if exists v_enrich_pending;

create view v_enrich_pending as
select
  j.id,
  j.first_seen_at,
  coalesce(f.consecutive_failures, 0) as consecutive_failures,
  last.failed_stages                  as last_failed_stages,
  last.started_at                     as last_attempt_at
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
  -- D-101: cap 5, with an automatic way back out. This disjunct IS the
  -- self-healing mechanism, and it needs no new counter and no new column — it
  -- rides the enrich_runs rows already being written.
  --
  -- Read it as: a parked job becomes eligible for exactly ONE attempt every 24
  -- hours. If that attempt fails, last.started_at is recent again and it parks
  -- for another 24h. If it succeeds, the clean-run lateral join above resets
  -- consecutive_failures to 0 and the job leaves the parked set entirely. So a
  -- provider outage of any length recovers on its own, at a cost of one wasted
  -- call per job per day while the provider is down.
  --
  -- The number 5 is the least important part of this (at 1-2 jobs/day the wasted
  -- quota is identical at 3, 5 or 10). Do not "tune" it without re-reading D-101.
  and (coalesce(f.consecutive_failures, 0) < 5
       or last.started_at < now() - interval '24 hours');


-- ── D-101(a): giving up is never silent ─────────────────────────────────
-- The counterpart to the cap. Without this view an exhausted job is invisible
-- until someone thinks to go looking for it, and not noticing is exactly what
-- silent failures are good at.
--
-- Projects company/role_title so the list is readable without a join, and
-- retry_eligible_at so "when does this come back on its own" is answerable
-- without doing interval arithmetic by hand. Note the deliberate overlap with
-- v_enrich_pending during a cooling-off window: a job past the cap but past 24h
-- appears in BOTH — parked (it has exhausted its budget) and pending (it is
-- getting its one scheduled attempt). That is the intended reading, not a bug.
create or replace view v_enrich_parked as
select
  j.id,
  j.company,
  j.role_title,
  f.consecutive_failures,
  last.failed_stages                        as last_failed_stages,
  last.started_at                           as last_attempt_at,
  last.started_at + interval '24 hours'     as retry_eligible_at
from jobs j
left join lateral (
  select r.failed_stages, r.started_at
  from enrich_runs r
  where r.job_id = j.id
  order by r.started_at desc
  limit 1
) last on true
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
where j.dropped_reason is null
  and j.canonical_job_id is null
  and coalesce(f.consecutive_failures, 0) >= 5;


-- ════════════════════════════════════════════════════════════════════════
-- SECTION B — D-92 + D-94: two things the pipeline could not say
-- ════════════════════════════════════════════════════════════════════════
--
-- Every existing classify output is a classification ABOUT the role
-- (remote_type, is_technical, is_ai, business_model, domain…). None of them says
-- what the work actually is, which is what Sakshi noticed reviewing the first
-- dashboard mock: the cards did not say what any job WAS.
alter table job_enrichments
  -- D-92: one line on what the work involves. Produced by the existing classify
  -- call (extra output tokens on a request already happening — not a second API
  -- call, so it stays inside D-5's $0 constraint). NULL is meaningful: it means
  -- the model did not answer, which must stay distinguishable from a real
  -- summary — see the .catch() note in AIService.
  add column if not exists role_summary text,
  -- D-94: nullable, no default, on purpose. "Not stated" is a common and real
  -- answer and must never collapse into zero. An open-ended "3+ years" sets min
  -- only and leaves max null.
  --
  -- AI-extracted rather than regex, despite D-57 setting the regex precedent for
  -- institute_requirement: "IIT/IIM" is a closed set of two literal strings, but
  -- years-of-experience appears as "3-6 years", "3+ years", "minimum three
  -- years", "at least 3 yrs". A regex over those fails SILENTLY, and a missed
  -- extraction reads as NO experience requirement — the permissive direction,
  -- which is the wrong way to fail for a signal whose whole job is warning her
  -- off ineligible roles.
  add column if not exists years_experience_min int,
  add column if not exists years_experience_max int;


-- ── the read model gains the three fields ───────────────────────────────
-- APPEND-ONLY. `create or replace view` cannot rename, reorder or drop an output
-- column, so the select list below is 0002's verbatim, with the three new
-- columns added at the end of the classify block. In particular remote_type must
-- keep projecting — Session 9's long-standing defect, fixed in 0001, preserved
-- in 0002, and preserved again here.
--
-- Note these three carry NO weight in the priority rule. D-94 is explicit that
-- years-of-experience is surfaced as an eligibility blocker and is filterable,
-- but does not change the verdict — see lib/enrich/recommend.ts.
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
  rec.priority, rec.recommend_reasons,
  -- new in 0003 — appended, never inserted mid-list
  c.role_summary,
  c.years_experience_min, c.years_experience_max
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'    and c.is_active
left join job_enrichments gr  on gr.job_id = j.id and gr.stage = 'geo_recheck' and gr.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'      and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'      and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'   and rec.is_active
where j.dropped_reason is null
  and j.canonical_job_id is null;   -- D-98
