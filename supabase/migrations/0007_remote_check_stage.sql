-- ════════════════════════════════════════════════════════════════════════
-- job-scout — D-136: standalone remote-only check for senior-titled jobs
--
-- D-133 (0006) excludes senior-titled jobs from `v_enrich_pending` entirely, so they
-- never reach `classify` and never get a `remote_type`. Sakshi's call: junior titles
-- keep the full pipeline exactly as-is; senior titles should still get their remote
-- status assessed by our own AI (not just trusted from the leaky Apify source filter),
-- but as a lower-priority pass that runs after the junior pipeline, using whatever
-- quota is left for the day (D-136, decisions.md).
--
-- This migration:
--   1. Extracts D-133's junior-title regex into `is_junior_title()` so 0006's view and
--      this one draw from ONE predicate instead of a hand-maintained inverse copy.
--   2. Allows the new `remote_check` stage on job_enrichments and adds its one new
--      column (remote_check_reasoning) — remote_type/geo_explicit are classify's own
--      columns, reused so the two stages' outputs are directly comparable.
--   3. Adds `v_remote_check_pending`, the Priority-2 sibling of `v_enrich_pending`.

-- ── 1. Shared junior-title predicate ──────────────────────────────────────
create or replace function is_junior_title(role_title text) returns boolean
language sql immutable as $$
  select role_title ~* '(associate product manager|\mapm\M|product management intern|product manager intern|product intern|product associate|junior product manager)'
$$;

-- Re-point 0006's view at the shared function. Column list is unchanged from 0006,
-- so this could be `create or replace`, but drop+create matches this project's
-- existing convention for this specific view (0003/0006 both note the same choice).
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
  and is_junior_title(j.role_title)           -- D-133, now via the shared function
  and (last.started_at is null                -- never run
       or cardinality(last.failed_stages) > 0)-- D-99: last run had a real failure → retry
  and (coalesce(f.consecutive_failures, 0) < 5
       or last.started_at < now() - interval '24 hours');

-- ── 2. remote_check stage ─────────────────────────────────────────────────
alter table job_enrichments drop constraint job_enrichments_stage_check;
alter table job_enrichments add constraint job_enrichments_stage_check
  check (stage in ('classify','geo_recheck','skills','salary','recommend','remote_check'));

-- Mirrors geo_verdict_reasoning's pattern — remote_type/geo_explicit are classify's
-- own columns (job_enrichments is stage-agnostic on those already), reused here.
alter table job_enrichments add column if not exists remote_check_reasoning text;

-- ── 3. Priority-2 pending queue ────────────────────────────────────────────
-- Same shape as v_enrich_pending (same dropped/canonical/retry-backoff guards), but:
--   - predicate is the INVERSE of is_junior_title (everything D-133 excludes)
--   - PLUS a "not already remote-checked" guard. Unlike the junior pipeline, which
--     reruns all 5 stages on every retry regardless of prior success, this is a
--     run-once check: a senior job that already has an active remote_check row is
--     done and must not be re-selected forever.
create view v_remote_check_pending as
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
where j.dropped_reason is null                -- D-72
  and j.canonical_job_id is null              -- D-98
  and not is_junior_title(j.role_title)       -- everything D-133 excludes from the full pipeline
  and not exists (
    select 1 from job_enrichments rc
    where rc.job_id = j.id and rc.stage = 'remote_check' and rc.is_active
  )
  and (last.started_at is null
       or cardinality(last.failed_stages) > 0)
  and (coalesce(f.consecutive_failures, 0) < 5
       or last.started_at < now() - interval '24 hours');
