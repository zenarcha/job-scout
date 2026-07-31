# Session Summary — Remote PM Job Tracker

Running log, newest at the bottom.

---

## Session 1 — 2026-07-10

### What happened this session

**Planning (heavily iterated).** Started from Sakshi's idea for a job-scraping tool for remote
PM-track roles. Refined the plan across five rounds as she added scope: from a basic scraper to a
self-improving job-search system. The approved plan lives in `plans.md` (copied from
`~/.claude/plans/i-m-thinking-of-creating-staged-wave.md`). Key shape: event-driven services,
free-only AI, immutable-source-vs-versioned-AI data model, full lifecycle + learning loop.

**Backend built — Phases 0–3, all typecheck-clean, offline tests passing.**
- *Phase 0:* repo scaffold (`package.json`, `tsconfig.json`, `.env.example`), full schema
  `supabase/migrations/0001_schema.sql` (15 tables + 5 views), seed `seed/company_watchlist.json`,
  AI abstraction `lib/ai/*` (Gemini default + Cerebras/Grok adapters, versioned prompts).
- *Phase 1:* discovery/ingest — `lib/discovery/*` (cleanJd, reliability, dedup, normalize, apify) +
  `services/discovery/{ingest,webhook}.ts`. Idempotent, cross-source canonical dedup,
  source-reliability. `tests/discovery.test.ts` passes.
- *Phase 2:* enrichment — `lib/enrich/*` (classify, resumeMatch, skills, salary parse-only, recommend)
  + `pipeline.ts`. Versioned + confidence-gated + override-aware via `writeEnrichment.ts`.
  `tests/enrich.test.ts` passes.
- *Phase 3:* notifications — `lib/telegram.ts`, `lib/notion.ts`, `services/notify/notify.ts` (High =
  instant, Med/Low = digest, idempotent via `NotificationSent` events). `docs/NOTION_SETUP.md` written.

**Went live.** Created a dedicated Supabase project `job-tracker` (`gwvrpdkiblozwdwoqsgd`,
`ap-south-1`, free $0/mo), applied the schema (fixed one SQL bug — see learnings), seeded the
11-company watchlist. `.env` pre-filled with URL + anon key.

### Decisions / amendments
D-1 Apify + ATS source · D-2 Dashboard+Notion+Telegram · D-3 remote-India-only scope, rest as tags ·
D-4 Supabase+Vercel hosting · D-5 free-only, Gemini/Cerebras/Grok behind AIService · D-6 immutable
jobs vs versioned enrichments · D-7 confidence gating · D-8 source-reliability dedup · D-9 version all
AI · D-10 event-driven bus · D-11 incremental analytics · D-12 parse-only salary (removed LLM
estimation) · D-13 one-TS-codebase backend · D-14 new dedicated Supabase project · D-15 get-it-live-
first · D-16 notification idempotency via events. (Full detail in `decisions.md`.)

