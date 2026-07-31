# Plans — Remote PM Job Tracker

Finalized plan content copied here for durability. Original path (may be cleared later):
`~/.claude/plans/i-m-thinking-of-creating-staged-wave.md`

> **Location update (2026-07-28, Session 3):** this project now lives at
> `~/Documents/ApplicationOS/job-tracker/` (moved from `~/Documents/Job Postings`), as one module in
> a multi-module `ApplicationOS` workspace — see `WORKSPACE.md` at the workspace root. Everything
> below is unchanged and still the active plan; the workspace adds one new prerequisite ahead of
> Phase 2 (Qualification + Lane Engine): extract shared business concepts (e.g. "job posting" vs.
> "the act of applying") from Resume Builder + Job Tracker into `@app-os/contracts` first. Not yet
> confirmed whether this blocks or runs parallel to the still-pending real-data verification — see
> `decisions.md` D-29 and `session-summary.md` Session 3.

---

# Plan (approved 2026-07-10) — Remote PM Job Tracker

## Context
Always-on, **free-to-run** system that discovers newly-posted **remote (India-eligible)** roles in
Product Management and adjacent tracks (Product Operations, Product Analyst, AI Product Operations,
Product Specialist, Technical Product Specialist) at AI/SaaS/B2C companies; delivers each match with
**company, JD, apply link** the moment it appears; then helps triage, track, and continuously improve
the search. More than a tracker via: rich enrichment (tags, skills, salary, resume match, AI
priority); full lifecycle with decision logging (Jobs → Classification → Application → Interview →
Offer → Learning); a learning loop correlating outcomes back to resume versions, skills, companies,
filters. Discovery works by **role keyword** *and* **company watchlist** (Anthropic, OpenAI,
Perplexity, Cursor, Lovable, Vercel, Canva, Atlassian, HubSpot, Figma, Notion…) since companies post
under inconsistent titles ("Product Lead", "Growth PM", "AI Solutions Manager"). Constraint: free
tier only; AI via Gemini (default)/Cerebras/Grok behind an `AIService` abstraction — no Claude/paid.

## Architectural principles (staff-review outcomes)
1. Immutable source (`jobs`) vs. versioned AI output (`job_enrichments`).
2. Preserve original JD (raw HTML/MD + cleaned text + parsed fields; never overwrite).
3. Confidence-gated trust (>0.9 auto · 0.6–0.9 normal · <0.6 → `needs_review`).
4. Source reliability (Greenhouse/Lever/careers=High, LinkedIn/Indeed=Medium; canonical = most reliable).
5. Version everything AI (`classifier_version` + `prompt_version` + provider/model).
6. Clear service boundaries (Discovery · Enrichment · Recommendation · Notification · Analytics).
7. Event-driven (`job_events` bus; retries, parallelism, audit).
8. Incremental analytics (rollups vs. recompute).
9. Accuracy over speculation (parse salary only when stated; no LLM estimation).

## Services
- **Discovery:** Apify actors (LinkedIn/Indeed/Google) role + company tasks; ATS feeds
  (Greenhouse/Lever/Ashby) for watchlist; authenticated webhook → ingest (store raw+clean JD, assign
  reliability, cross-source dedup → `canonical_job_id`, drop non-remote/non-India, emit `JobCreated`).
- **Enrichment (event-driven, versioned, confidence-gated, idempotent):** classify (tags + reasoning
  + confidence; recruiter extract; <0.6 → needs_review); resume match (0–100 vs active resume);
  skills (normalized `skills[]`); salary (parse-only).
- **Recommendation:** priority high/med/low (company weight + match + salary + AI + seniority) +
  reason chips.
- **Notification:** Telegram (High=instant, Med/Low=digest, only un-notified); Notion upsert;
  rate-limited + retried; idempotent.
- **Analytics (incremental):** company rollup, skills-gap, freshness, funnel, AI cost; learning loop
  (response/interview rate by resume version, fastest-responding companies, skills↔interviews,
  filter-miss analysis, learning-priority suggestions).

## Data model (Supabase Postgres)
- `jobs` (immutable source): id, source, external_id UNIQUE(source,external_id), canonical_job_id,
  source_reliability, company, company_slug, role_title, apply_url, location, posted_at, jd_raw,
  jd_clean, parsed jsonb, first_seen_at, last_checked_at, link_status, recruiter_*, hiring_manager.
- `job_enrichments` (versioned, one active row per (job,stage)): stage, is_active, classifier_version,
  prompt_version, provider, model, confidence, needs_review, classify tags, resume_match_score,
  resume_version_id, skills[], salary_*, salary_status, priority, recommend_reasons, raw_output.
- `job_tracking` (user-mutable): status, notes, locked_fields[], resume_version_used.
- Supporting: profile; resume_versions; company_watchlist; decisions; status_history; job_events
  (bus+audit); ai_usage; processed_runs (idempotency); rollup_company/skills/funnel/ai_cost.
- Views: v_jobs_enriched, v_company_rollup, v_freshness, v_skill_gap, v_ai_cost.

## Dashboard (Vercel/Next.js)
Company-grouped list, all filters, why-recommended chips + priority + match %, review queue,
skills-gap, incremental analytics, learning insights, pipeline board (decisions, recruiter, notes).
Operator tools: manual override (edits → locked_fields), reprocessing (new enrichment version,
respects locks), CSV/JSON export. Single-user → Supabase Auth/shared password; anon key + RLS.

