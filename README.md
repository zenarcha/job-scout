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

## Status
- ✅ Phase 0 — scaffold, schema, AI abstraction
- ✅ Phase 1 — discovery / ingest (dedup, source reliability, idempotency)
- ✅ Phase 2 — enrichment (classify / resume-match / skills / salary / recommend)
- ✅ Phase 3 — notifications (Telegram instant + Notion; digest for med/low)
- ⬜ Phase 4–6 — ATS pollers, freshness/link-check, pipeline + learning loop
- ⬜ Phase 7–8 — dashboard + golden tests
- ⬜ Phase 9 — semantic search (deferred)

## Live environment
- Supabase project **`job-tracker`** (`gwvrpdkiblozwdwoqsgd`, `ap-south-1`) — schema applied
  (`0001` + additive lane-ready `0002`), watchlist seeded. `.env` pre-filled with URL + anon key;
  add the two TODO secrets to run.

## Direction
This tracker is the foundation of a larger **AI Job Application OS** (evolve, don't rewrite). The
lane-ready prep (`0002`) is in place; next is verifying the current pipeline on real data, then the
Qualification stage + deterministic Lane Engine. See `plans.md`, `decisions.md` (D-17→D-28), and
`backlog.md`.
