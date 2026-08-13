-- 0004 — remote_companies becomes a real, populated catalog (resolves D-44's open columns)
--
-- D-44 (Session 8) decided this table should exist but explicitly left its name and
-- column list unresolved, and `0001_schema.sql` carried an UNREVIEWED DEFAULT marker
-- ever since. Reviewed with Sakshi this session and settled:
--
--   * `last_confirmed_at` is added. `added_at` alone answers "when did I first learn this
--     company hires remote" but not "are they still doing it" — and the latter is what the
--     dashboard's actively-hiring filter needs. Deriving it from a re-confirmation
--     timestamp rather than storing a boolean flag is deliberate: a stored flag goes stale
--     silently, a timestamp cannot.
--   * Evidence stays single-valued (most recent confirmation), not a full history. A
--     multi-evidence child table was considered and rejected as more structure than a
--     "which companies hire remote" catalog needs.
--   * Population is automatic from discovery runs, no manual confirmation step — D-44's own
--     reasoning is that a real live posting IS the evidence.

alter table remote_companies
  add column if not exists last_confirmed_at timestamptz default now();

-- Backfill: existing rows (if any) have only ever been confirmed once, at insert.
update remote_companies
   set last_confirmed_at = coalesce(last_confirmed_at, added_at)
 where last_confirmed_at is null;

-- The catalog is read by "which companies hire remote, and are they still active" —
-- both orderings hit this.
create index if not exists remote_companies_last_confirmed_idx
  on remote_companies (last_confirmed_at desc);

comment on table remote_companies is
  'Companies CONFIRMED to hire remote from India (D-44). Distinct from company_watchlist: '
  'recorded with evidence, no commitment to pursue. Auto-populated from discovery runs; '
  'promotion catalog -> watchlist stays a deliberate manual act. Columns reviewed and '
  'signed off 2026-08-07 (Session 19) — no longer an unreviewed default.';

comment on column remote_companies.added_at is 'First time a real posting confirmed this company.';
comment on column remote_companies.last_confirmed_at is
  'Most recent confirmation. Drives the dashboard''s actively-hiring filter — a timestamp '
  'rather than a boolean so it cannot go stale silently.';