## Cross-cutting
AI abstraction (Gemini default/Cerebras/Grok); observability (job_events); cost/quota (ai_usage →
rollup_ai_cost); idempotency (dedup keys, processed run ids, guarded notifications); security
(service-role server-only, anon+RLS, authenticated webhooks, rate-limit+retry); tests (golden 20–30
JDs regression runner).

## Build order
0 Setup · 1 Discovery · 2 Enrichment · 3 Recommendation+Notifications · 4 Company+ATS · 5 Freshness &
linkcheck · 6 Pipeline/decisions/learning · 7 Dashboard · 8 Golden tests · 9 (later) Semantic search
(pgvector + free Gemini embeddings).

## Verification (end-to-end)
Discovery/dedup/idempotency; enrichment versioning (v1/v2 side-by-side); confidence gate → review
queue; immutability/overrides survive reprocess; provider swap; salary parsed-or-unknown; event
flow/audit + isolated stage retry; notify (High instant/Low digest); decisions/learning queries;
rollups incremental; export/tests/security (no secrets in client bundle).

## Go-live execution (this session)
1. Create Supabase project `job-tracker` (org dnnaykjkbrtwjuzonnal, ap-south-1, free $0/mo). ✅
2. Apply `0001_schema.sql`. ✅
3. Seed `company_watchlist` (11 companies). ✅
4. Report URL + anon key; Sakshi pastes `SUPABASE_SERVICE_ROLE_KEY` + `GEMINI_API_KEY` into `.env`. ⏳
5. Verify core: `npm run ingest -- --file tests/fixtures/sample-linkedin.json --source linkedin` →
   `npm run dispatch` → inspect `v_jobs_enriched` + `job_events`. ⏳
6. Then continue Phase 3 (done) → 4–6 → 7–8 → 9.

## Open items
- Notion: existing DB or new one (see docs/NOTION_SETUP.md).
- Dashboard auth: Supabase Auth vs. shared password.
- Provide resume text/file to seed `profile` + first `resume_versions` row.
- Which free AI keys first (Gemini recommended; Cerebras/Grok optional).

---

# Product evolution → AI Job Application OS (approved 2026-07-10)

**Directive:** evolve the Remote Job Tracker into an **AI Job Application OS** — do NOT rewrite. Keep
the event bus, `AIService`, versioned enrichments, and staged pipeline exactly as built. All changes
additive. **New vision:** *discover, qualify, prioritize, and execute high-quality applications with
the least manual effort* — cut discover→submit from hours to ~1 hour. LinkedIn/Google/Wellfound/YC are
inputs; the OS is the decision engine.

**Primary object (conceptual):** `Job → Inbox → Qualification → Lane → Application`. No renames until
the pipeline is validated on real data.

**Qualification (P2, added on top of `recommend`):** an AI `qualify` stage emits **structured signals**
(background_match, seniority_match, remote_compat, company_quality, builder_culture, referral_value,
portfolio_value; later hiring_probability, startup_stage) + an AI **Opportunity Score** (0–100,
overridable → locked). Never emits a lane directly.

**Three concepts replacing "Interest":** Personal Preference (user-only, AI never writes) · Opportunity
Score (AI) · Goal Match (ONE active goal in `app_config`, no weighting engine in v1).

**Lane Engine (deterministic, config rules — not AI):** signals + active goal → Lane A/B/C/D +
reasons + recommended asset actions. Rules in config, so strategy changes touch rules, not schema.
v1: A = referral + tailored resume · B = product artifact + founder outreach · C = resume only · D = skip.

**Urgency ≠ Lane:** rename `priority` → `urgency` (P2); urgency computed independently (deadline, job
age, hiring status, source freshness, dream-company) and drives alert timing; lane does not.

**Discovery = multi-source:** Apify · ATS · Chrome Extension · Manual → one `RawPosting` → existing
`ingestPostings()`. Extension does ZERO AI (capture + POST). `source` is a first-class analytics dim.

**Application Assets (P4, schema DEFERRED):** resume · referral · founder_message · cover_letter ·
portfolio_artifact, extracted from Projects 2/3 one at a time (never merged). Do NOT create
`application_assets` until the existing apps are analyzed.

**Architecture FROZEN (D-28):** ship-first; change only for scalability / data-loss / expensive-
migration reasons. Ideas → `backlog.md`.

## Lane-ready prep — DONE this session (`0002_lane_ready.sql`, additive, no behavior change)
- `job_enrichments` += `signals jsonb`, `opportunity_score`, `lane`, `lane_reasons`, `urgency`,
  `qualification_version`, `lane_rules_version`; stage CHECK dropped (app-validated via `EnrichStage`).
- `job_tracking` += `dream_company`, `avoid_company`, `domain_interest[]`, `referral_needed`,
  `referral_status`, `person_contacted`; `'inbox'` added to status CHECK.
- New `app_config` seeded (`active_goal="ai_pm"`). `v_jobs_enriched` extended with `qualify` join
  (no terminal-stage assumption). `application_assets` intentionally NOT created.
- Code: `QualificationDone` event reserved; ingest filter config-driven (`INGEST_REMOTE_FILTER`,
  default `on`).

## Execution order (agreed 2026-07-10)
1. ✅ Apply `0002_lane_ready.sql` (excl. application_assets). 2. ✅ Low-risk evolvability improvements.
3. ⏳ **Verify current pipeline on real jobs** → ranked report (blocked on 2 `.env` secrets).
4. Build Qualification + Lane Engine (after approval). 5. Chrome Extension. 6. Analyze Resume Builder +
Startup Outreach. 7. Design + create `application_assets`. 8. Extract capabilities one at a time.
9. Rename to Application OS.

Original plan path: `~/.claude/plans/i-m-thinking-of-creating-staged-wave.md`.
