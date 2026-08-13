-- D-150 (2026-08-13): remote_type's third value renamed 'other' -> 'not_remote'.
-- 'other' read like a third flavor of remote next to remote_india/remote_global when it
-- actually means on-site or hybrid (per lib/ai/prompts.ts's rubric). No prior decision had
-- ever chosen the 'other' name — inherited, not decided. This migration only relabels the
-- value; the meaning is identical (on-site/hybrid), so backfilling existing rows is not a
-- change to what actually happened, just to how it's spelled.

-- Ordering fixed 2026-08-13 (same day, later): the original version of this file backfilled
-- rows BEFORE dropping the old constraint, which only allowed 'other' — running it as written
-- fails with "violates check constraint" the moment the UPDATE tries to write 'not_remote'
-- while the old CHECK is still active. Drop first, then backfill, then add the new CHECK.

-- Drop the old constraint first — it only allows 'other', not 'not_remote'.
alter table job_enrichments
  drop constraint if exists job_enrichments_remote_type_check;

-- Backfill existing rows. Confirmed exact count before running: 3 rows had
-- remote_type = 'other' as of 2026-08-13 (verified via `select remote_type, count(*) from
-- job_enrichments group by remote_type`, not assumed; re-verified again immediately before
-- this migration actually ran).
update job_enrichments
set remote_type = 'not_remote'
where remote_type = 'other';

-- Swap in the new CHECK constraint.
alter table job_enrichments
  add constraint job_enrichments_remote_type_check
  check (remote_type in ('remote_india', 'remote_global', 'not_remote'));
