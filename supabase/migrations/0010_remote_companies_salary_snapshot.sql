-- 0010 — remote_companies: salary snapshot, when a confirming job states a figure
--
-- D-144 (same session as D-140/D-142): same "capture it permanently, don't lose it"
-- framing as recruiter contact. Not an AI call — lib/enrich/salary.ts's parseSalary() is a
-- plain regex parser (D-12), no LLM involved. Only written when salary_status = 'stated'
-- (lib/enrich/salary.ts's own guard) and the confirming job's remote_type is already known
-- to be 'remote_india' (same gating as D-139's fix). Coalesced on write, like recruiter
-- contact — a later confirming job with no stated figure never erases one already captured.

alter table remote_companies
  add column if not exists evidence_salary_min      numeric,
  add column if not exists evidence_salary_max      numeric,
  add column if not exists evidence_salary_currency text,
  add column if not exists evidence_salary_period   text;

comment on column remote_companies.evidence_salary_min is
  'Snapshotted from the confirming job when salary_status = ''stated'' (D-144). Coalesced on re-confirm, never cleared by a later job with no stated figure.';
comment on column remote_companies.evidence_salary_max is 'See evidence_salary_min.';
comment on column remote_companies.evidence_salary_currency is 'See evidence_salary_min.';
comment on column remote_companies.evidence_salary_period is 'See evidence_salary_min.';
