-- Closes D-115 (open since 2026-08-07): the browser dashboard D-110 specified needs an
-- anon-readable surface, and `v_jobs_enriched` is not it -- it selects `j.*`, which carries
-- `recruiter_name`, `recruiter_linkedin`, `recruiter_email` and `hiring_manager`. Granting
-- anon SELECT on that view would publish recruiter contact details on a public URL.
--
-- `v_jobs_public` is the same query with the PII columns dropped and the column list
-- enumerated explicitly (never `j.*`, so a future column added to `jobs` cannot silently
-- leak into the public surface -- that implicit-widening is exactly how D-115 happened).
-- The column set matches what `scripts/build-dashboard.ts` already fetches for the Jobs tab.
--
-- The view runs in `security_invoker = true` mode, matching D-145's treatment of the other 7
-- views. That alone is not sufficient -- in invoker mode the querying role needs its own access
-- to the base tables -- so this migration also adds anon SELECT policies on `jobs` and
-- `job_enrichments` scoped to the same rows the view exposes, and replaces the blanket table
-- grants with COLUMN-LEVEL grants that omit every PII column. Net effect: even a direct
-- PostgREST request to `/rest/v1/jobs` cannot return recruiter data. Defense in depth, rather
-- than the view being the single control.
--
-- TWO copies of recruiter PII exist, not one (found 2026-08-14, D-157): the four `jobs` columns
-- that D-115/D-142/D-155 all reason about, AND `job_enrichments.raw_output`, the verbatim AI
-- response -- the classify prompt's output contract (lib/ai/prompts.ts:76,89) includes
-- recruiter_name/recruiter_email/hiring_manager, so they land in that jsonb blob too. Both are
-- excluded from the column grants below. Do not add `raw_output` to anon's grant.
--
-- `remote_companies` is granted directly with no view and no column filtering: every column
-- including recruiter contact is public by design (D-142, and confirmed for the live URL in
-- this session's decision entry). Row filtering is unnecessary -- single-user project, the
-- whole catalog is the intended public surface.

create or replace view v_jobs_public as
select
  j.id, j.source, j.external_id, j.source_reliability, j.canonical_job_id,
  j.company, j.company_slug, j.role_title,
  j.posting_url, j.apply_url, j.location, j.posted_at,
  j.jd_clean, j.parsed,
  j.first_seen_at, j.last_checked_at, j.link_status,
  -- jd_raw, dropped_reason, created_at omitted: internal, not needed by the UI.
  -- recruiter_name / recruiter_linkedin / recruiter_email / hiring_manager omitted: the
  -- entire point of this view (D-115).
  c.remote_type, c.geo_explicit,
  c.is_technical, c.technical_depth, c.is_ai, c.business_model,
  c.institute_requirement, c.domain,
  c.background_match, c.background_match_suggested,
  c.confidence as classify_confidence, c.needs_review,
  gr.geo_verdict, gr.geo_verdict_reasoning,
  sk.skills,
  sal.salary_min, sal.salary_max, sal.salary_currency, sal.salary_period, sal.salary_status,
  coalesce(rec.priority, 'unknown') as priority,          -- D-112: absent is not negative
  rec.recommend_reasons,
  c.role_summary,
  c.years_experience_min, c.years_experience_max,
  case when c.id is null then 'not_evaluated' else 'evaluated' end as classify_status,
  is_junior_title(j.role_title) as is_junior_title        -- D-148
from jobs j
left join job_enrichments c   on c.job_id  = j.id and c.stage  = 'classify'    and c.is_active
left join job_enrichments gr  on gr.job_id = j.id and gr.stage = 'geo_recheck' and gr.is_active
left join job_enrichments sk  on sk.job_id = j.id and sk.stage = 'skills'      and sk.is_active
left join job_enrichments sal on sal.job_id= j.id and sal.stage= 'salary'      and sal.is_active
left join job_enrichments rec on rec.job_id= j.id and rec.stage= 'recommend'   and rec.is_active
where j.dropped_reason is null
  and j.canonical_job_id is null;   -- D-98: canonical read path, no duplicate rows

grant usage on schema public to anon;

alter view v_jobs_public set (security_invoker = true);

-- REVOKE FIRST, then grant back only what is safe. Supabase provisions
-- `grant all on all tables in schema public to anon` by default, so every table and view here
-- already carried anon INSERT/UPDATE/DELETE/TRUNCATE (verified against the live DB). RLS
-- default-deny was the only thing neutralising that -- one switch, doing all the work.
revoke all on v_jobs_public from anon;
grant select on v_jobs_public to anon;

drop policy if exists jobs_public_read on jobs;
create policy jobs_public_read on jobs for select to anon
  using (dropped_reason is null and canonical_job_id is null);   -- same rows the view exposes

revoke all on jobs from anon;
grant select (
  id, source, external_id, source_reliability, canonical_job_id,
  company, company_slug, role_title, posting_url, apply_url,
  location, posted_at, jd_clean, parsed,
  first_seen_at, last_checked_at, link_status
) on jobs to anon;
-- omitted deliberately: recruiter_name, recruiter_linkedin, recruiter_email, hiring_manager
-- (D-115), plus jd_raw / dropped_reason / created_at as internal-only.

drop policy if exists job_enrichments_public_read on job_enrichments;
create policy job_enrichments_public_read on job_enrichments for select to anon
  using (is_active);

revoke all on job_enrichments from anon;
grant select (
  id, job_id, stage, is_active, classifier_version, prompt_version,
  provider, model, confidence, needs_review,
  remote_type, geo_explicit, is_technical, technical_depth, is_ai,
  business_model, institute_requirement, domain,
  background_match, background_match_suggested,
  geo_verdict, geo_verdict_reasoning, skills,
  salary_min, salary_max, salary_currency, salary_period, salary_status,
  priority, recommend_reasons, created_at,
  role_summary, years_experience_min, years_experience_max, remote_check_reasoning
) on job_enrichments to anon;
-- omitted deliberately: raw_output -- the second PII copy (see header).

-- remote_companies: RLS was enabled in 0009 with no policy, i.e. default-deny. The dashboard's
-- Remote Companies tab needs it, so add an explicit read-only policy plus the grant. Every
-- column including recruiter contact is public by design here (D-142, D-156). No write policy --
-- the pipeline writes via the service-role key, which bypasses RLS entirely.
drop policy if exists remote_companies_public_read on remote_companies;
create policy remote_companies_public_read on remote_companies for select to anon using (true);
revoke insert, update, delete, truncate, references, trigger on remote_companies from anon;
grant select on remote_companies to anon;
