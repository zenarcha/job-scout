# Decision Log — Remote PM Job Tracker

Every decision with its reasoning, the alternatives rejected, and when. Newest at the bottom.

---

## D-1 — Data source: Apify (managed scraping) + company ATS feeds
**2026-07-10 03:16 IST**
Discovery uses Apify actors (LinkedIn/Indeed/Google Jobs) for role- and company-based search,
supplemented by direct Greenhouse/Lever/Ashby ATS APIs for watchlist companies.
- **Why:** Apify handles proxies/anti-bot so it's far more robust than DIY scraping; ATS feeds are
  free, legal, and freshest for the specific AI/SaaS companies Sakshi targets.
- **Options considered:** (a) direct free scraping of Google/LinkedIn — rejected: fragile, breaks
  constantly, IP-ban risk, ToS violation. (b) SerpAPI Google Jobs — rejected: reliable but paid,
  and Sakshi requires free-only. (c) ATS-only — rejected: too narrow, misses companies not on a
  supported ATS.

## D-2 — Delivery across three surfaces: Dashboard + Notion + Telegram
**2026-07-10 03:16 IST**
- **Why:** Sakshi wants instant alerts (Telegram), a tracker she can filter/manage (Notion), and a
  rich browsing/analytics surface (web dashboard) — each serves a different moment.
- **Options considered:** email digest only — rejected: no tracking/filtering; single surface —
  rejected: Sakshi explicitly asked for all three.

## D-3 — Scope: remote + India-eligible only; everything else is a filterable tag
**2026-07-10 03:16 IST**
Hard-drop non-remote / non-India. Tech-vs-non-tech, AI-vs-non-AI, SaaS/B2C, and IIT/IIM-requirement
are computed **tags**, not drops.
- **Why:** India-eligibility + remote are non-negotiable constraints; the rest are triage signals
  Sakshi wants to filter on, not exclude.
- **Options considered:** making IIT/IIM a hard filter — rejected: she wants to *identify* it, then
  decide, not auto-exclude.

## D-4 — Hosting: Supabase (Postgres + scheduling) + Vercel (dashboard)
**2026-07-10 03:16 IST**
- **Why:** always-on, free tier, both already connected to Sakshi's account; Supabase gives Postgres
  + always-on execution, Vercel hosts the dashboard.
- **Options considered:** local scheduled script on her Mac — rejected: only runs when the machine is
  on, defeats "as soon as listed."

## D-5 — Free tier only; AI via Gemini (default) / Cerebras / Grok behind an `AIService` — never Claude/paid
**2026-07-10 03:16 IST**
- **Why:** Sakshi's hard constraint is $0 cost. An `AIService` abstraction lets any stage swap
  providers via env with no code change.
- **Options considered:** Claude/OpenAI — rejected: paid. Hard-coding one provider — rejected: no
  fallback if a free tier's quota runs out or quality regresses.

## D-6 — Split immutable `jobs` from versioned `job_enrichments`
**2026-07-10 03:16 IST**
Source posting data is immutable; every AI output is a separate versioned row.
- **Why:** lets us reclassify, compare models side-by-side, and debug bad tags without corrupting
  source data.
- **Options considered:** storing AI fields directly on `jobs` — rejected: re-running enrichment
  would mutate the source record and lose history.

## D-7 — Confidence-gated trust with a review queue
**2026-07-10 03:16 IST**
`confidence >0.9` auto-apply · `0.6–0.9` normal · `<0.6` → `needs_review`.
- **Why:** classifications aren't always right; low-confidence ones should be flagged, not trusted
  silently.
- **Options considered:** trust all AI output — rejected: erodes trust when a tag is wrong.

## D-8 — Source-reliability ranking drives cross-source dedup
**2026-07-10 03:16 IST**
ATS (Greenhouse/Lever/Ashby/careers) = High; LinkedIn/Indeed = Medium. Duplicate roles across
sources collapse to one `canonical_job_id`; the highest-reliability copy is canonical.
- **Why:** the same role appears on multiple boards; the cleanest source should represent it.
- **Options considered:** first-seen wins — rejected: a noisy LinkedIn copy could beat a clean
  Greenhouse one.

