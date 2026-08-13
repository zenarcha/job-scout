-- Enable RLS on the three D-138 reset backup tables. These are public-schema tables
-- left over from the 2026-08-09 reset (jobs_backup_20260809, job_enrichments_backup_20260809,
-- remote_companies_backup_20260809) and were flagged by the security advisor as
-- RLS-disabled-in-public (ERROR level): readable/writable by the anon key with zero
-- protection. No policies are added, matching the pattern already used on every other
-- table in this schema -- the pipeline reads/writes via the service-role key, which
-- bypasses RLS, so enabling with no policy is sufficient (service-role keeps access,
-- anon loses it). See decisions.md D-155.

ALTER TABLE public.jobs_backup_20260809 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_enrichments_backup_20260809 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remote_companies_backup_20260809 ENABLE ROW LEVEL SECURITY;
