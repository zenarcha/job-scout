-- ════════════════════════════════════════════════════════════════════════
-- job-scout — "not evaluated" becomes a first-class state (Session 21, 2026-08-07)
--
-- Implements D-112. No new decision is taken here.
--
-- The defect: `recommend` is deterministic (D-53) and ran even when the AI stages
-- had failed. Reading this view with no `classify` row it saw
-- `background_match = []` / `is_ai = null` — byte-identical to a job genuinely
-- judged to have no matching signals — and wrote `priority = 'low'`. Low means "we
-- looked and it's bad"; these jobs were never looked at. It stayed invisible for two
-- sessions because `notify.ts` filters `low` out (D-65), so the feed was quiet — and
-- quiet is also what healthy looks like.
--
-- Third site of the D-73 principle, after `remote_type` and `salary_status`: absent
-- must never collapse into negative.
--
-- The code-side half of D-112 lives in lib/enrich/recommend.ts — a precondition that
-- writes no row at all when `classify` is absent. This file cleans up the rows the
-- old behaviour already wrote, and makes the resulting absence legible to readers.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- SECTION A — supersede the verdicts that were invented
-- ════════════════════════════════════════════════════════════════════════
--
-- Superseded (is_active = false), never deleted: this is exactly the mechanism
-- writeEnrichment uses for every regeneration, so the false verdicts stay
-- inspectable as history instead of vanishing. A job whose classify later succeeds
-- gets a fresh recommend row through the normal path.
--
-- Measured immediately before writing this migration, against
-- gwvrpdkiblozwdwoqsgd: 48 active recommend rows, 33 of them with no active
-- classify row; 15 active classify rows; 52 canonical jobs; 0 job_feedback rows
-- referencing any recommend row (so no manual correction is orphaned by this).
-- If a future re-read finds a materially different count, that is drift worth
-- understanding — not a reason to widen the predicate.
update job_enrichments r
set is_active = false
where r.stage = 'recommend'
  and r.is_active
  and not exists (
    select 1 from job_enrichments c
    where c.job_id = r.job_id and c.stage = 'classify' and c.is_active
  );


-- ════════════════════════════════════════════════════════════════════════
-- SECTION B — the read model says "not evaluated" out loud
-- ════════════════════════════════════════════════════════════════════════
--
-- Section A alone would render those jobs as BLANK cards, which is ambiguous with
-- "evaluated, found nothing" — the same bug in a quieter costume. D-112 therefore
-- carries both halves: a row-level status label AND an explicit `unknown` priority,
-- as insurance against future sorting/filtering logic mishandling an empty value.
--
-- `unknown` exists ONLY here, never in storage: job_enrichments carries
-- CHECK (priority in ('high','med','low')), and that constraint is what keeps stored
-- verdicts honest. Storage says "no verdict row exists"; the view says "unknown".
-- lib/types.ts mirrors the split (Priority for writers, PriorityView for readers).
--
-- APPEND-ONLY, same discipline as 0003: `create or replace view` cannot rename,
-- reorder or drop an output column. The select list below is 0003's verbatim with
-- ONE column appended at the end. The `priority` expression changes but its name,
-- position and type (plain text, per 0001) do not, which is what lets `replace`
-- accept it. Verified: no other view depends on this one.
--
-- In particular remote_type must keep projecting — Session 9's long-standing defect,
-- fixed in 0001 and preserved in 0002 and 0003.
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
  -- changed in 0005 — expression only; name, position and type are unchanged.
  -- No recommend row means no verdict was ever computed, not a bad verdict.
  -- notify.ts filters `.in('priority', ['high','med'])` (D-65), so an `unknown`
  -- job is never notified on — it is pending, and v_enrich_pending already has it.
  coalesce(rec.priority, 'unknown') as priority,
  rec.recommend_reasons,
  -- new in 0003 — appended, never inserted mid-list
  c.role_summary,
  c.years_experience_min, c.years_experience_max,
  -- new in 0005 — appended at the end for the same reason
  case when c.id is null then 'not_evaluated' else 'evaluated' end as classify_status
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'    and c.is_active
left join job_enrichments gr  on gr.job_id = j.id and gr.stage = 'geo_recheck' and gr.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'      and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'      and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'   and rec.is_active
where j.dropped_reason is null
  and j.canonical_job_id is null;   -- D-98
