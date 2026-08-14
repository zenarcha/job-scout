# Remote PM Job Tracker

An always-on, **free-to-run** system that discovers newly-posted **remote (India-eligible)**
Product-Management-track roles at AI/SaaS/B2C companies, enriches each with AI, and delivers
matches to a **dashboard**, **Notion**, and **Telegram** — then helps you triage, track, and
continuously improve your search.

Full design: [`../.claude/plans/i-m-thinking-of-creating-staged-wave.md`](../.claude/plans/i-m-thinking-of-creating-staged-wave.md)

## Architecture at a glance

```
Apify (role + company) + ATS feeds ──▶ Discovery ──▶ job_events (bus + audit)
                                                        │
   Enrichment (classify → resume-match → skills → salary) ──▶ Recommendation ──▶ Notifications
                                                        │                          (Telegram/Notion)
                                        Supabase Postgres ──▶ Next.js dashboard (Vercel)
```

- **Immutable source** (`jobs`) vs. **versioned AI output** (`job_enrichments`) — reclassify or
  compare models without touching source data.
- **Event-driven**: stages emit/consume `job_events`; each is idempotent & independently retryable.
- **Free AI** behind `lib/ai/AIService` — Gemini (default) / Cerebras / Grok, swappable per stage.
- **Confidence-gated**: low-confidence classifications route to a review queue.
- Salary is **parsed only** when stated — never LLM-estimated.

> **Implementation note:** all backend logic is one TypeScript codebase (`lib/` + `services/`,
> run with `tsx`), exposed via thin webhook/cron entrypoints, with Supabase as Postgres. This keeps
> a single language/runtime (vs. splitting Deno Edge Functions + Node) — easier to run free and
> maintain solo, while preserving the plan's service/stage/event-bus boundaries.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in keys (all free tiers — see `.env.example`).
3. Apply the schema to your Supabase project: run `supabase/migrations/0001_schema.sql`
   (via the Supabase SQL editor, `supabase db push`, or the MCP `apply_migration`).
4. Seed your profile/resume and watchlist (Phase 2+ helper scripts).
5. Configure Apify tasks + webhook: see [`apify/task-config.md`](apify/task-config.md).

## Scripts
| command | what it does |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npx tsx tests/discovery.test.ts` | offline discovery-logic checks (no creds) |
| `npm run ingest -- --file <json> --source <src>` | ingest postings from a file |
| `npm run ingest -- --run <apifyRunId> --source <src>` | ingest an Apify run |
| `npm run dev` | dashboard at http://localhost:3000 |
| `npm run build` | production build of the dashboard |
| `npm run dashboard` | regenerate the standalone `dashboard-live.html` snapshot |

## Dashboard
A Next.js app in `app/` that reads Supabase **directly from the browser** using the anon key —
no server layer, no API routes (D-110). It needs two extra env vars in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Both are public by design and are compiled into the shipped bundle. What keeps the data safe is
migration `0015` + `0016` (D-157): anon can read `v_jobs_public` and `remote_companies` and
nothing else, and recruiter contact columns are excluded from its grants on `jobs` and
`job_enrichments`. The **Remote Companies tab deliberately publishes recruiter contact details**
(D-142/D-156) — that tab is the one thing on the site that is not safe to widen further.

Three things render the same design and share one stylesheet (`styles/dashboard.css`) and one set
of formatting rules (`lib/dashboardFormat.ts`): `dashboard-mock.html` (the design, D-93), the
`npm run dashboard` snapshot (D-119), and this app.

Deploying: import the repo at vercel.com and set the two `NEXT_PUBLIC_*` vars in project settings.

## Status
- ✅ Phase 0 — scaffold, schema, AI abstraction
- ✅ Phase 1 — discovery / ingest (dedup, source reliability, idempotency)
- ✅ Phase 2 — enrichment (classify / resume-match / skills / salary / recommend)
- ✅ Phase 3 — notifications (Telegram instant + Notion; digest for med/low)
- ⬜ Phase 4–6 — ATS pollers, freshness/link-check, pipeline + learning loop
- ⬜ Phase 7–8 — dashboard + golden tests
- ⬜ Phase 9 — semantic search (deferred)

## Live environment
- Supabase project **`gwvrpdkiblozwdwoqsgd`** (D-96) — this is the canonical project and the one
  `.env.local` points at. Earlier docs naming `cdjgxrmeoqiogylveagr` (D-36) or
  `xxfeagpjaxudhbihjruq` (D-88) are stale; the latter is permanently unreachable.
- Schema is applied and current: migrations `0001` through `0016`, all in `supabase/migrations/`.
  RLS is on (`0009`, `0014`); the public read surface is `v_jobs_public` (`0015` + `0016`, D-157
  as amended by D-161).

## Direction
This tracker is the foundation of a larger **AI Job Application OS** (evolve, don't rewrite). The
lane-ready prep (`0002`) is in place; next is verifying the current pipeline on real data, then the
Qualification stage + deterministic Lane Engine. See `plans.md`, `decisions.md` (D-17→D-28), and
`backlog.md`.
