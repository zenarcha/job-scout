-- ════════════════════════════════════════════════════════════════════════
-- job-scout — v_enrich_pending only selects junior-titled roles (2026-08-08)
--
-- Sakshi's call, in chat: only spend AI enrichment quota on titles she'd
-- actually apply to — Associate Product Manager/APM, Product Intern/Product
-- Management Intern/Product Manager Intern, Product Associate, Junior
-- Product Manager. Everything
-- else (plain "Product Manager", "Product Owner", "Product Analyst", any
-- Senior/Director/Principal/Lead/Group/VP variant) still gets INGESTED and
-- STORED exactly as before — this only controls what v_enrich_pending
-- auto-selects for the `classify` AI call. Nothing is dropped from `jobs`.
--
-- This is deliberately NOT the same mechanism D-126 rejected. D-126 was about
-- dropping postings at INGEST — never entering `jobs`, no verdict, no
-- visibility, measured wrong ~half the time (D-104) with no way back. This
-- filter sits one layer downstream: the row exists, stays visible on the
-- dashboard as "not yet evaluated" (classify_status = 'not_evaluated', per
-- D-131's own dashboard copy), and can be enriched later with `--job <id>`
-- if the title turns out to matter after all. Reversible; D-126's was not.
--
-- Known limitation, accepted explicitly rather than silently: title-keyword
-- matching is still imprecise (same class of gap D-104 measured). Sakshi's
-- read, from direct market experience: a plain "Product Manager" title is
-- never actually an entry-level role, so this asymmetry is intentional, not
-- an oversight. "Senior Associate Product Manager" is deliberately still
-- enriched (contains "Associate Product Manager") — confirmed acceptable.
--
-- `create or replace view` cannot add/remove predicates on an unchanged
-- column list safely across environments in all cases, but here the column
-- list is unchanged from 0003 — using drop+create anyway to match this
-- project's existing convention for this specific view (see 0003's own note).
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
  -- Sakshi's title filter (2026-08-08): only these role_title patterns are
  -- auto-selected for enrichment. Case-insensitive substring match; \m/\M are
  -- Postgres word-boundary anchors so "apm" doesn't match inside an unrelated
  -- word.
  and j.role_title ~* '(associate product manager|\mapm\M|product management intern|product manager intern|product intern|product associate|junior product manager)'
  and (last.started_at is null                -- never run
       or cardinality(last.failed_stages) > 0)-- D-99: last run had a real failure → retry
  and (coalesce(f.consecutive_failures, 0) < 5
       or last.started_at < now() - interval '24 hours');