## D-9 — Version everything AI (classifier + prompt + provider/model)
**2026-07-10 03:16 IST**
Every enrichment row stores `classifier_version`, `prompt_version`, `provider`, `model`.
- **Why:** when quality shifts, we must know whether the prompt or the model caused it.
- **Options considered:** versioning only the classifier — rejected: can't distinguish prompt vs.
  model changes.

## D-10 — Event-driven pipeline (`job_events` bus) rather than a linear monolith
**2026-07-10 03:16 IST**
Stages emit/consume events on an append-only `job_events` log that doubles as the audit trail.
- **Why:** easy retries, parallelism where safe, clean observability ("why wasn't I notified?").
- **Options considered:** one big `classify()` step — rejected: hard to retry one part, swap models
  per task, or debug.

## D-11 — Incremental analytics rollups
**2026-07-10 03:16 IST**
Maintain rollup tables as events arrive instead of recomputing over all history.
- **Why:** scales as the dataset grows into thousands of jobs.
- **Options considered:** recompute-on-read views only — kept for convenience views, but heavy
  aggregates use rollups.

## D-12 — Parse-only salary; no LLM estimation
**2026-07-10 03:16 IST**
Extract salary only when explicitly stated (deterministic regex); otherwise `unknown`.
- **Why:** for a job-search assistant, accuracy beats speculative completeness — a wrong estimate
  erodes trust.
- **Options considered:** LLM-estimate missing salaries — rejected on staff-review: misleading;
  external salary dataset deferred to a later phase.

## D-13 — Backend as one TypeScript codebase (`lib/`+`services/`, run via `tsx`) with Supabase Postgres
**2026-07-10 03:16 IST**
Consolidated backend instead of splitting Deno (Supabase Edge Functions) + Node (Next.js).
- **Why:** one language/runtime, shared code, one deploy — far easier to run free and maintain solo,
  while still preserving the service/stage/event-bus boundaries.
- **Options considered:** Supabase Edge Functions in Deno for stages — rejected: forces duplicating
  logic across Deno and Node and a second deploy target.

## D-14 — New dedicated Supabase project `job-tracker` (not the existing paused one)
**2026-07-10 03:16 IST**
Created `job-tracker` (`gwvrpdkiblozwdwoqsgd`, `ap-south-1`, org "Hello Bump", free $0/mo).
- **Why:** keeps job-tracker data isolated from the unrelated paused `funded-company-v1` project.
- **Options considered:** reuse `funded-company-v1` — rejected: mixes two apps in one DB; self-setup
  by Sakshi — rejected: slower, and the connection could provision it cleanly for free.

## D-15 — "Get it live first," then continue building
**2026-07-10 03:16 IST**
Stand up the DB + minimal keys and verify ingest→enrich on real data before building Phases 4–8.
- **Why:** nothing (especially classification quality) is verifiable until it runs on real data;
  building five more phases on an unverified foundation compounds risk.
- **Options considered:** build all phases then test at the end — rejected: risks accumulating
  unverified integration bugs.

## D-16 — Notification idempotency via a `NotificationSent` event (no `notified_at` column)
**2026-07-10 03:16 IST**
A job is notified once; the guard is the existence of a `NotificationSent` row in `job_events`.
- **Why:** reuses the existing event bus for the guard; avoids adding/backfilling a column.
- **Options considered:** a `notified_at` timestamp column — rejected: redundant with the audit log.

---

# Product evolution → AI Job Application OS (2026-07-10, later session)

