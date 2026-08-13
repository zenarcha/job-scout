-- 0012 — v_jobs_enriched exposes is_junior_title() so the Jobs tab can exclude senior-titled
-- postings, which can never get a priority verdict (D-133: senior titles skip classify/recommend
-- entirely) and were showing as permanently "Pending" — indistinguishable on screen from a junior
-- job that just hasn't been enriched yet. Sakshi: "I don't want any pending jobs which are senior
-- to be in the job scout dashboard."
--
-- Reuses the existing is_junior_title() function (0007_remote_check_stage.sql) rather than
-- re-implementing the regex — same "one predicate" principle that function was extracted for.
-- Senior-titled jobs are NOT dropped from the database or from this view — they still feed the
-- Remote Companies tracker via remote_check. This only adds a column so build-dashboard.ts can
-- filter its own Jobs-tab display without touching what's actually stored or ingested.

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
  coalesce(rec.priority, 'unknown') as priority,
  rec.recommend_reasons,
  c.role_summary,
  c.years_experience_min, c.years_experience_max,
  case when c.id is null then 'not_evaluated' else 'evaluated' end as classify_status,
  -- new in 0012
  is_junior_title(j.role_title) as is_junior_title
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'    and c.is_active
left join job_enrichments gr  on gr.job_id = j.id and gr.stage = 'geo_recheck' and gr.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'      and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'      and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'   and rec.is_active
where j.dropped_reason is null
  and j.canonical_job_id is null;   -- D-98

alter view v_jobs_enriched set (security_invoker = true);   -- keep D-145's fix intact across the redefine
