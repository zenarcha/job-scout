-- 0008 — remote_companies: recruiter-contact snapshot + seniority, alongside the D-139 gating fix
--
-- D-139 (Session 28): `confirmRemoteCompany` fired at INGEST time for any job that survived
-- the location pre-filter, before `remote_type` was ever computed by `classify`/`remote_check`.
-- 91% of the catalog had never been AI-confirmed remote. The fix (application code, not this
-- file) moves the confirmation call to fire only when remote_type = 'remote_india' is actually
-- known. This migration adds the columns that fix depends on.
--
-- D-140 (Session 28): the remote-company tracker is a permanent archive, decoupled from live
-- `jobs` state (no live join — company rows must survive `jobs` being truncated, as in D-138's
-- reset). That means anything the tracker needs to show has to be snapshotted onto this table
-- at confirmation time:
--   * recruiter contact — `jobs` already carries recruiter_name/recruiter_linkedin/
--     recruiter_email/hiring_manager; this catalog never did, despite existing to support
--     outreach. Coalesced on write (see lib/discovery/remoteCompanies.ts), not overwritten, so
--     a later confirming job with no contact info can't erase one a previous job supplied.
--   * evidence_seniority — the tracker's optional junior/senior filter (D-140) has no live join
--     to derive this from, so it's bucketed at confirmation time instead: 'fit'/'stretch'/
--     'senior' from years_experience_min (classify path) or always 'senior' (remote_check path,
--     since D-133/D-136 gate that stage to senior titles only).

alter table remote_companies
  add column if not exists recruiter_name text,
  add column if not exists recruiter_linkedin text,
  add column if not exists recruiter_email text,
  add column if not exists hiring_manager text,
  add column if not exists evidence_seniority text;

comment on column remote_companies.recruiter_name is
  'Snapshotted from the confirming job at confirmation time (D-140). Coalesced on re-confirm, never cleared by a later job with no contact info.';
comment on column remote_companies.recruiter_linkedin is 'See recruiter_name.';
comment on column remote_companies.recruiter_email is 'See recruiter_name.';
comment on column remote_companies.hiring_manager is 'See recruiter_name.';
comment on column remote_companies.evidence_seniority is
  'fit | stretch | senior, bucketed at confirmation time (D-140) — no live join to jobs, so this is the tracker''s only way to filter by seniority.';
