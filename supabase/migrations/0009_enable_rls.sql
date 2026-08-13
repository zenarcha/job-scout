-- 0009 — enable Row Level Security on every public table, no policies yet
--
-- Supabase advisor flagged this as critical: with RLS off, the anon key can read or write
-- every row in every table. Checked before acting: nothing in this codebase currently uses
-- the anon key — every script (ingest, enrich, dashboard) uses the service-role key, which
-- bypasses RLS entirely by design (lib/db.ts). SUPABASE_ANON_KEY exists in .env.example /
-- lib/config.ts only as a placeholder for D-110's future browser-facing dashboard.
--
-- Decision (see decisions.md for the entry number — grep "^## D-" before trusting a cached
-- number): enable RLS now, with no policies. This is safe today (service-role scripts are
-- unaffected) and closes the exposure before the anon key is ever wired up anywhere. It also
-- means: with RLS on and zero policies, the anon key currently gets ZERO access to any table
-- (the safe default) until D-110/D-115 designs real policies when the browser-facing
-- dashboard actually needs them.

alter table public.profile            enable row level security;
alter table public.company_watchlist  enable row level security;
alter table public.remote_companies   enable row level security;
alter table public.jobs               enable row level security;
alter table public.job_enrichments    enable row level security;
alter table public.job_feedback       enable row level security;
alter table public.job_events         enable row level security;
alter table public.ai_usage           enable row level security;
alter table public.processed_runs     enable row level security;
alter table public.app_config         enable row level security;
alter table public.rollup_company     enable row level security;
alter table public.rollup_skills      enable row level security;
alter table public.rollup_funnel      enable row level security;
alter table public.rollup_ai_cost     enable row level security;
alter table public.enrich_runs        enable row level security;