### Next steps (ordered, actionable)
1. **Sakshi:** paste two secrets into `.env` — `SUPABASE_SERVICE_ROLE_KEY`
   (https://supabase.com/dashboard/project/gwvrpdkiblozwdwoqsgd/settings/api-keys) and
   `GEMINI_API_KEY` (https://aistudio.google.com/apikey, free).
2. **Verify core end-to-end:** `npm run ingest -- --file tests/fixtures/sample-linkedin.json --source
   linkedin` then `npm run dispatch`; confirm in DB: onsite dropped, LinkedIn+Greenhouse dupes →
   one canonical (Greenhouse wins), Acme AI role classified/skilled/matched/prioritized, and the
   `JobCreated→…→RecommendationDone` trail in `job_events`.
3. **Phase 4–6:** ATS pollers (`lib/ats.ts` Greenhouse/Lever/Ashby), `linkcheck()` dead-link archive,
   pipeline statuses + `decisions` + `status_history`, incremental rollups + learning loop.
4. **Phase 7–8:** Next.js dashboard (grouped list, filters, review queue, analytics, learning,
   pipeline, overrides, reprocess, export) on Vercel + auth/RLS; golden-dataset test harness.
5. **Phase 9 (later):** semantic search (pgvector + free Gemini embeddings).
6. **Decide when ready:** Notion new-vs-existing DB; dashboard auth (Supabase Auth vs shared
   password); provide resume text to seed `profile` + first `resume_versions`.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 2 — 2026-07-10 (product evolution → Application OS + lane-ready prep)

### What happened this session

**Product reframed (not rebuilt).** Sakshi brought a synthesis reframing the Remote Job Tracker as the
foundation of a larger **AI Job Application OS**. Core principle: *evolve, don't rewrite; extract
capabilities, don't merge projects.* The existing architecture (event bus, `AIService`, versioned
enrichments, staged pipeline) was confirmed as the right substrate and left untouched.

**Architecture converged over several refinement rounds, then FROZEN.** Agreed concepts: primary object
`Job → Inbox → Qualification → Lane → Application`; store **signals not decisions** with a deterministic
**Lane Engine** (config rules); "Interest" split into Personal Preference (user) / Opportunity Score
(AI) / Goal Match (one active goal); **Lane ≠ Urgency** (`priority`→`urgency` later); multi-source
discovery (Apify/ATS/Chrome-extension/manual → `RawPosting`); AI-free Chrome extension; Application
Assets as extract-not-merge modules with **schema deferred to P4**; qualification/lane-rules versioning;
Job Inbox as a `status` value. Then the user froze the architecture (evidence-driven changes only).

**Lane-ready prep executed (Steps 1–2, additive, zero behavior change, no renames).**
- Applied `0002_lane_ready.sql` to the live DB (verified): new nullable qualification/lane/urgency/
  version columns on `job_enrichments`; loosened stage CHECK; preference + referral fields and `'inbox'`
  status on `job_tracking`; `app_config` seeded `active_goal="ai_pm"`; `v_jobs_enriched` extended with a
  `qualify` join. `application_assets` deliberately NOT created.
- Code: reserved `QualificationDone` event; made the ingest remote filter config-driven
  (`INGEST_REMOTE_FILTER`, default `on`). `tsc` clean; both offline test suites pass.
- Created `backlog.md`; logged decisions **D-17→D-28**; added learnings entries.

### Decisions / amendments
D-17 primary object Job→Qualification→Application (no rename yet) · D-18 store signals not decisions
(Lane Engine) · D-19 Interest → {Personal Preference, Opportunity Score, Goal Match} · D-20 Lane ≠
Urgency (priority→urgency) · D-21 multi-source discovery + AI-free extension · D-22 `source` first-class
dim · D-23 Application Assets extract-not-merge, schema deferred to P4 · D-24 validate before lanes ·
D-25 one active goal (no weighting) · D-26 qualification/lane-rules versioning · D-27 Inbox as a
`status` value · D-28 freeze architecture. (Full detail in `decisions.md`.)

### Next steps (ordered, actionable)
1. **Sakshi:** add the two `.env` secrets — `SUPABASE_SERVICE_ROLE_KEY`
   (https://supabase.com/dashboard/project/gwvrpdkiblozwdwoqsgd/settings/api-keys) and `GEMINI_API_KEY`
   (https://aistudio.google.com/apikey). Optionally provide an Apify token / pick a public ATS board for
   richer real-data verification than the 3-row fixture.
2. **Run verification:** `npm run ingest -- --file tests/fixtures/sample-linkedin.json --source linkedin`
   (+ any real Apify/ATS pull) → `npm run dispatch`; then produce the **ranked verification report**
   (Discovery · Enrichment · Recommendation · Data quality — incl. JSON→first-class-column candidates
   and migration-risk flags). Do NOT auto-implement fixes.
3. **Wait for approval**, then build **P2**: `qualify` stage (signals + opportunity_score, overridable→
   locked) → deterministic Lane Engine (config rules, single `active_goal`) → time-based `urgency`
   (separate from lane) → views. Build the golden-dataset harness alongside.
4. Later: P3 Chrome extension (+ wire `inbox` skip) → P4 analyze Projects 2/3, design `application_assets`
   → extract capabilities one at a time → P5 rename to Application OS.
5. Still-pending from Session 1: Notion new-vs-existing DB decision; dashboard auth; seed resume.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*