## D-17 — Conceptual primary object becomes `Job → Qualification → Application`
**2026-07-10 03:30 IST**
The product evolves from a Remote Job Tracker into an AI Job Application OS. Recommendation becomes
part of a broader Qualification concept. **No renaming yet** — evolve after validation.
- **Why:** the goal is cutting discover→submit from hours to ~1 hour with better quality; "qualify"
  captures the strategic decision better than "recommend."
- **Options considered:** (a) rename recommend→qualify now — rejected: churns every service/event/test
  before the pipeline is proven on real data. (b) full rewrite — rejected: the existing architecture
  already supports this; evolve, don't rewrite.

## D-18 — Store signals, not decisions; a deterministic Lane Engine computes the lane
**2026-07-10 03:30 IST**
AI emits structured qualification signals; a separate deterministic engine maps signals → Lane A/B/C/D
via **configurable rules**, not hardcoded AI output.
- **Why:** strategy will change (referral-first today, portfolio-first tomorrow); signals stay stable,
  only lane rules evolve — future-proof.
- **Options considered:** letting the AI output the lane directly — rejected: bakes today's strategy
  into model output and makes historical comparison/reweighting impossible.

## D-19 — Replace "Interest" with three separated concepts
**2026-07-10 03:30 IST**
Personal Preference (user-controlled, AI never writes), Opportunity Score (AI composite, overridable →
locked), and Goal Match (configurable active goal).
- **Why:** "Interest" conflated a user's explicit preference, an AI assessment, and a strategy setting —
  three different owners and lifecycles.
- **Options considered:** a single AI "interest" signal — rejected: AI would overwrite user intent and
  couldn't represent an evolving job-search goal.

## D-20 — Lane ≠ Urgency; `priority` → `urgency` (introduced in P2)
**2026-07-10 03:30 IST**
Lane answers "which application strategy?"; Urgency answers "how fast to act?" and is computed
independently (deadline, job age, hiring status, source freshness, dream-company). Urgency drives
alert timing; lane does not.
- **Why:** decouples strategy from timing so lane definitions can change without touching notifications.
- **Options considered:** keep a single `priority` driving both — rejected: conflates two independent
  axes; changing lane logic would wrongly change alerting.

## D-21 — Multi-source discovery; the Chrome extension is AI-free
**2026-07-10 03:30 IST**
Discovery generalizes to Apify · ATS · Chrome Extension · Manual Import, all producing `RawPosting`.
The extension only captures + POSTs; all qualification happens server-side.
- **Why:** keeps the extension tiny and keeps one place (the pipeline) making decisions.
- **Options considered:** qualification inside the extension — rejected: duplicates logic, bloats the
  extension, and splits the decision engine.

## D-22 — `source` is a first-class analytics dimension
**2026-07-10 03:30 IST**
Keep/treat `jobs.source` as a first-class dimension for later source-level analytics (e.g. interview
rate by source).
- **Why:** "which source gives the highest interview rate?" is a question worth answering later.
- **Options considered:** treating source as an incidental field — rejected: would lose source-level
  outcome analytics.

## D-23 — Application Assets = extract-not-merge; schema DEFERRED to Phase 4
**2026-07-10 03:30 IST**
Resume/referral/founder-outreach/cover-letter/portfolio become modules extracted from Projects 2/3 one
at a time. **Do not create `application_assets` yet.**
- **Why:** we don't yet know the right asset model (versioned? editable? annotations? belongs to which
  version? immutable vs regeneratable?) — design it from the real code, not up front.
- **Options considered:** create `application_assets` now in `0002` — rejected: premature schema before
  analyzing the existing apps; risks an expensive migration later.

## D-24 — Validate the current pipeline on real data before building lanes
**2026-07-10 03:30 IST**
Do the additive lane-ready prep now, but implement the Qualification stage + Lane Engine only after
verifying ingestion → enrichment → recommendation on real jobs.
- **Why:** avoid debugging two major systems at once; let real data drive schema/decisions.
- **Options considered:** build lanes immediately in parallel — rejected: stacks unverified intelligence
  on an unvalidated foundation.

