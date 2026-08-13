-- 0011 — fix what enabling RLS surfaced (D-143's get_advisors re-check, not fixed at the time)
--
-- Two findings, both flagged in D-143 and deferred, resolved here (D-145):
--
--   1. Seven views default to SECURITY DEFINER (none of their `create view` statements set
--      security_invoker, so Postgres runs them as the view owner, ignoring the querying
--      role's RLS). Harmless while nothing but the service-role key queries this database
--      (it bypasses RLS regardless), but now that RLS is actually on (0009), a future
--      anon-key caller through one of these views would see everything RLS is supposed to
--      block. security_invoker is a property flip, not a body rewrite — safe on this
--      project's Postgres 17.
--
--   2. is_junior_title(role_title text) (0007_remote_check_stage.sql) has a mutable
--      search_path. Checked its body: a pure SQL immutable function, one regex match on its
--      own parameter, no table or unqualified-object references — safe to pin to empty.

alter view v_enrich_parked        set (security_invoker = true);
alter view v_enrich_pending       set (security_invoker = true);
alter view v_remote_check_pending set (security_invoker = true);
alter view v_jobs_enriched        set (security_invoker = true);
alter view v_company_rollup       set (security_invoker = true);
alter view v_freshness            set (security_invoker = true);
alter view v_ai_cost              set (security_invoker = true);

alter function is_junior_title(text) set search_path = '';