## D-25 — Goal Match starts as exactly ONE active goal (no weighting engine)
**2026-07-10 03:30 IST**
v1 supports a single active goal in `app_config` (seeded `ai_pm`); multiple weighted goals only if a
real need appears.
- **Why:** avoid over-engineering a weighting system before the simplest version proves useful.
- **Options considered:** multi-goal weighting now — rejected: speculative complexity.

## D-26 — Version the qualification logic too (`qualification_version`, `lane_rules_version`)
**2026-07-10 03:30 IST**
Extend the versioning philosophy to qualification + lane rules.
- **Why:** answer "why Lane C then, Lane A now?" and "did interview rate improve after a rules change?"
- **Options considered:** version only classifier/prompt/model — rejected: couldn't attribute lane
  changes to rule evolution.

## D-27 — Job Inbox represented as a `job_tracking.status = 'inbox'` value
**2026-07-10 03:30 IST**
"Captured but not yet processed" is a new `status` value, not a new table. Scraped jobs default to
`new` (auto-qualified); extension/manual saves use `inbox`; enrichment will later skip `inbox`.
- **Why:** simplest representation using existing concepts; matches "save now, review later."
- **Options considered:** a separate inbox table / state machine — rejected: unnecessary schema for a
  lightweight queue.

## D-28 — Freeze the baseline architecture; evidence-driven changes only
**2026-07-10 03:30 IST**
From here, optimize for shipping. Change architecture only if it prevents scalability, causes data
loss, or forces an expensive future migration. Non-essential ideas go to `backlog.md`.
- **Why:** the design has converged; continued speculative redesign delays shipping.
- **Options considered:** keep iterating the design — rejected: diminishing returns vs. validating on
  real usage.

---

# Session 3 (2026-07-28) — workspace relocation discovered

## D-29 — Adopt job-tracker's new home inside the ApplicationOS multi-module workspace
**2026-07-28 (time not captured — discovered mid-session)**
Between Session 2 (2026-07-10/11) and this session, a separate effort (outside this conversation)
restructured the project: `~/Documents/Job Postings` no longer exists; this project now lives at
`~/Documents/ApplicationOS/job-tracker/`, alongside sibling modules `resume-builder/` (live, own git
repo — the "JD → Resume Builder" prototype) and `app-os-contracts/` (new, currently empty — shared
business-concept types). Governed by a `WORKSPACE.md` at the workspace root with its own decision
record (its own D-1, a separate numbering scope from this file). This session verified the move was
content-neutral: `decisions.md` still ended at D-28, `session-summary.md` still ended at Session 2,
`.env` still has both blocking secrets empty, and job-tracker is not yet git-initialized — nothing
from Session 1–2 was lost or altered.
- **Why record this:** the working directory itself changed — every future session needs the new
  path, not the old one — and the workspace imposes a new rule set (modules talk only through
  `@app-os/contracts`, never each other's code; no monorepo) plus a new prerequisite: `WORKSPACE.md`
  states that before further Job Tracker implementation, both Resume Builder's and Job Tracker's
  requirements should be analyzed to extract shared business concepts (correctly separating "the job
  posting" from "the act of applying") into `@app-os/contracts`.
- **Options considered:** (a) ignore the workspace restructuring and keep working as if
  `~/Documents/Job Postings` still applies — rejected: the path no longer exists, and ignoring the
  module-boundary rules would contradict our own D-23 (extract-not-merge), which independently landed
  on the same philosophy. (b) Immediately execute the contracts-extraction prerequisite unilaterally —
  rejected: not yet confirmed with Sakshi whether it applies retroactively (job-tracker is already
  partially built) or only forward, before Phase 2; flagged as an open question instead of decided
  solo.
- **Not yet resolved:** whether the contracts-extraction prerequisite blocks resuming Phase 2
  (Qualification + Lane Engine) or can run in parallel with the still-pending real-data verification.
  Ask Sakshi next session before proceeding down either path.
