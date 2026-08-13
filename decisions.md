# Decision Log — Remote PM Job Tracker

Every decision with its reasoning, the alternatives rejected, and when. Newest at the bottom.

> **Governance:** this file is the only authoritative record of decisions. Setup/how-to docs (e.g.
> `apify/task-config.md`) describe how to configure something already decided here — they are not
> where a decision gets made. See project `CLAUDE.md` for the rule and why it exists (D-30).

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

**Reasoning behind the constraint confirmed 2026-08-04 (user-research, not a new decision)** — see
`user-research.md` Block 5: this is explicitly a **portfolio project**, so she doesn't want to spend
money on it; separately, the paid JD-to-resume-builder subscriptions she looked at before building this
were "very expensive," reinforcing the same constraint from a second angle.

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

**Amended 2026-08-04 (Session 9) — see D-70.** The **review queue is dropped**. Verified this session
that `confidence`/`needs_review` are write-only: produced at `lib/enrich/classify.ts:23`, persisted,
given a partial index (`0001_schema.sql:127-128`) built for a queue, and read by nothing. D-70
replaces the queue with an uncertainty **marker on the Telegram notification** beside the feedback
buttons, and records that self-reported model confidence is a weak accuracy signal — so D-71's
hand-tagged validation pass, not this threshold, is what establishes whether classify can be trusted.
The `>0.9 auto-apply` tier described here was never implemented and nothing branches on confidence.

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

**Implementation note added 2026-08-04 09:41 IST (Session 8) — not a new decision.** Sakshi asked when
`lib/enrich/writeEnrichment.ts` was decided. It was not: it is a Session 1 (2026-07-10) implementation
of D-6 + D-9, never itemised here. Recording the mechanism now so it is inspectable:
- **Supersede, never overwrite.** A re-run marks the current row `is_active = false` and **inserts a
  new row**; both persist. A partial unique index enforces one active row per `(job, stage)`. This is
  what makes "did the new prompt improve things?" answerable — old and new sit side by side.
- **Locked-field carry-over.** Before writing, it reads the user's manual overrides and keeps her value
  for those fields instead of the AI's. As of D-48 the source of that list becomes the new
  `job_feedback` table rather than `job_tracking.locked_fields`.
- **Provenance stamped per row:** `classifier_version`, `prompt_version`, `provider`, `model`,
  `confidence`, `needs_review`, and `raw_output` (the model's full response).
- *Not logged as a decision because it has no cost/vendor/ToS/cadence implication — outside
  `CLAUDE.md`'s rule — but it is load-bearing enough to be written down.*

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
- **Superseded 2026-08-02 — see D-36.** This project (`gwvrpdkiblozwdwoqsgd`) was replaced by a new
  Supabase project (`cdjgxrmeoqiogylveagr`).

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
- **Superseded 2026-08-04 — see `WORKSPACE.md` D-9.** The "no monorepo" rule referenced above is
  reversed; module ownership/boundaries are unchanged, only the repo/DB infrastructure split reverses.

---

# Session 4 (2026-08-01) — process gap found: setup docs were standing in for decisions

## D-30 — `apify/task-config.md` contains unreviewed operational choices, not decisions; open questions logged, not resolved
**2026-08-01**
> **Reframed by D-105 (2026-08-07).** The cadence question here has always been posed as "how often
> can we afford to scrape". The first real run measured that at $0.05 per 50 postings — never the
> binding constraint. The AI free tier enriches ~10 jobs/day, so cadence must be sized to enrichment
> capacity, not Apify spend. Real cost numbers now live in `apify/task-config.md`. Still open.
While explaining discovery to Sakshi, traced a passage about Apify scheduling back to its source and
found it was never actually decided — a prior session (Session 1, building Phase 1) wrote operational
specifics directly into `apify/task-config.md` as if settled, with no decision-log entry and no review.
Four items are flagged here as **open, not resolved** — this entry documents that they need a decision,
it does not make one:
- **Polling/schedule cadence** — doc currently says "every 30–60 min," staggered role vs. company
  tasks. Never validated against Sakshi's "the moment it appears" goal or Apify free-tier compute
  limits.
- **Specific named actors** — `bebity/linkedin-jobs-scraper` / `curious_coder/linkedin-jobs-scraper`
  (doc says "pick one," unresolved) and `misceres/indeed-scraper`. No comparison was ever done; each
  is a vendor lock-in point since `lib/discovery/apify.ts`'s field-mapping is somewhat tolerant to
  actor differences but not fully.
- **Task/schedule staggering** to "stay within free-tier limits" — a stated intent, never checked
  against actual Apify quota numbers.
- **ToS risk posture** — "keep result caps modest" is a risk acceptance written as a caveat, not a
  reviewed decision with alternatives (e.g. ATS-only for stricter compliance, or explicit legal review).
- **Why this matters:** these all have real consequences (freshness, cost, vendor dependency, legal
  exposure) but were never surfaced to Sakshi for a call — they just accumulated in a how-to doc that
  reads with the same authority as a reviewed decision.
- **Options considered:** (a) leave as-is since the system works today — rejected: the whole point of
  `decisions.md` is that reasoning and open questions are visible, not buried in a setup doc. (b)
  unilaterally decide values now (e.g. pick a cadence) — rejected: these are Sakshi's calls to make,
  not something to backfill without her input.
- **Not yet resolved:** all four bullets above remain open. See also the new project `CLAUDE.md`,
  which now requires operational choices with cost/vendor/ToS/cadence implications to be logged here
  or raised to Sakshi before being written into code/config/docs as settled.

**Update 2026-08-02 (Session 5) — partial resolution:**
- **ToS risk posture: resolved.** After reviewing cookieless-mode mechanics, the hiQ Labs v. LinkedIn
  and Proxycurl case law (LinkedIn's actual lawsuits all targeted commercial resale/competing-product
  operations, not personal tools), and a mature GitHub ecosystem of similar personal LinkedIn job
  scrapers operating unbothered for years, Sakshi confirmed she's **comfortable with the current
  posture as researched** — cookieless mode + modest result caps, no further tightening requested.
- **Specific actor: substantially narrowed, not fully closed.** Pricing research found
  `bebity/linkedin-jobs-scraper` and `curious_coder/linkedin-jobs-search-scraper` ("Advanced") both
  charge a flat **$29.99-30/month rental + usage**, which conflicts with this project's own "free-to-run"
  constraint (`plans.md` D-1). `curious_coder/linkedin-jobs-scraper` (basic variant) is pay-per-result
  at **$1.00/1,000 results, no flat fee** — the only one of the three actually compatible with the
  existing free-tier constraint. Leaning toward this by default given the constraint, but not yet an
  explicit sign-off from Sakshi.
- **Polling cadence + staggering: still open, and now a sharper problem than originally framed.**
  Apify's free plan is **$5/month credit, does not roll over**. Repeatedly polling the same search
  re-bills roughly the same standing result set each run (Apify bills per result returned, not per
  genuinely-new result) — so low daily new-job volume (Sakshi's real-world estimate: ~1-2 new matching
  postings/day) does **not** by itself reduce cost the way it might seem to, unless the actor supports
  a "date posted" recency filter to shrink each run's result set toward actual new postings — unverified
  whether `curious_coder/linkedin-jobs-scraper` exposes this. **Recommended next step (not yet done):**
  run the actor once manually for a single real search, observe the actual result count and actual
  Apify charge for that one run, and derive cadence from real numbers rather than theoretical worst-case
  math.

## D-31 — Title scope for v1: entry-level PM naming variants only, not adjacent functions (supersedes original 6-title list)
**2026-08-01 (originally logged same day, corrected same day)**
The original 6 titles (Product Manager, Product Operations, Product Analyst, AI Product Operations,
Product Specialist, Technical Product Specialist) were traced to `plans.md`'s Context section and
`apify/task-config.md` — never logged here with reasoning, same gap pattern as D-30. This entry was
first logged saying "Sakshi confirmed the titles are correct" — that was wrong; it over-interpreted an
ambiguous "yes" to "should I log this gap," not "are these six correct." A longer discussion then
reopened the question properly and reached a real decision, which this entry now records.
- **Decision:** target only the entry-level PM role and its naming variants across companies —
  **Product Manager, Associate Product Manager, Product Associate, Junior Product Manager, Product
  Manager I.** Drop the original five "adjacent" titles entirely — they're different job functions
  (operations, analytics, specialist tracks), not naming variants of the same role.
- **Why:** Sakshi is transitioning into product management and is realistically targeting entry-level
  titles (most companies won't hire a career-changer directly as "Product Manager" — the realistic
  entry point is Associate PM or equivalent). Adjacent functions were never validated as relevant and
  add search noise without a stated reason to include them.
- **Options considered:** (a) keep the original 6 as "PM + adjacent tracks" — rejected: conflates
  different job functions with naming variants of one function; never had evidence adjacent tracks were
  wanted. (b) include "Product Owner"/"Associate Product Owner" as further naming variants — rejected
  for v1 (see D-32-adjacent note below): these roles often skew toward backlog-grooming/execution scope
  rather than full PM scope, and validating which companies use it as a true synonym vs. a narrower role
  would need evaluation effort not worth spending now. Revisit later with evidence if desired.
- **Resolved 2026-08-02 (Session 5):** skip Product Owner/Associate Product Owner for now. No new
  evidence was raised to revisit it — Sakshi confirmed staying with the current five-title v1 scope.
  Still revisit later if real signal appears (unchanged condition from above).

## D-32 — Company watchlist reset to empty; adopt evidence-gated additions ("Option A"), no UI
**2026-08-01**
The original 11 seeded companies (Anthropic, OpenAI, Perplexity, Cursor, Lovable, Vercel, Canva,
Atlassian, HubSpot, Figma, Notion) were traced the same way as D-31's titles: they exist only in
`seed/company_watchlist.json` and one line of `plans.md`'s Context section, never logged here with
reasoning. Sakshi flagged the deeper problem directly: there's no evidence any of these companies are
actually remote-from-India friendly — the list reads like "prominent AI companies," not "companies
vetted for what I actually need."
- **Decision:** clear the watchlist to empty. A company is added only when Sakshi has direct evidence
  it's remote-from-India friendly (a real posting she's seen, a documented remote policy, someone she
  knows working there remotely from India) — not because it's a well-known or exciting company.
- **Why:** the watchlist's actual purpose was always "companies I already know hire remote-from-India,
  save me from re-checking each one manually" — not "let the system guess which companies to target."
  The original list never matched that purpose.
- **Options considered:** (a) research pass — assistant proposes a vetted starter list with evidence
  per company — rejected: still requires Sakshi to evaluate each one, which she explicitly doesn't have
  time for. (b) hybrid — keep the mechanism but require a documented reason before a company is
  "active" — rejected: functionally similar overhead to (a) for no added benefit over just adding
  companies as she personally verifies them.
- **Implementation — no UI.** Additions are rare and evidence-driven; Sakshi tells the assistant (or
  edits `seed/company_watchlist.json` directly) when adding one. A dashboard-integrated watchlist CRUD
  page was explicitly deferred, matching the project's own evidence-driven philosophy (D-28).
- **Known gap, documented not fixed:** adding a company to this table does **not** make discovery
  actually search that company. A separate Apify Task must still be created manually per company (per
  `apify/task-config.md`) — this remains a two-step, non-automated process. Automating step two (calling
  Apify's task-creation API) was considered and explicitly not pursued — real added scope for a
  once-in-a-while action.

**Amended 2026-08-02 (Session 5) — see D-35 for a new auto-populated evidence path.** D-32's "direct
evidence" bar itself is unchanged; what's new is an additional, automated way to satisfy it. This
session's known-gap automation (calling Apify's task-creation API) was reconsidered given D-35 and
explicitly sequenced to **v2**, not ruled out — see D-35's amendment.

## D-33 — Company-based Apify tasks now get a title filter (reverses "pull everything" from D-21/task-config.md)
**2026-08-01**
The original design (`apify/task-config.md`, never logged here as its own decision) had company-search
tasks intentionally set with **no title filter** — "pull everything, let the classifier decide." Sakshi
questioned whether this is wasteful, and it turned out to be a real, previously unflagged gap: reading
`lib/enrich/pipeline.ts` this session confirmed every ingested job — regardless of source — runs the
full 5-stage AI enrichment pipeline (classify, resume_match, skills, salary, recommend) with no cheap
pre-filter. Pulling every open role from a watchlisted company (which could be hundreds at a large
company) means wasting both Apify's own fetch quota and downstream AI quota on completely unrelated
roles (engineering, sales, legal, etc.).
- **Decision:** company-based Apify tasks now apply the same title filter as role-based tasks (D-31's
  list), rather than pulling everything unfiltered.
- **Why:** solves the waste at its source — Apify itself only returns relevant-titled postings, so
  neither Apify's own usage nor AI enrichment quota is spent on irrelevant roles.
- **Options considered and rejected:**
  - **A cheap keyword-blocklist pre-filter in our own code** (skip AI enrichment if the title obviously
    says "Engineer"/"Sales"/"Legal," etc.), instead of filtering at the Apify source — rejected on two
    grounds: PM job titles routinely contain domain words describing scope, not disqualifying the role
    (e.g. "Product Manager, Sales Tools," "Product Manager — Platform Engineering"), so a blocklist would
    misfire on exactly the roles worth keeping; and it doesn't solve the Apify-side cost at all, since
    Apify still fetches and returns everything regardless of what happens to it afterward.
  - **Using salary currency (₹/INR vs. USD) as an India-eligibility signal** (raised as a possible
    enhancement to the existing remote/India detection, unrelated to the title-filter question but
    discussed in the same session) — rejected: Sakshi gave a real counterexample, a genuinely
    India-based job that pays in USD. Currency doesn't reliably indicate eligibility; not adopted.
- **Residual risk, accepted:** a watchlisted company using some unlisted term for the role would be
  missed by the title filter. Accepted rather than engineered around — covered by the manual-save path
  (D-21) if Sakshi happens to see such a role while browsing.

## D-34 — Discovery source stays LinkedIn-only for now; RemoteOK evaluated and rejected
**2026-08-02**
Session 5's discovery-evaluation discussion had flagged RemoteOK as the lowest-effort/lowest-risk
candidate second source (public JSON API, no scraping/ToS ambiguity vs. LinkedIn's unresolved actor
choice and scraping-related legal questions) — logged as analysis, not a decision, in `backlog.md`.
Sakshi then manually searched RemoteOK herself and found zero India-remote Associate Product Manager
listings.
- **Decision:** stick with LinkedIn as the sole discovery source for now. Do not add RemoteOK, Wellfound,
  Rocket.jobs, or any other second source at this time.
- **Why:** the analysis-stage argument for RemoteOK (cheap, low legal risk) is moot if the source
  doesn't actually carry the target role/geography combination at all — a real-world spot-check beats
  the theoretical cost/risk comparison it was weighed against.
- **Options considered:** (a) add RemoteOK anyway on the theory that coverage might exist beyond what
  one manual search surfaced — rejected: no evidence supports this, and doing so would contradict the
  original recommendation's own logic (validate fit before adding a source). (b) evaluate Wellfound or
  Rocket.jobs next — not pursued this session; remain candidates only if there's reason to revisit.
- **Not yet resolved:** whether to revisit additional sources later if LinkedIn-only coverage proves
  insufficient once a manual benchmark list (see `session-summary.md` Session 5) is compared against
  real discovery runs.

**Amended 2026-08-02 (Session 5, later same session) — sequencing plan set.** Sakshi confirmed a
concrete two-source rollout rather than leaving "revisit later" open-ended:
1. **LinkedIn first, validated one dimension at a time** — coverage (manual benchmark list), freshness
   (posted→discovered latency), and relevance (title-match accuracy) all checked against real LinkedIn
   runs before any second source is added. Matches this session's "get real numbers before building
   more instrumentation" principle rather than adding sources on theory.
2. **Wellfound next**, once LinkedIn clears that bar — chosen specifically because most remote roles at
   startups (this project's actual target profile, vs. RemoteOK which turned out to have none) are
   concentrated there. Rocket.jobs and We Work Remotely remain unordered candidates after Wellfound, not
   sequenced.
- **Not yet resolved:** what specific pass/fail bar each LinkedIn validation dimension needs to clear
  before moving to Wellfound (e.g. what coverage % is "good enough") — the sequencing order is now
  decided, the exact gate criteria are not.

## D-35 — Broad "remote product manager" discovery search auto-populates the watchlist; no manual confirmation step
**2026-08-02**
Raised during the same discovery-evaluation session: LinkedIn search is currently scoped narrowly to
the target title list (D-31), which limits company *discovery* to companies already hiring at exactly
that level. Proposed instead: run a separate, broader search — "Product Manager," remote, India,
**any seniority**, no title restriction — whose only purpose is to surface company names as watchlist
candidates, distinct from the existing role-search tasks that ingest jobs to track. I raised whether
matches should auto-add to the watchlist or surface as a candidate list for Sakshi to confirm first
(to protect D-32's "Sakshi personally verifies" bar, the exact reason the original guessed 11-company
list was thrown out).
- **Decision:** auto-add. If a company has a real, currently-live remote product manager posting
  (any seniority) found by this search, that posting itself is sufficient evidence — no separate
  confirmation step before it's added to the watchlist.
- **Why:** a real found posting is direct evidence by D-32's own definition ("a real posting she's
  seen") — the gap that discredited the original 11-company list was that it had **no** evidence
  (guessed from "prominent companies"), not that the evidence wasn't manually reviewed one-by-one.
  Automating discovery of real postings preserves the evidence bar; it doesn't lower it.
- **Options considered:** (a) surface a weekly candidate list for manual confirmation before adding —
  rejected: adds a recurring review chore for evidence that's already real and verifiable (the posting
  itself is checkable at the source URL), which is the exact overhead D-32 rejected option (b) for.
- **Scope note (not yet separately confirmed, likely already covered):** the broader search should
  still carry the same India-location scoping as the existing role/company tasks, so "remote" here
  means remote-from-India-eligible, not remote-anywhere — matches the project's existing search
  pattern, not a new parameter.
- **Still separate, but now sequenced (2026-08-02, same session):** once a company is auto-added here,
  D-32's existing "known gap" still applies — a separate Apify company-Task must still be created to
  actually start tracking that company's target-title openings going forward. This decision only closes
  the *discovery* half, not the *now-monitor-them* half. **Sakshi confirmed: auto-creating that
  company-Task (closing the loop end-to-end) is v2 scope, not v1.** V1 behavior: auto-add populates the
  watchlist row; creating the matching Apify Task stays a manual step for now, same as D-32's original
  gap.
- **Not yet built:** this is a new task type (broad discovery search → extract company names → insert
  into watchlist), distinct from the existing role-search and company-search tasks — not implemented
  as of this session. Auto-creating the follow-on monitoring Task is explicitly v2 (see above).

**Revised 2026-08-04 (Session 8) — see D-44.** The broad search now populates a **separate
remote-companies catalog**, not `company_watchlist`: "companies confirmed remote-India-friendly" and
"companies I'm actively pursuing" were found to be different concepts. The auto-add-without-
confirmation reasoning above is unchanged and still correct — only the destination table changes.

---

# Session 6 (2026-08-02)

## D-36 — Supabase project swapped from `gwvrpdkiblozwdwoqsgd` to `cdjgxrmeoqiogylveagr`
**2026-08-02**
Sakshi provided a new Supabase project URL (`https://cdjgxrmeoqiogylveagr.supabase.co`), confirmed as
a genuinely new project (not a rename/migration of D-14's project), and asked to switch it everywhere.
- **Reason for the switch:** accidental duplication — Sakshi forgot the original `job-tracker`
  project (`gwvrpdkiblozwdwoqsgd`) already existed and created a second Supabase project instead of
  reusing it. Not a deliberate migration.
- **Cleanup note:** the old project (`gwvrpdkiblozwdwoqsgd`) is presumably still live and unused on
  Supabase (free tier, so no cost, but worth pausing/deleting later to avoid confusion — Sakshi's
  call, not done here).
- **Updated:** `.env` `SUPABASE_URL`, `README.md` live-environment section.
- **Not yet done:** schema (`0001` + `0002`) has not been re-applied to the new project; watchlist not
  re-seeded; `SUPABASE_ANON_KEY` in `.env` still holds the **old** project's key (invalid against the
  new project) until Sakshi supplies the new one; `SUPABASE_SERVICE_ROLE_KEY` still empty (D-30's
  original blocking-secret gap, now against the new project instead of the old one).
- **Not yet resolved:** whether anything already written to the old project's DB (if any test data
  exists there) needs to be migrated, or whether the new project starts clean.
- **Blocker found (same session):** the Supabase MCP connector used in this session cannot see the new
  project at all — `list_projects` returns only the old `job-tracker` (`gwvrpdkiblozwdwoqsgd`, now
  status `INACTIVE`) and the unrelated `funded-company-v1`, both under org `dnnaykjkbrtwjuzonnal`. The
  new project (`cdjgxrmeoqiogylveagr`) is likely under a different Supabase account/org. Schema
  (`0001`+`0002`) could not be applied via MCP as a result. **Not yet resolved** — waiting on Sakshi to
  confirm which account/org the new project is under, then either re-authorize the MCP connector or
  apply the schema manually via the Supabase SQL editor.

**Correction 2026-08-03 19:53 IST:** the line above stating `SUPABASE_SERVICE_ROLE_KEY` is "still
empty" is **stale**. Verified directly against `.env` this session: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` are all **set**. (Session 5's "still blocking the
fixture test" framing is likewise stale.) Still genuinely outstanding from this entry: the schema has
not been applied to the new project, and `SUPABASE_ANON_KEY` still holds the **old** project's key.
`APIFY_TOKEN` remains empty, which still blocks any live discovery run.

**Correction 2026-08-04 09:41 IST (Session 8) — the `SUPABASE_ANON_KEY` claim above is also stale.**
Verified directly against `.env`: `SUPABASE_ANON_KEY` holds the **new** project's
`sb_publishable_...` key, not the old project's. It was replaced during Session 6 itself (Session 7
ran in parallel and did not see the fix, which is why both entries repeat the claim). **Current
`.env` truth as of this timestamp:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` are all correctly set for `cdjgxrmeoqiogylveagr`;
`APIFY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTION_TOKEN`, and `NOTION_DATABASE_ID`
are empty. **The one genuine blocker that remains from this entry: the schema has never been applied
to the new project.**

*Note on Supabase's key formats (see `learnings.md`): `sb_publishable_...` is the new-format
replacement for the legacy JWT anon key, and `sb_secret_...` for the service-role key. Both are
drop-in — `lib/config.ts` reads them as opaque strings.*

## D-37 — v1 rescope: job-scout ships discovery + extraction + tagging; judgment (recommend/qualify) deferred to v2
**2026-08-03 19:53 IST**
Sakshi rescoped v1 around where she actually spends time rather than around what was already
half-built. The enrichment pipeline drops from five stages to three: **`classify` → `skills` →
`salary`**. `recommend` (priority high/med/low) and the never-built `qualify` + Lane Engine both move
to v2.
- **Why:** there is real usage evidence for tracking (her own Notion history, reviewed this session)
  and **zero real data** for judgment — nothing has ever run live. Tagging *describes* a job and is
  useful for filtering on its own; `recommend`/`qualify` make a *judgment call* on top, which is the
  unproven part. Building the describable layer from evidence and deferring the judgment layer until
  there's data to calibrate against is the same lesson D-30 already cost a session to learn.
- **Kept in v1, confirmed explicitly this session:**
  - **JD text retention** — raised as "is the job link enough?" It is not: all three tagging stages
    read `jd_clean`; the JD arrives free in the same Apify payload (`lib/discovery/normalize.ts:11`);
    and links die, so link-only means losing the record entirely when a posting is taken down.
    Reaffirms architectural principle #2.
  - **`locked_fields`** — the guard that stops a prompt-tuning re-run from silently wiping manual tag
    corrections. Read on every enrichment write (`lib/enrich/writeEnrichment.ts:32`).
  - **`location`** — kept as stored data because `normalize.ts` scans title + location + JD for the
    remote/India pre-filter, but deliberately **not** a UI filter (everything reaching her is already
    remote-India-eligible).
- **New in v1: a manual "chance of selection" field.** Sakshi fills this in by hand in Notion today
  and it is functionally the deferred AI `priority`. Shipping it as a plain manual field means her
  workflow is uninterrupted; when AI priority arrives in v2 it *suggests* a value and her manual
  answer wins, protected by `locked_fields`.
- **Options considered:**
  - **Cut all AI from v1** (raw postings only, no tags) — rejected: without tags she would have to
    open and read every JD to answer "is this technical / India-eligible / AI-focused," which is the
    original problem D-3 was written to solve. Tags are cheap and already built.
  - **Keep the full five-stage pipeline and tune later** — rejected: `recommend` stacks on top of
    `classify` output, so building judgment on an unvalidated describable layer means re-tuning the
    whole stack at once instead of one stage.
- **Implementation consequence:** `enrichPending()` (`lib/enrich/pipeline.ts:39`) currently detects
  "already enriched" by looking for an active `recommend` row. That breaks when `recommend` stops
  running and must be repointed at the new terminal stage (`salary`). No migration needed for the
  stage list itself — it is app-validated, not DB-constrained, per `0002`.

**Amended 2026-08-04 (Session 8) — see D-53.** `recommend` is **not** fully deferred after all: v1
ships it as a **deterministic rule in plain code** (background_match + AI focus + technical + IIT/IIM
barrier, salary as a bonus), not an AI call. D-37's actual concern — don't build an unvalidated
*judgment layer* — is preserved, since a transparent rule over already-extracted facts is not the
learned judgment being deferred. This also closes a gap D-37 missed: `lib/telegram.ts` and
`lib/notion.ts` read `priority`/`recommend_reasons` to build the alert itself, so removing `recommend`
outright would have silently emptied the notifications.

## D-38 — `resume_match` deferred to v2 **and** redesigned: on-demand, scored against the master resume
**2026-08-03 19:53 IST**
Beyond deferring `resume_match`, Sakshi changed its design: it stops being an automatic pipeline stage
and becomes a **user-triggered action** on a job she is actually considering. When it runs, it scores
against her **master resume**, never a tailored one.
- **Why on-demand:** every ingested job currently gets every AI stage regardless of whether she would
  ever apply. On-demand creates a cost funnel where spend tracks real interest — tags automatic and
  cheap, matching per-job on request, tailoring rarest and most expensive. Directly serves the D-5
  free-tier constraint.
- **Why the master resume, not a tailored one:** a tailored resume is *constructed to echo its target
  JD*, so scoring it against that same JD measures tailoring quality, not fit — it would score high on
  nearly everything and be useless for deciding what to pursue. The triage question is "does my
  background fit this role," a fact about candidate and job that is independent of any document.
  Tailoring belongs *after* a good match, not before it.
- **If no resume is on file:** prompt to add one. Do **not** auto-generate — there is nothing to
  generate from; resume-builder needs real history as source material regardless.
- **Options considered:** (a) generate a tailored resume first, then match — rejected as circular, per
  above; (b) keep `resume_match` automatic but deferred — rejected: automatic matching is precisely
  the quota waste the on-demand model removes.
- **Large second-order effect (the reason this matters beyond one AI call):** `resume_match` is the
  *only* thing in job-scout that needs full resume **text**. Without it, job-scout drops
  `resume_versions` and `job_enrichments.resume_version_id` entirely — which removes the
  duplicate-resume problem from v1 (job-scout and resume-builder each independently define profile /
  resume tables) and **postpones D-29's contracts-extraction question to when match scoring is
  actually built**, which is the right time to design that boundary anyway.
- **How the boundary resolves in v2 (agreed, not yet built):** matching needs the active resume **once
  per run**, not per job — one string reused across the batch. So resume-builder owns all resume text
  (generated *and* uploaded), job-scout fetches the active resume at run start and never stores it,
  and the tracker stores only a version id + label. `app-os-contracts` holds the shared
  `ResumeVersion` identity. This is `WORKSPACE.md`'s "contracts-typed boundary, added only when a real
  handoff exists."
- **Not yet resolved:** the schema allows one active row per `(job, stage)`, so re-matching a job
  against a different resume supersedes the prior score rather than sitting beside it. Revisit only if
  side-by-side resume comparison becomes a real want.

**Amended 2026-08-04 (Session 8) — see D-46.** The claim that `resume_match` was "the *only* thing
needing résumé data in job-scout" turned out to be wrong: `background_match` (D-39/D-47) needs work
history and education. `profile` therefore keeps **structured** résumé data locally. What survives
unchanged: `resume_match` stays deferred and on-demand against the master résumé, and
`resume_versions` (the versioned full-text table) stays dropped. The contracts question this entry
postponed is **partially reopened** — two modules now hold résumé-derived data, though in different
shapes.

**Footnote 2026-08-04 — see `WORKSPACE.md` D-9.** The polyrepo/contracts-distribution framing this
entry references (separate repos talking only through `@app-os/contracts`) is superseded by the
monorepo reversal. The `ResumeVersion` boundary design sketched above is unaffected — it was never
built — but when it is built, it can live as a plain shared type in a monorepo rather than needing
the `file:` → git-tag → registry distribution path D-1 originally planned.

## D-39 — Two new `classify` outputs: `domain` and `background_match[]`
**2026-08-03 19:53 IST**
Sakshi's Notion has a single "Background Match" field whose options are `Support Company`,
`Role Match - Support Work`, `Research Experience`, `HR Tech`, `CPG company`. Examining it showed the
field is doing two different jobs at once, so it splits into two:
- **`domain`** — what the company actually does (hr_tech, cpg, support tooling, fintech, edtech,
  devtools). Objective; identical for any candidate. **Nothing captures this today** — verified, no
  domain/industry/vertical field exists anywhere in the schema; `business_model` (saas/b2c/other) is
  far coarser.
- **`background_match[]`** — which parts of *her* background connect and why ("role match – support
  work", "research experience"). Only meaningful relative to her profile.
- **Why `background_match` is worth more than a numeric score:** it is **the raw material for outreach
  messages**. Every referral message in her Purplle screenshots opens with a specific overlap — "we're
  both ex-Infosys", "both Welingkar alumni", "3 years at Infosys on an enterprise B2B SaaS product
  managing P1/P2 resolution." A score of 73 gives her nothing to write with; a named overlap does.
- **Cost:** `background_match` needs only a short profile blurb in the prompt ("MBA HR, 3 years
  support/B2B SaaS at Infosys"), **not** full resume text — so it does not reintroduce the dependency
  D-38 just removed. `profile.headline` and `profile.skills[]` already exist to hold it. Both fields
  ride along as extra outputs of the existing `classify` call rather than becoming new stages.
- **Options considered:** (a) pick overlaps manually per job, as she does in Notion — rejected: only
  jobs she has personally reviewed would be filterable, which defeats using it to triage an inbox;
  (b) defer both to v2 and ship `domain` alone — rejected: `background_match` is the field that feeds
  outreach, which is where she spends the most time.
- AI-tagged and user-correctable; corrections protected by `locked_fields` (D-37).

**Amended 2026-08-04 (Session 8) — see D-47.** The prompt input is **work history + education**, not
`profile.headline` + `profile.skills[]` as stated above — Sakshi judges background match from
experience bullets and education. Consistent with this entry's own rationale (a named overlap like
"both ex-Infosys" comes from employment history; a skills array cannot produce it). The `domain` vs.
`background_match[]` split is unchanged. Note also that "corrections protected by `locked_fields`"
now routes through the new `job_feedback` table — see D-48.

## D-40 — Gmail LinkedIn alerts: rejected as a discovery source, adopted for coverage checking (amends D-34)
**2026-08-03 19:53 IST**
Sakshi raised dropping Apify entirely, since she already receives LinkedIn job alerts by email. After
weighing it she chose to **keep Apify/LinkedIn as the discovery source** and repurpose the alerts.
- **Why Apify stays:** the alert emails are built for a human to read, not for a machine to parse, so
  extracting clean fields from them is *messier* than what the Apify actor already returns structured.
  Switching would trade a solved problem for a parser to build and maintain against a format LinkedIn
  controls and can change.
- **Why the alerts are adopted anyway — for a different job:** Session 5 planned a hand-built
  "coverage benchmark list" of 10–20 postings Sakshi would notice while browsing, to answer "is
  discovery missing things?" Her alert stream **is** that benchmark, arriving continuously, for zero
  effort. This supersedes the manual-list plan.
- **Options considered:** (a) auto-parse the alert emails as the primary discovery source — rejected
  per above, plus coverage is unproven (LinkedIn's alerting is its own algorithm, not guaranteed to
  match the D-31 title list); (b) lightweight manual-add only, no scraper — rejected: Sakshi chose to
  keep the automated source rather than add per-job manual work.
- **Amends D-34** (LinkedIn-only): sequencing is unchanged — LinkedIn first, validated on coverage /
  freshness / relevance before Wellfound. Gmail is now the mechanism for the *coverage* dimension.

## D-41 — Job URLs split into `posting_url` + `apply_url` (fixes a silent-discard bug)
**2026-08-03 19:53 IST**
Sakshi asked whether the company page that LinkedIn's apply button redirects to could be captured.
Reading the code found this is currently impossible **and** that data is being silently lost.
- **The bug:** `lib/discovery/apify.ts:15` resolves a single URL via a fallback chain,
  `pick(item, ['jobUrl','url','link','applyUrl','jobPostingUrl'])`, trying the LinkedIn URL *first*.
  If the actor returns both the LinkedIn URL and the company apply URL, **the company URL is
  discarded** with no trace.
- **Decision:** split into two fields — `posting_url` (the LinkedIn job page; what she sends a
  referrer) and `apply_url` (the company ATS/careers page; where she actually applies, and the link
  that survives LinkedIn removing the posting). Requires `postingUrl` on `RawPosting`, a `posting_url`
  column on `jobs`, and splitting that `pick()` in two.
- **Why split rather than just reorder the chain:** both URLs have distinct, simultaneous uses — one
  for sharing with a referrer, one for applying. A single field can only ever hold one.
- **Trap to avoid while implementing:** `externalId` falls back to `applyUrl.split('?')[0]` when the
  actor supplies no id field (`apify.ts:17`). That fallback must keep using the **LinkedIn** URL — the
  company URL is not a stable per-posting identifier, and switching it would quietly change the dedup
  key that D-8's cross-source grouping depends on.
- **Useful side effect, kept deliberately:** LinkedIn Easy Apply postings have no external URL, so a
  null `apply_url` becomes a real signal (Easy Apply vs. external application).
- **Not yet resolved:** whether `curious_coder/linkedin-jobs-scraper` exposes the redirect target at
  all, and under what field name. The code split is worth making regardless — without it the value
  cannot be captured even when present — but confirming availability needs the first real run. If the
  actor does not provide it, the destination could be resolved by following the apply link once per
  job; **not** to be built speculatively.

## D-42 — Post-discovery tracking splits out of job-scout into its own module; `job_tracking` splits three ways
**2026-08-03 19:53 IST**
Application/referral/follow-up tracking — the original purpose of this project — becomes a separate
module. job-scout keeps only discovery, extraction, and tagging. (Module-structure rationale is
workspace-level and lives in `WORKSPACE.md` D-7; recorded here for the job-scout-side consequences.)
- **`job_tracking` is not one table's worth of concern.** It splits by **who reads the field**, not
  who writes it — every field is written by Sakshi, so writes cannot distinguish them:
  - **→ tracker:** `status`, `notes`, `resume_version_used`, `referral_needed`, `referral_status`,
    `person_contacted`, plus new `next_follow_up_at` and denormalized job link/company/title.
  - **→ stays in job-scout:** `locked_fields` — read by `writeEnrichment.ts:32` on *every* enrichment
    write. Rare writes, constant reads; moving it means a cross-module network call in the hot path
    just to ask "did she lock anything here?"
  - **→ `company_watchlist`:** `dream_company`. It sits on a table keyed by `job_id`, making it
    per-job, but "Anthropic is a dream company" is true of every Anthropic posting. A modeling bug
    independent of this split.
- **Verified while deciding:** only two places in the whole codebase touch `job_tracking` —
  `writeEnrichment.ts:32` (reads `locked_fields`) and `ingest.ts:92` (creates an empty row on every
  ingest). **`dream_company`, `avoid_company`, `domain_interest`, `referral_needed`, `referral_status`,
  and `person_contacted` are read by zero code** — they were added in `0002` as prep for the now-
  deferred lane engine.
- **`ingest.ts:92` stops auto-creating rows.** With the tracker in a separate database that write
  would cross a module boundary; the tracker creates rows lazily on first action instead.
- **Cross-database cost, accepted:** per `WORKSPACE.md` each module owns its own Supabase project, so
  the tracker cannot foreign-key into `jobs` (all three tables currently do, with
  `on delete cascade`). It stores a job id as a plain value plus denormalized company/title/link.
  Referential integrity is lost — nothing will stop a tracker row pointing at a deleted job.
- **Why split now rather than later:** `job_tracking` has never held a single row, so splitting is
  free today. After 40 tracked applications it means migrating live data across two databases.
- **Options considered:** (a) leave tracking inside job-scout — rejected: it is where Sakshi spends
  most of her time and has real design evidence, so it deserves to be built properly rather than as a
  side table; (b) move the whole `job_tracking` table including `locked_fields` — rejected: breaks
  `writeEnrichment` or forces a cross-module call on every enrichment write.
- **Not yet resolved:** `avoid_company` / `domain_interest` (read by nothing — keep, drop, or
  remodel); where `resume_version_used` lives, since the learning loop straddles both modules; the
  module's name; and the status model (see `backlog.md`).

**Resolved in part 2026-08-04 (Session 8) — see D-48.** This entry kept `locked_fields` in job-scout
without saying which table it would land on. It now lives on a new **`job_feedback`** table (a
correction *is* a lock), which removes job-scout's last dependency on `job_tracking` — so that table
moves to the tracker module **whole**, with no cross-database split. Also decided:
`avoid_company` / `domain_interest` are **kept for v2/v3 as filters** (see `scope.md`), not dropped.

**Footnote 2026-08-04 — see `WORKSPACE.md` D-9.** The infra consequence of the module split named
above — separate Supabase project, own repo, "cross-database cost, accepted" — is reversed by the
monorepo decision; the schema will likely end up in one Supabase project, restoring the option of
real foreign keys. Module *ownership* (who reads/writes which fields, tracker vs. job-scout) is
unchanged by this.

## D-43 — Conversation capture is click-to-save on a manual text selection, not passive thread syncing
**2026-08-03 19:53 IST**
Sakshi keeps referral/outreach conversations as dated Notion comment entries by hand and asked whether
a Chrome extension could capture LinkedIn threads automatically. Chosen approach: **she selects the
conversation text on any page and clicks save**, storing that selection with a timestamp and source
URL against a job.
- **Why not passive auto-sync:** reading her message threads requires operating inside her logged-in
  personal LinkedIn account — the exact risk profile the cookieless-actor research was done to avoid
  (D-30's ToS work established that cookieless scraping of public pages carries the personal-account
  risk, contract-based claims bite accountholders). It also matches the existing rule that the
  extension does zero AI and captures only on request (D-21).
- **Why manual selection over auto-detecting the thread:** it needs no knowledge of LinkedIn's message
  DOM, so it works identically on Gmail, WhatsApp Web, or anywhere else, and does not break when
  LinkedIn changes its UI.
- **Options considered:** (a) whole-thread auto-capture on click — considered and available as a
  variant, but long threads only load visible messages, so it does not remove the scrolling problem it
  was meant to solve; (b) email forwarding/BCC — works for email but not LinkedIn DMs; (c) LinkedIn's
  own official data export — zero ToS question, but slow and bulk, so useful as an occasional backfill
  rather than a daily method.
- **Accepted limitation:** repeat captures of the same thread overlap rather than appending only new
  messages. Not worth engineering around yet.
- **Storage shape:** captures land on the same append-only per-job timeline as typed notes and
  auto-appended status changes — one chronological record per job, never edited.

---

# Session 8 (2026-08-04) — schema review table-by-table

> All entries below share the timestamp **2026-08-04 09:41 IST** (single working session).

## D-44 — Remote-companies catalog is a separate table from `company_watchlist` (revises D-35)
> **Columns RESOLVED 2026-08-07 by D-109.** `last_confirmed_at` added (migration 0004), evidence
> stays single-valued, population is automatic from ingest, and the table is backfilled with 50
> companies. The `UNREVIEWED DEFAULT` marker in `0001_schema.sql` is removed.
Sakshi asked whether companies stored *just* to build a database of remote-friendly employers should
be the same thing as the watchlist. Defining "watchlist" precisely showed they are not: the watchlist
means **companies she is actively pursuing**; the catalog means **companies confirmed to hire remote
from India**, recorded without any commitment to pursue them.
- **Decision:** a new table (name TBD — `remote_companies` proposed) holding company + slug + the
  evidence that qualified it (posting URL or note) + date added. No scoring effect, no scraping
  trigger. Promotion from catalog → watchlist stays a manual, deliberate act.
- **Why:** the two lists have different meanings, different bars, and different consequences. Merging
  them would mean either polluting the watchlist with companies she has no intention of pursuing, or
  suppressing evidence she wants to keep.
- **Revises D-35**, which routed the broad "remote PM, any seniority" discovery search straight into
  `company_watchlist`. That search now feeds the **catalog**. D-35's core finding is unchanged and
  still correct — a real live posting *is* direct evidence by D-32's definition, so auto-adding to the
  catalog needs no confirmation step.
- **Options considered:** one table with a boolean/status column distinguishing the two — rejected:
  the watchlist's own semantics (weight, dedicated Apify tasks) would then need to check that flag
  everywhere, which is the same `active`-column trap found in this session (a flag nothing reads).
- **Not yet resolved:** the table's name and final column list.

## D-45 — Staleness detection: 30-day grace, then 30-day re-checks (activates two inert columns)
`jobs.link_status` was **read and written by nothing**, and `last_checked_at` was write-only (touched
once at `ingest.ts:99`, never read) — both built in `0001` for a staleness feature that was never
scheduled. Rather than drop them, Sakshi proposed a rule that makes the cost tractable.
- **Decision:** a job is not link-checked at all until **30 days** after `first_seen_at`. Past that, it
  is re-checked every **30 days** (measured from `last_checked_at`) until it resolves to closed.
- **Why the grace period:** most jobs get a decision or lose relevance well within a month, so this
  confines re-fetching to a small, slow-growing long tail rather than the whole live set — which is
  what made the original unscoped version too expensive and too ToS-exposed to schedule.
- **Why one interval reused, not escalating tiers:** 45/90-day tiers were considered and rejected as
  speculative complexity — there is no evidence about *when* postings actually go stale, and the cost
  of a stale "live" flag is only that she finds out when she goes to apply.
- **Accepted limitation:** a job closing 10 days after a check stays wrongly marked live for up to 30
  days.
- **Still true and unchanged:** the *mechanism* (re-fetching URLs on a schedule) remains its own
  scraping-adjacent subsystem with its own ToS/anti-bot questions per D-30. This decision scopes the
  rule, it does not schedule the build.

## D-46 — `profile` stores structured master-résumé data (work history + education) — amends D-38
`profile` was verified **completely unwired** this session: no code reads or writes it, and the one
thing depending on it (`v_skill_gap`) is itself unwired, so the skill-gap feature has never run.
D-39 then gave `profile` a new purpose (a blurb feeding `background_match`) — but Sakshi corrected the
input: she judges background match from **work experience bullet points and education**, not from
skills or a headline.
- **Decision:** `profile` stays, and holds **structured master-résumé data** — work history and
  education — stored locally in job-scout.
- **Amends D-38**, which dropped `resume_versions` and all résumé text from job-scout on the explicit
  reasoning that `resume_match` was the only consumer. That reasoning no longer holds: `background_match`
  needs experience-and-education detail, which is résumé data by any reasonable definition.
- **What D-38 still gets right, unchanged:** `resume_match` remains deferred to v2 and on-demand
  against the master résumé; `resume_versions` (the *versioned, full-text* table) stays dropped. This
  is structured profile data, not a résumé document store.
- **Options considered:** fetch résumé data from resume-builder at run time instead of storing it
  (the v2 cross-module design D-38 sketched) — rejected for v1: it makes a core v1 tagging stage
  depend on a cross-module boundary that does not exist yet, to avoid duplicating data that is small
  and changes rarely.
- **Consequence to watch:** this partially reopens D-29's contracts question that D-38 postponed —
  two modules now hold résumé-derived data. Acceptable while the shapes differ (structured profile
  facts here, full documents there); revisit when `resume_match` is actually built.

## D-47 — `background_match` derives from work experience + education, not skills/headline — amends D-39
- **Decision:** the prompt input for `background_match[]` is her structured work history and education
  (per D-46), not `profile.headline` + `profile.skills[]`.
- **Why:** D-39's own rationale is that `background_match` is **the raw material for outreach
  messages** — every referral message she has written opens with a specific overlap ("both ex-Infosys",
  "3 years on an enterprise B2B SaaS product"). Those overlaps live in employment history and
  education, not in a skills list. A skills array can produce "knows SQL"; it cannot produce "we
  overlapped at Infosys."
- **Amends D-39** on the input only. D-39's split of `domain` (objective, what the company does) from
  `background_match[]` (relative to her) is unchanged and still correct.
- **Options considered:** (a) feed **both** the skills array *and* experience/education — rejected: a
  skills list adds prompt length and pulls the model toward generic capability statements ("knows
  SQL"), which is the output shape D-39 explicitly found less useful than a named overlap; (b) send
  the **full résumé text** — rejected: reintroduces exactly the dependency D-38 removed, for detail
  the overlap-naming task doesn't need.

## D-48 — `job_feedback` table replaces `job_tracking.locked_fields` (resolves a D-42 gap)
D-42 kept `locked_fields` in job-scout — correctly, since `writeEnrichment.ts:32` reads it on *every*
enrichment write — while moving the rest of `job_tracking` to the tracker module. It did not say which
table `locked_fields` would then live on. Separately, this session decided to capture per-field
feedback (D-49). These turn out to be the same concept.
- **Decision:** one table, `job_feedback` — `(job_id, stage, field, verdict, corrected_value,
  created_at)`. "Locked" becomes **derived**: a field is locked iff a correction exists for it.
  `writeEnrichment` queries this instead of `job_tracking.locked_fields`.
- **Why:** a correction *is* a lock — recording "the AI was wrong, it should say X" and "do not
  overwrite my X" as two separate mechanisms would mean keeping them in sync forever. A lock that
  remembers *why* it exists is strictly more useful than a bare field name in an array.
- **Second benefit:** it removes the last job-scout dependency on `job_tracking`, so D-42's move of
  that table to the tracker module becomes clean rather than a split-across-two-databases problem.
- **Options considered:** a dedicated `job_field_locks` table alongside a separate feedback table —
  rejected: two tables encoding the same event, and the lock version carries strictly less
  information.
- **Migration note:** `job_tracking.locked_fields` is currently read on every enrichment write; the
  cutover must land with the code change, not before it.

**Built 2026-08-05 (Session 12) — final shape, see D-84.** The table attaches to **`enrichment_id`
only** — no `job_id` and no `stage` column, both being reachable by joining `job_enrichments`. This
resolves the attachment question D-69 flagged as open. `corrected_value` is `jsonb` (it must round-trip
booleans, ints and arrays, not just strings). `writeEnrichment` now reads locks from here, so
`job_tracking` has no remaining job-scout dependency and leaves the module whole, as this entry
predicted.

## D-49 — Feedback capture is v1, passive, per-field: thumbs up/down + optional free-text correction
Sakshi proposed a per-job feedback button ("was the background match correct?") as eval material, and
argued feedback should initially cover **every** AI output, narrowing to new features only once
quality is trusted. Researched how this is normally done (see sources in `session-summary.md`).
- **Decision:** **v1.** Feedback is **passive** (a control on every output, rated whenever she looks)
  and **per-field**, not per-job. Format: **thumbs up/down + an optional free-text correction**.
  Stored per D-48, alongside the already-captured `raw_output`, `prompt_version`, `classifier_version`,
  `provider`, `model`.
- **Why v1 and not v2:** feedback cannot be reconstructed retroactively. Traces, dashboards, and eval
  harnesses can all be added later over stored history; a judgment never recorded is gone. It is also
  cheap — one table and a control.
- **Why passive, not active (an annotation queue over a sample):** active review exists to fix
  coverage bias when volume is too high to review everything. At ~1–2 relevant jobs/day she sees every
  job anyway, so a queue would be ceremony. Revisit if volume grows.
- **Why per-field, not per-job:** "this job's tagging was wrong" is not actionable; "the `domain` tag
  was wrong, it should be hr_tech" is a usable eval case and a targeted lock.
- **Why binary + correction, not a 1–5 scale:** rated scales are hard to answer consistently even
  against oneself, and the number does not say what to fix. Binary plus the corrected value yields
  both the metric and the labelled example. Matches the "rating buttons + correction fields" pattern
  in the reviewed material, which also warns that thumbs-alone "often fails to capture the nuances
  required for meaningful improvements" — hence the correction box.
- **Which outputs:** all AI outputs initially, per Sakshi's reasoning that quality is unknown until
  measured. Judgment-type outputs (`background_match`, `recommend`) are expected to need it longest;
  factual tags (`classify` booleans, `skills`) may graduate once they prove reliable.

**Resolved 2026-08-04 (Session 9) — see D-69.** Per-field granularity is confirmed as specified here,
but for a reason D-49 did not state: feedback doubles as the **validation instrument for `classify`**
(D-71), and job-level capture cannot attribute a failure to a field. A cheaper job-level design was
recommended earlier in Session 9 and then reversed on those grounds.

## D-50 — No LLM-as-judge critique pass before human review (for now)
Sakshi asked whether a second LLM should critique judgment-call fields before she reviews them.
- **Decision:** no, not now.
- **Why:** a critic drawn from the same model class tends to share the original's blind spots, and its
  real value is triage at volume — reducing how much a human must read. At ~1–2 jobs/day there is no
  volume to triage, and her own verdict is higher-quality signal than a second model's. It would also
  add an AI call per job against the D-5 free-tier constraint.
- **Revisit when:** daily volume exceeds what she will actually review by hand.

## D-51 — Langfuse + tracing deferred to v2; feedback capture stays v1
Sakshi asked about traces and how teams visualise what works. Researched the current tooling.
- **Decision:** **v2** for tracing and any observability platform. **v1** for feedback capture (D-49).
- **Why the split:** these solve different problems. Tracing answers "what happened across many runs";
  the pipeline has run **zero** times, so there is nothing to observe yet — instrumentation ahead of
  the thing instrumented. Feedback cannot be backfilled, so it cannot wait. History can be imported
  into a tracing tool later.
- **Tool preference if/when adopted: Langfuse**, not LangSmith — MIT-licensed, self-hostable free,
  generous free cloud tier, and it covers tracing + prompt versioning + user feedback + LLM-as-judge
  in one place. LangSmith is proprietary with self-hosting locked behind Enterprise, which conflicts
  with D-5's $0 constraint.
- **What "a trace" would mean here:** one job's pass through `classify → skills → salary` as a single
  record with one span per stage (input, output, duration, tokens, cost).
- **Options considered:** (a) adopt Langfuse **now**, in v1, so no history is ever missed — rejected:
  instrumentation ahead of the thing instrumented (zero runs so far), and traces *can* be backfilled
  from stored `raw_output` later, unlike feedback; (b) **LangSmith** — rejected: proprietary,
  self-hosting is Enterprise-only, conflicting with D-5's $0 constraint; (c) **a custom dashboard**
  over `job_events` + `ai_usage` — rejected: rebuilds badly what an MIT-licensed tool gives free.
- **Gaps noted for whenever this is built:** latency is not captured anywhere today; `ai_usage` tokens
  are linked to `(job, stage)` but not to the specific enrichment row; there is no run/trace id tying
  a job's stages to one run.

## D-52 — No watchlist weighting in v1; `weight` and its logic move to v2+
- **Decision:** `company_watchlist.weight` is **not used in v1**. Weighting becomes relevant only once
  Sakshi flags dream companies, and the weighting *logic* is to be decided at that point, not now.
- **Consequence — the watchlist's v1 job shrinks to exactly one thing:** driving a dedicated Apify
  company-search task per company, so that company's postings are caught even if the general
  title-based search misses them.
- **Makes the `active` bug latent rather than live.** Verified this session: `recommend.ts:12-16`
  looks up a company by `company_slug` and never filters on `active`, so setting `active = false`
  today would have no effect. With nothing reading `weight` in v1, nothing acts on that lookup at all.
  The fix travels with whatever v2 work reintroduces weighting.
- **Options considered:** (a) keep weighting in v1 with the existing default of 3 — rejected: with an
  empty watchlist (D-32) every job scores identically, so it is a no-op that still has to be reasoned
  about in the v1 `recommend` rule; (b) **fix the `active` filter now** while it is in view — rejected:
  fixing a switch nothing reads is churn, and the fix belongs with whatever v2 work reintroduces
  `weight`; (c) **drop `weight` entirely** — rejected: dream-company weighting is a real want Sakshi
  named, just not a v1 one.
- **Open, deliberately unresolved:** Sakshi noted the watchlist "is for companies that are just remote
  and don't have an opening yet" — but today `weight` only ever affects a posting *already discovered*,
  and nothing watches for a company's *first* posting. Whether the watchlist should also mean "alert
  me when this company finally posts" is a genuinely different feature, unbuilt, and not decided here.

## D-53 — v1 `recommend` is a deterministic rule over existing fields, not an AI call — amends D-37
D-37 deferred `recommend` to v2 outright. Sakshi instead proposed a concrete v1 rule. Reading the
existing prompt (`lib/ai/prompts.ts:56-79`) showed the original logic was: company weight + résumé
match + AI-focus + technical depth + remote type + salary-stated, blended by the model into
high/med/low.
- **Decision — v1 rule:** `background_match` + AI focus + technical + IIT/IIM barrier, with
  **salary > 15 LPA as a bonus signal only**. Remote type is dropped as a criterion because everything
  surviving the ingest pre-filter is already remote-India-eligible — it carries no discriminating
  information. Résumé match is dropped because `resume_match` is deferred and on-demand (D-38).
- **Implemented as plain code, not an AI call.** Every input is already extracted by earlier stages,
  so blending them needs no model: it is cheaper, instant, fully predictable, and inspectable when a
  ranking looks wrong.
- **Amends D-37**, which moved `recommend` wholesale to v2. The *judgment-layer* concern D-37 raised
  is still honoured — what ships is a transparent rule over described facts, not a learned or
  model-authored judgment.
- **Also resolves a live gap D-37 left open:** `recommend` is still wired into `pipeline.ts`'s `ORDER`
  today, and `lib/telegram.ts` + `lib/notion.ts` read `priority` and `recommend_reasons` to build the
  alert itself. Removing `recommend` without a replacement would have silently emptied the alerts.
  This rule keeps `priority` populated, so the notification path keeps working.
- **Options considered:** (a) **keep the existing AI `recommend` call** and retune its prompt —
  rejected: it blends six inputs opaquely, so a wrong ranking can't be traced to a cause, and two of
  those inputs (`resume_match`, remote type) are now respectively deferred and non-discriminating;
  (b) **remove `recommend` entirely** per D-37's letter and send every job unranked — rejected: empties
  the notification content described above, and Sakshi wanted a v1 ranking; (c) **keep it an AI call
  with the narrower input set** — rejected: once the inputs are four already-extracted fields and a
  threshold, a model adds cost, latency, and nondeterminism to arithmetic.

**Amended 2026-08-04 (Session 9) — see D-62, D-63, D-64.** D-53 named the rule's inputs but never
defined what combination yields high/med/low; **D-62** states that function. **D-63 corrects an error
here:** the input list "background_match + AI focus + **technical** + IIT/IIM barrier" treated
`is_technical` as a *positive* signal, inherited unexamined from the original AI prompt. Sakshi is
non-technical and seeks non-tech roles, so technical is a **downgrade** — `is_technical` leaves the
rule and `technical_depth >= 4` demotes. **D-64** settles that `iit_iim_required` demotes rather than
filters. **D-74** confirms the omission of company weight was deliberate.

## D-54 — Unknown salary is ignored, never a downgrade
- **Decision:** when `salary_status = 'unknown'`, the salary criterion in D-53's rule is skipped
  entirely — it neither adds nor subtracts.
- **Why:** Sakshi's own test case settled it — "manually I would have preferred this job." Salary is
  frequently unstated, and per D-12 it is parsed-only and never estimated, so `unknown` is the common
  case. Treating absence as failure would rank jobs by the company's disclosure habits rather than by
  anything about the job.

## D-55 — External salary lookup (AmbitionBox / Glassdoor) rejected
Sakshi asked whether AI could fetch salary from AmbitionBox or similar and label it as externally
sourced rather than from the JD.
- **Decision:** no.
- **Why:** three independent reasons. (1) Neither site offers an official public API — every route is
  a third-party scraper, whose own disclaimers place ToS compliance on the user, so this means a
  **second scraping-ToS exposure** on top of LinkedIn. (2) It collides with **D-12**: a site's
  company-level average is an estimate for a *different role at the same company*, which is precisely
  the "confident-sounding guess that can mislead an actual job decision" D-12 banned — the honest
  labelling Sakshi proposed addresses transparency but not accuracy. (3) Salary is only a **bonus**
  criterion (D-53/D-54), so the payoff is small.
- **Revisit if:** unknown salary turns out to actually block real decisions in practice.

## D-56 — LinkedIn alumni/recruiter search stays manual; automation rejected
Sakshi asked whether finding recruiters and alumni referral contacts could be automated (Lusha,
Apollo, RocketReach and similar were reviewed).
- **Decision:** keep people-search manual. Automate only the **bookkeeping** around it (who was
  contacted, when, whether they replied) — which belongs to the tracker module (D-42).
- **Why — this is a materially different risk from the job scraping already accepted in D-30:**
  there is **no official LinkedIn API for reading profile data**, so every option is a scraper; and
  people/alumni search requires operating **inside her logged-in personal account**, which is exactly
  the risk profile D-30's cookieless-actor research was done to avoid. The reviewed material is
  explicit that the practical consequence for an individual is not a lawsuit but **account restriction
  or ban**, and that Chrome-extension tools "act on your logged-in account at machine speed, which is
  easy for LinkedIn to flag." LinkedIn removed Apollo.io's and Seamless.AI's company pages in March
  2025 and sued Proxycurl into shutting down.
- **Cost/benefit:** losing the LinkedIn account would cost far more than the manual search saves.
- **Zero-cost alternative noted:** LinkedIn's own alumni search (school page → alumni, filtered by
  company/role) and a company's People tab do this manually for free, consistent with D-5.
- **Paid options, for the record, all rejected on D-5 grounds:** Lusha (~$29/user/mo), RocketReach,
  Apollo (has a free tier — the least-bad option if this is ever revisited).

## D-57 — `institute_requirement` moves from the AI call to regex; the other classify outputs stay AI
Sakshi asked which extraction genuinely needs an LLM.
- **Decision:** `institute_requirement` (IIT/IIM) becomes a **regex/keyword check**, removed from the
  AI prompt. `is_technical`, `technical_depth` (1–5), and `skills` **stay AI**. `is_ai` stays AI for
  now (borderline).
- **Why:** keyword matching finds only what you thought to list in advance. That is a perfect fit for
  IIT/IIM — a small, closed, literal vocabulary that appears verbatim. It is a poor fit for
  `technical_depth`, which is a judgment about the role with no corresponding keyword, and for
  `skills`, an open vocabulary where a fixed list would miss anything new or differently phrased
  ("stakeholder management" vs "managing stakeholders").
- **`is_ai` — considered, not moved:** keyword matching on AI/ML/LLM mostly works but false-positives
  on boilerplate company blurbs ("we use AI internally") that do not make the *role* AI-focused.
  Cheaper but noisier; left on AI pending real data.
- **Already regex, unchanged:** the remote/India pre-filter (`REMOTE_INDIA_KEYWORDS`) and salary
  parsing (D-12).

## D-58 — No instant/digest notification split in v1
Today `services/notify/notify.ts` routes `high` priority to an instant Telegram message and bundles
`med`/`low` into a periodic digest.
- **Decision:** v1 sends **one notification per qualifying job**, no tiering, no digest.
- **Why:** a digest exists to protect against volume. At ~1–2 relevant jobs/day there is no volume to
  protect against, and the split adds a second delivery path to build, test, and debug for no benefit.
- **Revisit when:** daily volume is high enough that per-job messages become noise.
- **Unchanged:** D-16's idempotency guard (a `NotificationSent` event per job) still applies.

**Extended 2026-08-04 (Session 9) — see D-65.** Removing the digest left it undefined what `low`
priority should do, since med/low were previously the digest's contents. D-65 settles it: **only
`high` and `med` are notified**; `low` is computed and stored but never sent.

## D-59 — Notion dropped from job-scout entirely (amends D-2; closes a Session-1 open question)
**2026-08-04 10:15 IST**
D-2 chose three delivery surfaces — dashboard, Notion, Telegram — on the reasoning that Sakshi wanted
"a tracker she can filter/manage." D-42 then created a **post-discovery tracker module** whose entire
purpose is that same job, built from her real Notion structure. Sakshi's call: drop Notion.
- **Decision:** job-scout does **not** write to Notion. Telegram is the sole delivery surface for v1.
- **Why:** the tracker module is a purpose-built replacement for exactly what Notion was doing here.
  Running both would mean two systems holding the same records with no authoritative one — and the
  ambiguity gets worse, not better, once the tracker ships and the two diverge.
- **Options considered:** **keep Notion as a bridge until the tracker module ships** — this was the
  recommendation, on the grounds that the tracker doesn't exist yet and dropping Notion leaves nothing
  but Telegram messages in the interim. **Rejected by Sakshi.** The bridge argument only holds if the
  Notion output would actually be used in the meantime; it wouldn't be.
- **Amends D-2.** Delivery is now Telegram (v1) + dashboard (later). Notion is removed as a surface,
  not deferred.
- **Closes an open question carried since Session 1** — "Notion: new database or the existing one?"
  is now moot and should stop appearing in handoffs.
- **Implementation consequence:** `services/notify/notify.ts` calls `upsertJobPage(row)` on **every**
  delivery path, including the non-Telegram one. Removing it makes `lib/notion.ts` dead code and
  `NOTION_TOKEN` / `NOTION_DATABASE_ID` unnecessary — two of the five still-empty secrets disappear
  rather than needing to be filled.
- **Not deleted, just unwired:** `lib/notion.ts` and `docs/NOTION_SETUP.md` stay on disk. The tracker
  module may want the Notion-page-shape mapping as reference input, since it is being designed from
  her Notion structure anyway.

## D-60 — Drop the seven `qualify` columns from the schema rather than carrying them forward
**2026-08-04 15:40 IST**
`0002_lane_ready.sql:10-16` added `signals`, `opportunity_score`, `lane`, `lane_reasons`, `urgency`,
`qualification_version`, `lane_rules_version` to `job_enrichments` for a `qualify` stage that was
never built. Verified this session: zero code writes any of them, and `EnrichStage` (`lib/types.ts:4`)
has no `qualify` member, so the stage cannot run. `0002:74` also makes `v_jobs_enriched` LEFT JOIN on
`stage = 'qualify'` — a join that returns nothing on every query.
- **Decision:** migration `0003` drops all seven columns and the `qualify` join in the view.
- **Why:** the cost of re-adding them later is **zero** — they are nullable with no defaults, so
  `ALTER TABLE ... ADD COLUMN` is a catalog-only change in Postgres, instant regardless of row count,
  with no backfill (no existing row would have had a value). Against that, D-37 and D-24 both record
  that **what lanes A/B/C/D mean was never defined**. So the columns encode an earlier session's guess
  at the shape of an undesigned feature, and once they ship in `0003` they read as settled to whoever
  opens the schema next. When qualify is actually designed, the columns it needs almost certainly
  won't be these seven.
- **Options considered:** (a) **keep them as a forward declaration** — rejected: this session's own
  exploration had to individually verify all seven were dead, which is the recurring cost of inert
  scaffolding; the `0002:43` comment "unused until Phase 2" is exactly the kind of note that ages
  badly. (b) **keep them to avoid touching the schema twice** — rejected: adding nullable columns is
  free, so there is no "touch it once" saving to bank.
- **Consequence:** the `stage` CHECK constraint dropped at `0002:20` (dropped specifically to admit
  `'qualify'`) should be **restored** with the real stage list. An unconstrained `stage` column means
  a typo silently creates an orphan row that the view's joins never pick up.

**Executed 2026-08-05 (Session 12) — but see D-86.** The seven columns are gone and the `stage` CHECK is
restored as `('classify','geo_recheck','skills','salary','recommend')`. **There is no migration `0003`**:
`0001` and `0002` were squashed into a single fresh `0001_schema.sql`, so the columns are never created
rather than created-then-dropped. Read "0003" in this entry (and in older summaries) as that file.

## D-61 — No manual "chance of selection" field; priority is always computed — amends D-37
**2026-08-04 15:55 IST**
D-37 introduced a manual "chance of selection" field as a v1 item, on the grounds that Sakshi fills
one in by hand in Notion today and it is functionally the deferred AI `priority`.
- **Decision:** drop it. Priority is computed from `background_match`, `is_ai`, `technical_depth`, and
  `institute_requirement` — never hand-entered.
- **Why:** two of D-37's premises no longer hold. The field never got a column (no migration ever
  added it), and **D-59 removed Notion**, which was the surface she typed it into. So the feature as
  described has neither storage nor an input. More importantly, D-53 replaced the deferred *AI*
  priority with a deterministic rule shipping **in v1** — the gap the manual field existed to bridge
  has closed.
- **Options considered:** (a) **keep it as a Telegram-entered override** — rejected as premature: it
  would need its own capture flow, and the per-field feedback mechanism (D-69) already provides a way
  to correct a computed priority. (b) **keep it and let it win over the computed value** — rejected:
  that is `locked_fields` behaviour, and `locked_fields` has never executed once (see D-72's finding);
  building an override before the thing being overridden has ever run is the D-30 mistake again.
- **Amends D-37**, specifically its "New in v1" clause.

## D-62 — The v1 priority rule, stated exactly
**2026-08-04 16:10 IST**
D-53 named the *inputs* to the deterministic `recommend` rule but never specified what combination
produces high, med, or low. That function was undefined until this session.
- **Decision:**
  - **high** = `background_match` non-empty **AND** at least one other positive signal
  - **med** = one signal present
  - **low** = none
  - **Downgrade one level** when `technical_depth >= 4` (D-63) or `institute_requirement =
    'iit_iim_required'` (D-64).
  - Salary > 15 LPA promotes med → high only; it never demotes (per D-53, D-54).
- **Why:** `background_match` is the only input that is genuinely about *her* rather than about the
  job, which makes it the right primary signal. Everything else is a modifier.
- **Options considered:** (a) **additive point score with thresholds** — rejected: assigning weights
  to each signal invents precision nobody can justify before a single run, and a threshold expressed
  as "≥ 4 points" is far harder to sanity-check than a sentence. (b) **lexicographic sort with
  `background_match` first and everything else as tiebreak** — rejected: produces a total ordering
  when what the notification actually needs is a three-bucket gate.
- **Open:** whether `background_match` stores *which* tags matched or only whether any did. Storing
  them is what lets the Telegram chip say "matches: HR Tech" and makes per-field feedback possible.

## D-63 — `is_technical` is a downgrade, not a positive signal; `technical_depth` replaces it in the rule — amends D-53
**2026-08-04 16:20 IST**
D-53 listed the rule inputs as "background_match + AI focus + **technical** + IIT/IIM barrier",
treating `is_technical: 'technical'` as a point in a job's favour. Sakshi stated this session that she
is **non-technical and is looking for non-tech roles where possible**. Under D-53 as written,
technical roles she would struggle with were being promoted into her notifications.
- **Decision:** `is_technical` is removed from the rule entirely. `technical_depth >= 4` downgrades
  one priority level. `is_ai` remains a positive signal.
- **Why "technical = good" was ever in there:** it was inherited from the original `recommend` prompt
  in the initial commit (`lib/ai/prompts.ts:56-82`), which blended six inputs including technical
  depth. **It was never decided** — D-53 carried the input list forward from existing code without
  testing it against Sakshi's actual profile. Same failure mode as D-37 reasoning over an inherited
  five-stage list (see the Session 9 summary entry).
- **Why depth rather than the boolean:** `is_technical` and `technical_depth` measure the same
  property at different resolutions — per the rubric at `lib/ai/prompts.ts:16`, "technical" is roughly
  depth ≥ 3. Using **depth alone** removes the case where the two disagree and something has to decide
  which wins. The rubric already reads 1 = pure stakeholder/ops PM, 3 = dashboards and basic SQL,
  5 = writes code with deep ML fluency; 1–2 fits her, 3 is borderline, 4–5 screens her out.
- **`is_ai` stays positive** because an AI PM role is not necessarily a *technical* PM role, and AI
  focus is her stated goal.
- **Options considered:** (a) **make `is_technical` neutral rather than negative** — rejected: a
  technical role is actively a worse fit, not a neutral one, so neutrality would still let technical
  jobs reach `high` on other signals. (b) **treat `technical` as a hard exclusion** — rejected: depth 3
  roles are plausible and a hard filter would hide them entirely; a downgrade keeps them visible at
  lower priority.
- **Amends D-53.**

## D-64 — `iit_iim_required` is a downgrade, not a disqualifier
**2026-08-04 16:25 IST**
D-53 called the IIT/IIM barrier an input without saying whether it filters or merely demotes. Sakshi
has no IIT/IIM background.
- **Decision:** `institute_requirement = 'iit_iim_required'` downgrades one priority level. It does
  not suppress the job.
- **Why:** the classifier's own rubric (`prompts.ts:19`) sets this value only when a tier-1 institute
  is a **hard** requirement, but stated hard requirements are frequently negotiable in practice, and a
  suppressed job is one she never learns existed. A downgrade keeps it visible and costs her nothing
  but a lower position.
- **Options considered:** **treat it as an ingest-level or notify-level filter** — rejected: it makes
  the classifier's judgment irreversible, and a false `iit_iim_required` (the classifier is unvalidated,
  see D-71) would silently delete real opportunities with no way to notice.

## D-65 — Notify `high` and `med` only; `low` is computed and stored but never sent
**2026-08-04 16:30 IST**
`services/notify/notify.ts:16-24` filters on `priority in (...)`, with high → instant and med/low → a
digest. **D-58 removed the instant/digest split**, which left it undefined what `low` should do.
- **Decision:** `low` priority jobs are computed, stored, and never notified.
- **Why:** with the digest gone, sending `low` would make it indistinguishable from `high` at the
  point of delivery, which reduces `priority` to a decorative emoji. Suppressing it makes the rule
  actually mean something.
- **Consequence worth stating plainly:** `priority` is therefore doing **two jobs** — deciding what
  reaches her (high/med vs low) and labelling how it looks (the emoji). They remain one field for now;
  splitting them is only worth it if a third delivery behaviour appears.
- **Options considered:** **send everything and let the emoji carry the signal** — rejected: the
  product exists to stop her reading every posting, and a notification stream containing all jobs
  restores the original problem in a new surface.

## D-66 — `recommend_reasons` are generated deterministically in v1
**2026-08-04 16:35 IST**
`lib/telegram.ts:44` renders `recommend_reasons[]` as the "why" chips in each notification. Today an
AI writes them as free text.
- **Decision:** under D-53's rule, reasons are generated from **which conditions fired** — plain
  strings assembled in code. An AI-phrased version is logged as a possible later improvement, not v1.
- **Why:** once priority is arithmetic over four extracted fields, the reasons are already known
  exactly; asking a model to phrase them adds cost, latency, and the possibility of a reason that
  doesn't match the rule that actually fired.
- **Tradeoff accepted:** the reason strings become copy Sakshi designs rather than prose a model
  writes. That is a feature — it makes a wrong ranking traceable to a named condition.

## D-67 — `background_match` is AI-generated over a CLOSED vocabulary seeded from Sakshi's real Notion tags
**2026-08-04 16:45 IST**
D-46/D-47 established that `background_match` is fed by work history and education, but never defined
its output. Sakshi provided a screenshot of the tags she assigns **by hand in Notion today**:
`Support Company` · `Role Match – Support Work` · `Research Experience` · `HR Tech` · `CPG company`.
Her background: MBA in HR, product support, BSc, fundamental research at TIFR, two HR internships.
- **Decision:** the AI selects zero or more tags **from a fixed list**, not free text. Sakshi's five
  existing tags are the seed vocabulary. It rides on the existing `classify` call rather than being
  its own stage.
- **Why a closed set:** free-form labels drift — "Support Company", "Customer Support Org", and
  "Support-focused" are one concept in three strings. Drift makes the tags uncountable and
  unfilterable, and makes the **priority rule unstable across re-runs** (the same job could score
  differently after a prompt tweak). A closed enum also makes validation trivial: did the model pick
  the tags Sakshi would have?
- **Why AI and not manual:** manual tagging defeats the product's purpose — the whole point is to
  avoid opening every JD. Marginal cost is a few output tokens on a call already being made.
- **Why the seed vocabulary is trustworthy:** it is drawn from tags she actually used over months of
  real job-hunting, not reverse-engineered from a design discussion. Her five tags already span three
  distinct kinds of match — company/industry (`HR Tech`, `CPG company`, `Support Company`), role
  function (`Role Match – Support Work`), and credential (`Research Experience`).
- **Options considered:** (a) **free-form AI tags** — rejected for the drift reasons above.
  (b) **keep tagging manual for now** — rejected: it reinstates the reading burden the tool exists to
  remove, and produces no data the rule can consume automatically.

## D-68 — Novel background matches go to a separate `background_match_suggested` field and never feed the rule until promoted
**2026-08-04 16:50 IST**
Companion to D-67. A closed vocabulary cannot grow on its own, and Sakshi's five seed tags will not
cover every real match.
- **Decision:** when the model sees a genuine match with no matching tag, it writes a free-text
  suggestion into a **separate field** (`background_match_suggested`). Sakshi reviews these
  periodically and promotes good ones into the vocabulary. **Suggestions never contribute to the
  priority rule until promoted.**
- **Why the separation is the whole point:** if suggestions counted toward `background_match`,
  free-form drift would re-enter ranking through the back door and defeat D-67 entirely. Keeping them
  in a field nothing reads makes the vocabulary an explicit, human-controlled decision while still
  capturing what the model noticed.
- **Options considered:** (a) **let the model add to the vocabulary directly** — rejected: the
  vocabulary would grow unboundedly and priority would become non-reproducible. (b) **discard
  non-matching observations** — rejected: the vocabulary would never improve, and the information is
  free to keep.

## D-69 — Feedback capture is PER-FIELD, because it doubles as the classify validation instrument — resolves D-49
**2026-08-04 17:00 IST**
D-49 scoped feedback as per-field thumbs plus optional free-text correction. Earlier **this session**
the recommendation was job-level thumbs (two Telegram buttons) on cost grounds, with per-field deferred.
Sakshi then asked whether the feedback button could serve as classify validation — and that reverses
the answer.
- **Decision:** per-field, as D-49 originally specified.
- **Why the reasoning changed:** if feedback is the mechanism by which classify gets validated, then
  job-level thumbs are useless — "this job was wrong" cannot tell you whether `is_ai`,
  `technical_depth`, `remote_type`, or `background_match` was the failure. Field attribution is not a
  nice-to-have here; it is the entire diagnostic value. The earlier recommendation optimised for
  build cost against a purpose (preference signal) that turned out to be the wrong purpose.
- **This resolves the granularity question** parked earlier in this session pending the schema walk.
- **Options considered:** (a) **job-level thumbs plus a "wrong about…" expander** — still viable as an
  *interaction* design (one tap on the happy path, field list only when she disagrees) and worth
  building that way; the decision here is about what gets **stored**, which must be per-field either
  way. (b) **job-level only** — rejected for the reason above.
- **Consequence:** `job_feedback`'s columns still need finalising, and whether a row attaches to
  `job_id` or `enrichment_id` is still open — it determines whether a correction survives
  re-classification under an improved prompt.

## D-70 — No review queue and no review agent; uncertainty is a marker on the notification itself
**2026-08-04 17:10 IST**
D-7 specified confidence-gated trust with a review queue. Verified this session: `confidence` and
`needs_review` are **write-only** — produced at `lib/enrich/classify.ts:23` (`< 0.6`, hardcoded),
persisted, given a partial index (`0001_schema.sql:127-128`) built for a queue — and read by nothing.
Sakshi asked whether confidence review should be an agent.
- **Decision:** no queue, no agent. Show uncertainty as a marker on the Telegram notification she
  already receives, beside the feedback buttons.
- **Why not an agent:** an agent re-reviewing low-confidence classifications is LLM-as-judge, which
  **D-50 already rejected** — same model class checking its own work, and no volume problem to triage
  at 1–2 jobs/day.
- **Why not a queue:** it requires a surface that doesn't exist, and it splits her attention across
  two places. A marker on the existing notification puts the uncertainty signal and the correction
  affordance in the same message.
- **Weakness stated explicitly:** model self-reported confidence correlates only weakly with actual
  accuracy — models are routinely confidently wrong. So this is a cheap hint, never a substitute for
  D-71's deliberate validation. This is also the argument against investing further in it.
- **Not rejected, and specifically not what D-50 ruled out:** re-running a classification on a
  **different provider** (three exist per D-5) and flagging disagreement. Independent-model
  disagreement is a genuine uncertainty signal rather than self-review. Cost is one extra call on
  low-confidence rows only. Left open.

## D-71 — `classify` is validated by hand-tagging 20–30 real JDs; `recommend` is validated by unit tests
**2026-08-04 17:20 IST**
Sakshi asked how to validate classify and recommend, and whether they are AI or regex.
- **Decision:**
  - **`classify` (AI)** — before trusting the pipeline, hand-tag 20–30 real JDs, run classify, and
    compare **field by field**. This yields a per-field accuracy number and identifies *which* tag is
    unreliable. `raw_output` already persists full model responses, so this needs no new instrumentation.
  - **`recommend` (plain code after D-53)** — needs no statistical validation. It is arithmetic; unit
    tests pin it (given these tags → this priority). This is a large part of why D-53 chose code.
- **Why a deliberate pass rather than relying on feedback:** at 1–2 jobs/day, per-field feedback
  (D-69) yields ~30 data points in a **month**. The accuracy number is needed *before* the pipeline is
  trusted, not after months of using it untrusted. The two are complementary — the pass gives the
  number now, feedback keeps it honest afterwards.
- **Why classify specifically:** every downstream decision consumes its output. If `is_ai` is wrong
  30% of the time, D-62's rule is precise arithmetic over noise.

## D-72 — Dropped postings are persisted with a reason instead of being discarded
**2026-08-04 17:30 IST**
`services/discovery/ingest.ts:50-53` drops obviously-onsite postings with `continue` — the job is
never inserted, so there is no row, no log, and no way to audit whether the filter is wrong. The
counter `droppedNonRemote` is returned in `IngestSummary` and then thrown away.
- **Decision:** replace `continue` with an insert carrying a `dropped_reason`, and **exclude flagged
  rows from `enrichPending()`**.
- **Why not simply disable the filter for the first run:** `env.ingest.remoteFilter()` is already a
  config flag, so flipping it is a zero-code alternative — but `enrichPending()` (`lib/enrich/pipeline.ts:39`)
  picks up any job lacking a terminal enrichment row and has no idea *why* a job is present. Storing
  a few hundred onsite jobs would therefore trigger roughly three AI calls each on postings she
  deliberately does not want, consuming free-tier quota that can't be recovered and potentially
  rate-limiting the jobs she does want.
- **What it enables (D-73's audit):** running `classify` **once** over the flagged rows and counting
  how often the AI disagrees with the regex. That calibrates the filter against real postings instead
  of speculation.
- **Options considered:** (a) **leave `continue` as-is** — rejected: you cannot audit what you never
  stored, and this is the one filter that can silently delete opportunities. (b) **disable the filter
  entirely** — rejected for the enrichment cost above.

## D-73 — `geo_explicit` distinguishes "explicitly India-eligible" from "assumed eligible by default"
**2026-08-04 17:40 IST**
`lib/ai/prompts.ts:14` assigns `remote_type = 'remote_india'` when the JD mentions India/Asia/global
remote **or has no geo restriction at all**. So explicit eligibility and fail-open default are stored
identically, and uncertainty cannot be surfaced or measured.
- **Decision:** add a `geo_explicit` boolean alongside `remote_type`. The Telegram chip reads
  "Remote-India" vs **"Remote-India (assumed)"**.
- **Why fail-open is nevertheless correct:** verified this session that both the ingest regex
  (`lib/discovery/normalize.ts:31-35`, drops only when an onsite marker is present **and** there is no
  remote signal) and the classifier default keep ambiguous postings. For a job search that is the
  right trade — a false positive costs 30 seconds of reading; a false negative costs a role she never
  knew existed. The flag makes the cost of that trade visible rather than changing it.
- **How the loop closes:** the "(assumed)" marker is corrected through per-field feedback (D-69) —
  `remote_type` is simply one of the fields feedback covers. No new machinery.
- **Part of a general pattern** — see `learnings.md`: the schema repeatedly collapses "we know X" and
  "we defaulted to X" into one value (`salary_status`, `remote_type`, `background_match`), and that
  collapse is precisely what makes each failure mode invisible.

## D-74 — `company_watchlist.weight` has no effect on ranking in v1
**2026-08-04 17:45 IST**
D-53 omitted company weight from the rule's inputs without saying whether that was deliberate.
Verified this session: `company_watchlist` has **no loader**, `seed/company_watchlist.json` is empty
and referenced by zero code, and its only reader (`lib/enrich/recommend.ts:12-16`) therefore always
takes the `?? 3` default.
- **Decision:** confirmed intentional. Watchlist weight does not influence priority in v1.
- **Why:** per D-52 the watchlist's only v1 role is driving dedicated Apify company tasks. Weighting
  arrives with `dream_company` in v2 (D-42, D-52), and the weighting logic itself is still undecided.
- **Consequence:** the `weight` column stays but is inert in v1, which is now stated rather than
  implied by an always-default lookup.

## D-75 — A second, targeted AI pass re-checks geo-eligibility on `geo_explicit = false` jobs — extends D-73
**2026-08-04 18:00 IST**
D-73 makes the assumed-eligible cases *visible* but leaves them assumed. Sakshi's call: the AI should
actually **check** the ones marked assumed rather than only flagging them.
- **Decision:** jobs where `remote_type = 'remote_india'` **and** `geo_explicit = false` get one
  additional focused AI call that attempts to infer eligibility from indirect signals, and may
  overturn the default.
- **Why a second call rather than improving the first:** `classify` is a broad multi-field triage —
  one prompt producing eight outputs across remote type, technicality, AI focus, business model, and
  institute requirement. A single question ("can an India-based candidate plausibly hold this role?")
  can be given far richer instruction than a shared prompt can afford: work-authorisation language,
  timezone-overlap requirements, company headquarters and other postings, "US-based team" phrasing,
  payroll/contracting hints. Loading all of that into `classify` would bloat every call for a question
  that only matters on a subset.
- **Why the cost is acceptable:** it runs **only** on the assumed subset, not on every job. At 1–2
  relevant jobs/day with only some lacking an explicit geo statement, this is a handful of calls a
  week — a very different cost profile from the per-job `skills` call under review.
- **Why this is not the LLM-as-judge pattern D-50 rejected:** it is not a model re-grading its own
  earlier answer. The first pass had no geo signal to work from and fell back to a documented default;
  the second pass asks a different, narrower question with different evidence. If it is additionally
  run on a **different provider** (D-70), disagreement between independent models becomes a genuine
  uncertainty signal rather than self-review.
- **Outcome recorded, not silently applied:** the second pass writes its own verdict and reasoning
  rather than overwriting `classify`'s row — consistent with D-6/D-9 versioning, so a wrong override
  stays traceable and correctable via per-field feedback (D-69).
- **Options considered:** (a) **leave them assumed and rely on feedback (D-73 alone)** — rejected:
  that makes Sakshi the geo-checker on every ambiguous posting, which is the manual reading the tool
  exists to remove. (b) **treat missing geo information as ineligible** — rejected: fail-closed
  deletes real opportunities invisibly, the exact risk D-72 was written to make auditable.
  (c) **fold the richer geo instructions into the main `classify` prompt** — rejected: it lengthens
  every call for a question most jobs answer explicitly, and a longer prompt degrades the other seven
  outputs it shares space with.
- **Interaction with D-72's audit:** the same targeted prompt can be run over the dropped rows to test
  the ingest regex, so one prompt serves both the false-positive and false-negative checks.

---

# Session 12 (2026-08-05) — schema walk finished; consolidated schema + pipeline built

> Sessions 10 and 11 ran in parallel with this one (user research; workspace monorepo split).
> Neither added decisions here — the numbering below continues cleanly from D-75.

## D-76 — Telegram sends `remote_type = 'remote_india'` only
**2026-08-05 10:15 IST**
Resolves the question `scope.md` carried as **"Not decided"** since Session 9. Nothing gated on
`remote_type` anywhere: the ingest regex fails open by design, `notify` filtered on `priority` alone,
and D-53 removed `remote_type` from the priority rule — so a job `classify` correctly tagged
`remote_global` was still delivered. The field was produced by an AI call and consumed by nothing.
- **Decision:** a hard gate at `notify`. `remote_global` and `other` are never sent.
- **Independent of `geo_explicit`:** assumed-eligible jobs are still delivered, marked "(assumed)".
  The gate excludes what the classifier positively identified as *not* India-eligible, not what it was
  merely unsure about.
- **Does not reverse D-53.** That decision removed `remote_type` as a *ranking* input, on the grounds
  that it carries no discriminating information among jobs that pass. This is a *delivery* gate, which
  is a different question — and the reason D-53's premise held is precisely that something downstream
  was supposed to be filtering.
- **Options considered:** (a) **gate at ingest instead** — rejected: the ingest regex is deliberately
  cheap and fail-open (D-3, D-73); moving real judgment there would delete jobs before the AI ever
  sees them. Cheap regex at ingest, real judgment at delivery. (b) **leave it ungated and rely on the
  priority rule** — rejected: `recommend` has no `remote_type` input at all, so nothing would ever act.

## D-77 — Feedback capture is built now, scoped to the geo fields, by polling rather than a webhook
**2026-08-05 10:40 IST**
Sakshi asked for her right/wrong judgement on the geo verdict to be stored. Investigation found **no
feedback mechanism exists anywhere in this codebase** — no buttons, no receiver, no table — for any
field, not just this one. She first chose to defer it, then reversed on reflection.
- **Decision:** build it, scoped small — 👍/👎 on the assumed-geo marker only, not the full D-69
  per-field system across every classify output.
- **Polling, not a push webhook.** This project runs entirely as periodic scripts; **no HTTP endpoint
  is deployed anywhere** (even the Apify ingest handler is written to be mounted "in Phase 7" and is
  not mounted today). Telegram's `getUpdates` with a persisted offset is the same shape as every other
  stage and needs no new infrastructure. A webhook would mean standing up this project's first live
  server to receive two buttons.
- **Accepted tradeoff:** this Telegram-specific plumbing may be partly superseded once the dashboard
  (D-2, unbuilt, Phase 7-8) becomes the natural place to give feedback. Chosen anyway because the
  correction loop is worth having now rather than after that lands.
- **Buttons only on assumed-geo jobs**, not every message — a control on every notification trains her
  to ignore it, and an explicitly-stated eligibility has nothing to correct.
- **Options considered:** (a) **defer entirely until the dashboard** — her initial answer, reversed;
  (b) **a low-tech manual capture** (forward to a sheet) — rejected as more ongoing effort than the
  poller costs to build once.

## D-78 — `profile` holds structured résumé data shaped to match resume-builder's `candidate_profile`
**2026-08-05 11:20 IST**
D-46 decided `profile` should hold structured work history and education; those columns were never
added. Its actual columns (`headline`, `skills text[]`, `preferences`) were the *wrong* shape for the
one thing that reads it — D-47 requires experience and education, explicitly not a skills list.
Sakshi asked whether resume-builder already solved this. It has: `candidate_profile` is **live** there
(5 files read/write it) with a richer shape than the one being invented here.
- **Decision:** adopt resume-builder's field names and shapes — `experience`, `education`,
  `certifications`, `projects`, `awards`, `skills`, `resume_raw_text`, `resume_filename` — plus
  `summary` and `contact`. Drop `headline` (superseded) and `preferences` (no decision, no reader).
- **Why match rather than invent:** D-46 chose a *local copy* over a cross-module fetch to avoid a
  dependency that does not exist yet. That only pays off if the shape matches — otherwise a future sync
  is a translation layer, which is the cost D-46 was avoiding.
- **`experience.business_model` reuses the exact `saas|b2c|other` enum `job_enrichments` uses**, so a
  job's business model is comparable to her history by equality rather than by asking a model to read
  prose on both sides. `domain` (product + category, free text) is kept unsplit because those two have
  no structured consumer.
- **`skills` becomes grouped-by-category in BOTH modules**, not flat. Sakshi's call, reversing an
  earlier lean toward matching resume-builder's flat array: grouped→flat is a one-line transform,
  flat→grouped is unrecoverable. **Cross-module follow-up:** `resume-builder/candidate_profile.skills`
  is still flat and needs its own migration in that repo.
- **Options considered:** fetch résumé data from resume-builder at run time — already rejected by D-46
  for v1 and unchanged here.

## D-79 — `company_watchlist` drops `ats_type` and `ats_slug`
**2026-08-05 12:05 IST**
Open in `scope.md` since Session 8. These two columns existed to hold a manually-entered ATS type and
board slug per company, supporting ATS polling — a feature with no scheduled build (v3/unscheduled).
- **Decision:** drop both. Re-adding is a plain `ALTER TABLE` if ATS polling is ever scheduled; no data
  is lost because the watchlist itself is empty.
- **Why now rather than keeping as placeholders:** the design they supported is superseded. D-87's
  careers-page checker **auto-detects** a known ATS from the company's own site rather than requiring
  per-company configuration — the manual-config friction these columns encode is the exact reason the
  feature never got built.

## D-80 — Résumé matching leaves job-scout entirely; `resume_match_score` and `resume_version_id` dropped
**2026-08-05 12:15 IST**
D-38 redesigned `resume_match` as on-demand and deferred it to v2, but its columns and stage runner
stayed. Verified this session that resume-builder **already implements matching** —
`lib/tailor.ts` has per-requirement keyword-gap detection and a fabrication check ("Critic 1") that
blocks drafted bullets containing metrics absent from real evidence.
- **Decision:** drop both columns, delete `lib/enrich/resumeMatch.ts`, and remove `resume_match` from
  the stage list entirely. job-scout does not track a match score, not even cached.
- **Consequence:** the `stage` CHECK constraint (restored this session after `0002` loosened it) reads
  `('classify','geo_recheck','skills','salary','recommend')` — **five values, not the six** confirmed
  mid-session, because a `resume_match` row would now have nowhere to write. Flagged and corrected
  before the schema was written rather than applied silently.
- **Why not keep a cached number:** it would be a copy of a value another module owns, with no
  mechanism to invalidate it when the résumé changes.

## D-81 — Salary: a `CHECK` on `period`, a three-way `status`, and LPA-only promotion
**2026-08-05 12:40 IST**
Three open salary questions from `scope.md`, resolved together.
- **`salary_period` gets `check (in ('lpa','year','month'))`** — exactly what the regex parser already
  emits. Nothing writes anything else today; the constraint makes that guaranteed rather than
  incidental, so a future typo (`'yearly'`) fails loudly at the write instead of silently missing rows
  in every later comparison. No normalization is added: unlike `skills`, this value is never
  AI-generated, so there is no messy input to clean — only a future code mistake to catch.
- **`salary_status` becomes `'stated' | 'not_mentioned' | 'unrecognizable_format'`.** The old
  `'unknown'` covered both "the posting never mentions pay" and "it does, but the parser couldn't read
  it" — the same collapse D-73 named for `remote_type`, and it made the parser's own failure rate
  unmeasurable. **Refined during implementation** after a test exposed the flaw: detecting
  "unrecognizable" requires a **digit** near the pay context, because "Competitive salary and great
  benefits" mentions pay but contains no figure — counting that as a parser failure would pollute the
  very metric the split exists to produce.
- **The >15 LPA promotion (D-62) fires only when `salary_period = 'lpa'`.** Sakshi's reasoning: most
  remote-India roles quote INR, so other currencies are not worth conversion logic. A USD/year or
  INR/month figure is **ignored** for the rule, never treated as a negative — extending D-54's
  "unknown salary is ignored, never a downgrade" to "un-comparable salary is ignored too."

## D-82 — `skills` stays in v1; shape gains `required`; score-feeding deferred to v3
**2026-08-05 13:10 IST**
Session 9 flagged `skills` as a "candidate to challenge" — nothing consumes its output in v1, since the
skill-gap analytics that would are v2. Researched how real tools (Teal, Huntr, JobGlance, Jobscan) use
extracted skills: per-job gap display, feeding a fit score, and résumé-tailoring keyword gaps.
- **Decision:** keep it in v1, with the shape changed from `text[]` to `[{skill, required}]`.
- **Why the shape changes:** the prompt lumps "requires **or prefers**" into one list. Sakshi wants
  only genuine must-haves shown per job; tagging each skill preserves the preferred set instead of
  discarding it at extraction.
- **Score-feeding deferred to v3**, not v2 — her explicit call.
- **Résumé-tailoring keyword gaps are NOT job-scout's job** — resume-builder already does this better
  (D-80). No parallel implementation.
- **Argument recorded against its own value, honestly:** at 1-2 relevant jobs/day, and with D-3 having
  already made everything past remote+India a *tag rather than a filter*, extraction earns its cost
  mainly for cross-job comparison — not for reading one job, where the JD link would do. Kept anyway,
  but this is the weakest-justified item remaining in v1 and should be first to challenge if cost bites.

## D-83 — The `background_match` vocabulary lives in `app_config`, not in code
**2026-08-05 13:35 IST**
D-67 fixed the vocabulary as a closed set but not *where* it lives. Every other closed enum in this
schema (`is_technical`, `business_model`, …) is hardcoded in `prompts.ts` + `AIService.ts`.
- **Decision:** this one is different — it lives as an `app_config` row, so adding a sixth tag (or
  promoting a D-68 suggestion) is a **data edit Sakshi can make herself**, not a code change requiring
  a session with Claude.
- **Cost accepted:** this is genuinely new plumbing — nothing read `app_config` before, despite the
  table existing since `0002`. `classify.ts` (which already does DB I/O) fetches the vocabulary and
  passes it into the prompt, keeping `prompts.ts` free of its own database access.
- **The closed set is enforced in code, not just in the prompt:** any tag the model invents is filtered
  out of `background_match` and diverted into `background_match_suggested` (D-68) rather than dropped.
  A prompt instruction alone would let drift reach the priority rule, which is what D-67 exists to stop.
- **No new provenance column** for "which vocabulary was active" — `raw_output` already stores the full
  prompt per row (D-9), which recovers it.

## D-84 — `job_feedback` attaches to `enrichment_id` only
**2026-08-05 14:00 IST**
D-48 specified the table but left open — and D-69 explicitly flagged — whether a row attaches to
`job_id` (durable) or `enrichment_id` (version-scoped). Checked how this is actually done: **LangSmith's
live feedback schema** is `run_id` + `key` + `correction`, with no redundant parent-entity id.
- **Decision:** `enrichment_id` only. No `job_id` and no `stage` column — both are reachable by joining
  `job_enrichments`, and storing them again duplicates a fact that already lives elsewhere.
- **Why version-scoped is right here:** a correction is evidence about *a specific attempt*. Tying it to
  the job forever would let a stale correction silently override a genuinely improved prompt three
  months later, with nobody watching. It also makes D-71's question — "how accurate was prompt version
  N?" — answerable, which a job-scoped row cannot do.
- **`corrected_value` is `jsonb`, not `text`** (decided during implementation): it must round-trip
  `"remote_india"`, `false`, `3`, and `["HR Tech"]`. Text would have forced per-field cast hacks.
- **A thumbs-down with no `corrected_value` does not lock the field.** It still counts toward D-71's
  accuracy measurement, but there is no known value to pin — locking would freeze an empty answer.
- **Options considered:** **store both ids** — recommended first, then withdrawn once the LangSmith
  precedent showed a redundant parent id is not needed and the extra lookup costs nothing at this scale.

## D-85 — `ai_usage` gains `enrichment_id`; every stage's call order flips to write-then-record
**2026-08-05 14:20 IST**
D-51 noted tokens were linked to `(job, stage)` but not to the specific enrichment row. Left as a
"minor gap" by Claude's own judgement; Sakshi asked for it fixed.
- **Decision:** add `ai_usage.enrichment_id`. Two re-classifications of the same job were otherwise
  indistinguishable in the cost log, making "did the new prompt cost more than the old?" unanswerable.
- **Real code consequence, not just a column:** every stage called `recordAiUsage` **before**
  `writeEnrichment`, but `writeEnrichment` is what returns the row id. The order had to flip in every
  stage — write the enrichment, capture the id, then record usage against it.

## D-86 — The two migrations are squashed into one fresh `0001`; there is no `0003`
**2026-08-05 15:00 IST**
The plan had been to write an incremental `0003` (as D-60 and several summaries assume).
- **Decision:** rewrite `0001_schema.sql` as the final desired state and **delete
  `0002_lane_ready.sql`**. No `0003` exists.
- **Why:** `0003` would have been majority-DROP statements undoing work that never ran — `0002` adds
  seven `qualify` columns D-60 drops, loosens a `stage` CHECK this session restores, and `0001` creates
  a `profile` shape D-78 replaces plus four tables that leave the module. Reading "what is the schema"
  would require mentally executing three files.
- **The safety argument, which is what decided it:** Postgres refuses to drop or retype a column a view
  depends on — `v_skill_gap` blocks `profile.skills`, `v_jobs_enriched` blocks the seven qualify columns
  and `resume_match_score`. An incremental migration must drop and recreate those views in the right
  order, and forcing it with `CASCADE` would silently delete them. A fresh `CREATE` eliminates that
  entire hazard class. Sakshi's stated priority was "I don't want to break anything."
- **Only safe because nothing has ever run:** verified this session that the target project has no
  schema applied, there is no data, and the repo has one commit. The same change after the first real
  run would be expensive rather than free.
- **Supersedes D-60's "its seven schema columns are dropped in 0003" phrasing** — they are simply never
  created. Note for future sessions: references to "migration 0003" across the docs now mean this file.
- **Options considered:** **incremental `0003`** — preserves migration history and makes each change
  self-documenting via a visible DROP; rejected because the only environment those files were ever
  applied to is the abandoned INACTIVE project, so the history is fiction.

## D-87 — A careers-page checker replaces the ATS-polling design; deferred to v3, not built
**2026-08-05 16:10 IST**
Sakshi challenged the ATS approach: multiple ATS vendors each needing configuration is real work, and
an AI could just read a company's careers page instead. Tested empirically against four companies she
named, rather than reasoning about it.
- **Test results (4 companies):** **Lyzr AI** — clean success. **MakeMyTrip** — plain fetch timed out
  twice; worked only under real browser rendering. **Flam** — the listing is indexed by Instahyre/
  Naukri/Glassdoor but **404s on Flam's own site**. **Zigsaw** — a staffing consultancy, not a product
  company; the "PM roles" found belonged to an unrelated firm.
- **Design that emerged, cheapest check first:** (1) skip recruitment firms, detected via LinkedIn's own
  "Staffing and Recruiting" industry tag — cheaper and more reliable than an AI guess; (2) use a known
  ATS's public JSON API where one exists — **verified**: Greenhouse has a public, no-auth endpoint, and
  Lever/Ashby have equivalents, needing **no new infrastructure**, just the plain-`fetch` pattern this
  codebase already uses; (3) generic careers-page fetch + AI read otherwise, with "not found" a valid
  outcome; (4) **no browser rendering** — fetch failures are flagged "couldn't verify" rather than
  falling back, keeping the one genuinely new dependency out.
- **Not built.** The watchlist is empty and the pipeline has never run once; this would be a third layer
  on an unproven foundation — the same "build ahead of evidence" pattern this project has caught itself
  in repeatedly. Recorded in `scope.md` v3 so it need not be re-derived.
- **Corrects an over-broad claim made in-session:** "we don't need ATS at all" is too strong. Where a
  company *does* run on a known ATS, the structured API is strictly better than AI-reading HTML —
  cheaper, unambiguous, no staleness risk. The two approaches cover different, only partly overlapping
  cases; what is genuinely dead is the **manual per-company configuration** D-79 dropped.
- **Follow-up when picked up:** check how many of her real watchlist companies actually use a known ATS,
  and which, before building parsers — validate against her list rather than assuming market-share
  research generalizes.

## D-88 — job-scout's schema targets resume-builder's Supabase project (`xxfeagpjaxudhbihjruq`), not `cdjgxrmeoqiogylveagr`
**2026-08-06**
Before applying the still-unapplied `0001_schema.sql` (the master blocker since D-36), re-opened
`WORKSPACE.md` D-9's open "likely also consolidating onto one Supabase project" question rather than
apply schema to a project that might get abandoned during consolidation. Full reasoning and the
cross-module decision live in `WORKSPACE.md` D-9's 2026-08-06 amendment; recorded here so it's
visible to job-scout-only sessions per `WORKSPACE.md` D-8.
- **Decision:** `xxfeagpjaxudhbihjruq` (resume-builder's live project) is canonical. job-scout's
  `.env` now points there; `0001_schema.sql` is applied to it, not `cdjgxrmeoqiogylveagr`.
- **Why:** resume-builder's project already has 5 migrations, real data, and a live Vercel deploy
  quoted in recruiter-facing case-study docs; `cdjgxrmeoqiogylveagr` has never had any schema applied
  and backs nothing live. Moving the empty side is free; moving the live side risks breaking a
  product Sakshi actively shows recruiters, for no benefit. No table-name collisions between the two
  schemas.
- **D-36 amended:** the project it introduced (`cdjgxrmeoqiogylveagr`) is superseded as job-scout's
  target. Left alone, unused, free tier — a cleanup candidate later, not done here.
- **Scope:** database only. Does not execute the rest of `WORKSPACE.md` D-9 (repo unification, Vercel
  config, `app-os-contracts`) — that stays a separate future session.
- **Not yet resolved:** `SUPABASE_SERVICE_ROLE_KEY` for `xxfeagpjaxudhbihjruq` — resume-builder's own
  `.env.local` never needed one (RLS disabled, anon-key-only client), so this is a fresh key Sakshi
  must fetch from that project's dashboard before the fixture run can proceed.

**Blocked 2026-08-06, same session:** Sakshi confirmed she **cannot access `xxfeagpjaxudhbihjruq`**
in the Supabase dashboard at all — it does not appear under her current login. resume-builder's own
`docs/DECISION-LOG.md` (#122, 2026-07-02) records her opening that exact project's dashboard and
running SQL there, so access existed four weeks ago and has since been lost, most likely a different
Google/GitHub identity. **This is a live risk to resume-builder itself, not only to job-scout:** the
app keeps serving (runtime needs only URL + anon key) but nothing that requires the dashboard —
migrations, data inspection, key rotation, or **un-pausing after a free-tier auto-pause** — is
possible. Both "Hello Bump" projects have already auto-paused, so that scenario is demonstrated, not
theoretical. D-88's direction is unchanged; its execution is parked until access is recovered or
Sakshi chooses a different canonical project.

## D-89 — job-scout owns the all-jobs dashboard; the tracker does not
**2026-08-06**
Sakshi expected the post-discovery tracker (D-42) to show a browsable list of incoming jobs with
priority and filters. It does not, and would not: that data — tags (D-37), the verdict rule (D-62),
and every filter in `plans.md`'s v1 list — belongs to job-scout. The confusion is understandable
because `WORKSPACE.md` D-7 retired "dashboard" as a *module*, which left it unclear that the surface
still had to live somewhere.
- **Decision:** job-scout owns a v1 dashboard listing all discovered jobs. The tracker owns only
  post-decision state (application status, referral contacts, follow-ups). Two separate surfaces,
  split on the same line D-42 already drew.
- **Why:** D-7's reasoning for dropping `dashboard` as a module was that a dashboard is "a view onto
  a module's data, not a business capability" — which places the view *inside* the module owning the
  data, not nowhere. Until now job-scout had no UI at all; jobs were reachable only through Telegram
  (D-37, D-58), so there was no way to browse, filter, or revisit anything.
- **Options considered:** (a) put the job list in the tracker, as Sakshi first assumed — rejected:
  the tracker would have to duplicate `jobs`/`job_enrichments` or query across a module boundary,
  the exact coupling D-7 rejected `recommendation-engine` for; (b) no dashboard, stay Telegram-only —
  rejected: Sakshi asked for it directly, and a notification stream cannot be filtered, sorted, or
  re-read; (c) one shared dashboard spanning both modules — rejected: re-creates the retired
  `dashboard` module under a new name.
- **Layout decided by mock iteration** (LinkedIn/AmbitionBox split view, Sakshi's own reference):
  list left, detail right, panes scrolling independently. Two rejected attempts recorded so they are
  not retried — a sticky detail panel capping the JD at 300px (validated against the test fixture's
  two-sentence JD, so its cramping was invisible until realistic JD lengths were used), and a
  full-page detail replacing the list (lost the scan-to-next-job flow the split exists for).
- **Not yet resolved:** nothing can be built until the schema is applied to a reachable database —
  see D-88's blocked note.

## D-90 — User-facing labels are written for Sakshi, not lifted from column names
**2026-08-06**
The first dashboard mock labelled filters with the schema's own vocabulary. Reviewing them one by one
found some leaked implementation detail and one was conceptually wrong.
- **Decision — the rename table.** `priority` → **"Should I apply?"** (Yes / Maybe / Probably not) ·
  `domain` → **Industry** · `is_ai` → **AI focus** · `institute_requirement` → **IIT/IIM** ·
  `technical_depth` → **How technical** (Not very / Somewhat / Very) · geo confidence → **Location
  confirmed** · `background_match` → **unchanged**. Column names are untouched; this governs display
  only.
- **Why `background_match` is deliberately left alone:** it is **Sakshi's own word.** D-39 records
  that her real Notion board already had a field called "Background Match". Renaming a term the user
  coined would be the opposite of writing for her.
- **Why the verdict became a question, not a quality.** "Fit" was proposed and **rejected** — Sakshi
  identified that `background_match` already means "you should apply", so a second concept meaning the
  same thing collides with it. They stay separate because they **diverge exactly when a barrier
  bites**: strong background overlap on a role requiring IIT/IIM should still read "probably not".
  Background match is *evidence* (specific, plural, quotable — the outreach raw material D-39 built it
  for); the verdict is a *conclusion*. Phrasing it as a question makes that relationship legible.
  Keeping "Priority" was also rejected: **D-20 reserved priority/urgency for the timing concept**,
  which v1 does not compute, so using it here would spend a name v2 needs.
- **Why `technical_depth` gets plain buckets:** a 1–5 integer with no legend is undecodable at a
  glance. Session 7 separately found that this rubric was **invented during implementation and never
  logged as a decision** — this entry covers the UI treatment only and does not retroactively bless
  the underlying scale, which still needs its own review.
- **Options considered:** (a) show column names as-is — rejected: `is_ai` is not language; (b) rename
  the database columns to match — rejected: churns schema, code, and tests for a presentation
  problem, and D-28 forbids architecture changes without an evidence-driven reason.

## D-91 — v1 dashboard filter set: 7 visible, the rest behind "More filters"; `source` dropped entirely
**2026-08-06**
`plans.md` lists 14 v1 filters. Shown at once they wrap to three rows and push the jobs below the
fold, so they were split by how often each actually changes a decision *for Sakshi specifically*.
- **Visible (7):** Should I apply? · Industry · Posted · AI focus · IIT/IIM · Background match ·
  How technical.
- **Behind "More filters":** salary, location confirmed, business model, skills, company,
  chance-of-selection.
- **Why these seven:** chosen against Sakshi's real profile rather than generic PM defaults —
  **IIT/IIM** and **How technical** are on the visible list precisely because she is non-IIT/IIM and
  non-technical, the same two facts D-63 already used to turn `is_technical` from a positive signal
  into a downgrade. **Background match** is visible because D-39 makes it the raw material for
  outreach, which is where she spends the most time.
- **`source` is dropped entirely, not demoted.** D-34 makes LinkedIn the only discovery source, so
  the control has exactly one possible value — it would look like a filter and do nothing.
  Reinstated when Wellfound is added.
- **`remote_type` is reframed, not just moved.** D-37 established that everything reaching her is
  already remote-India-eligible, so filtering remote-vs-not matches every row. The useful cut is
  D-75's distinction between eligibility **stated** in the posting and eligibility **assumed** by the
  classifier (`geo_explicit`) — so the filter is "location confirmed", not "remote".
- **`priority` (now "Should I apply?") added as a filter** — not in `plans.md`'s documented list. It
  was added on instinct while mocking; flagged to Sakshi per `CLAUDE.md` rather than left in
  silently, and she confirmed keeping it.
- **"Posted" is a radio popover, not chips** (Any time / Past month / Past week / Past 24 hours) —
  the ranges are mutually exclusive, and chips would wrongly imply multi-select.
- **Caveat recorded deliberately:** at Sakshi's own estimate of 1–2 new matching postings per day,
  filters matter far less than they appear to. With eight jobs on screen she scans rather than
  filters; this set earns its keep past roughly 60 accumulated jobs. The **empty and low-volume
  states** therefore deserve more design attention than the filter bar, and currently have none.

## D-92 — OPEN: the dashboard needs a one-line "what this job is", which nothing currently produces
**2026-08-06**
Reviewing the first mock, Sakshi pointed out the cards did not say what any job actually *was*.
Verified against the code: `classify` outputs `remote_type`, `geo_explicit`, `is_technical`,
`technical_depth`, `is_ai`, `business_model`, `domain`, `background_match`, and
`institute_requirement` — every one a **classification about** the role, none describing what the
work involves. The gap is real, not a mock oversight.
- **Not decided — needs Sakshi's call.** Options: **(a) add `role_summary` to the existing `classify`
  call** — that call already sends the full `jd_clean` and already returns structured JSON, so this is
  extra output tokens on a request that is happening anyway, **not** a second API call; effectively
  free against D-5's $0 constraint (**recommended**). **(b) Render the first ~200 characters of
  `jd_clean`** — literally free, but JD openings are usually company boilerplate ("About Acme: we're
  a leading provider of…"), which would leave her opening every posting to find out what it is —
  the exact problem the field exists to solve.
- **Why this is logged rather than defaulted:** option (a) changes AI output volume, which
  `CLAUDE.md` classifies as a cost implication requiring a decision entry or Sakshi's sign-off before
  being written in as settled.
- Until resolved, the mock shows the line marked "proposed" so it is never mistaken for built.

## D-93 — Open-job pane is tiered by how fast Sakshi needs each thing; actions sit above the reading material
**2026-08-06**
Sakshi reframed the requirement mid-session: what she meant by "look like LinkedIn / all the details"
turned out to be *"better visual hierarchy and having things I find important on top"* — the opposite
problem from completeness. Designed against the real A1Apps JD she pasted rather than invented copy.
- **Decision — four tiers, in this order:** (1) identity; (2) **Should I apply?** — verdict, one-line
  why, blockers, and a contact-exists chip; (3) **act** — Apply · Shortlist · Tailor résumé · recruiter
  name/email/LinkedIn; (4) what the job is — role summary, chips, skills; (5) full JD.
- **Actions moved above the descriptive material after Sakshi asked "should this be on top?"** She was
  right: tier 1 delivers the decision within three lines, so making her scroll past summary, chips, and
  skills to reach Apply is backwards. Matches her own LinkedIn reference (title → key facts → Apply →
  detail below). Everything under the action row becomes optional reading.
- **Contact resolved as signal-vs-detail rather than top-vs-bottom.** Sakshi twice asked for recruiter
  email at the top. The reason it matters is not the address — it is that *whether a named human
  exists* is a *strategy fork* decided in the first seconds (reach out vs. cold application into a
  black hole). So the **signal** ("Named contact" / "No named contact") sits in tier 1 beside the
  verdict, and the **details** sit with the actions. Absence is rendered as meaningful text, not a
  blank — reusing D-41's principle that a null can be information.
- **Not-yet-built controls are shown, not hidden — reversing advice given earlier the same session.**
  The original recommendation ("no dead buttons, they erode trust") applied a generic principle whose
  premise — *a user who doesn't know why a control is inert* — is false here. Sakshi is the only user
  and knows exactly why; her framing: it reads as a fake door, and a fake-door test is meaningless when
  the only visitor already knows what is behind it. Controls appear unlabelled (no "Coming in V2"
  clutter); clicking one opens a short modal saying what it will do, which doubles as a spec note.
  **Researched at her request:** hover tooltips on disabled controls are the wrong mechanism (nobody
  hovers something inert; touch has no hover) — use `aria-disabled` rather than `disabled` so the
  control stays focusable and clickable, and prefer explanation-on-click over a hidden tooltip.
- **Options considered:** (a) contact block at the very top as first requested — rejected in favour of
  the signal/detail split, which serves the same need without pushing the verdict down; (b) actions at
  the bottom (the original mock) — rejected, forces scrolling past optional content after the decision
  is already made; (c) hide unbuilt controls entirely — rejected per above.
- **Layout note:** the split collapses to stacked below 640px. Verified at 1400px that side-by-side
  renders correctly; the stacking Sakshi saw was the preview pane being ~560px, where two columns
  would be ~270px each and genuinely unusable. Correct behaviour at that width, not a bug.

## D-94 — Years of experience is extracted and shown as an eligibility blocker, but does not change the verdict
**2026-08-06**
The real A1Apps posting Sakshi pasted asks for "3–6 years of experience in Product Management, Growth,
Analytics." Verified against the codebase: **nothing extracts seniority or years of experience** — zero
matches for `seniority`, `years_exp`, `yoe`. D-31 scoped v1 to entry-level titles, but that is enforced
on the **title only**, never on the JD body — so a posting titled "Associate Product Manager" that
demands 3–6 years passes the title filter and arrives looking eligible.
- **Decision:** extract it, surface it as an eligibility blocker row in the open-job pane, and make it
  filterable. **Do not let it feed D-62's verdict rule.**
- **Why not feed the verdict:** D-71 established that the rule needs hand-tagged validation against
  real jobs before it is trusted; adding a new input before that validation happens would change the
  thing being validated. Sakshi's call.
- **Options considered:** (a) extract and downgrade like IIT/IIM does — deferred, not rejected;
  revisit once D-71's validation pass has run; (b) leave it unextracted and rely on the title filter —
  rejected, the A1Apps posting is a live counterexample of the title filter passing an ineligible role.
- **Note:** this is an eligibility barrier of the same *class* as `institute_requirement` (D-57), which
  is a regex. Whether this one is regex or AI-extracted is an implementation question, unresolved.

## D-95 — "Tailor résumé" is a direct API call to resume-builder, not a copy-paste handoff
**2026-08-06**
Two weaker designs were proposed and both rejected by Sakshi before this one: "Copy JD + a link", then
"one button that copies and opens". Her question — *"why can't it directly be?"* — was correct, and the
stated blocker was wrong.
- **The blocker was not real.** The objection was "a real handoff needs `@app-os/contracts`" (D-10:
  not built). But contracts is a shared **types** package — a code-organisation convenience, not a
  requirement for two applications to communicate.
- **Verified against resume-builder's actual source:** `POST /api/triage` accepts `{ jd_text }` —
  exactly what job-scout already stores as `jd_clean` — and returns `{ application_id, jd_title,
  jd_company, verdict }`. `POST /api/tailor` then accepts `{ application_id }`.
- **Decision:** the button POSTs `jd_clean` to resume-builder's `/api/triage`, receives an
  `application_id`, and opens resume-builder directly on that application. No clipboard, no contracts
  package, no shared database.
- **This is a better direction than D-38 sketched, and amends it.** D-38 planned for job-scout to
  *fetch the active résumé* at run start. Sending the JD **to** resume-builder is cleaner: all résumé
  data stays inside the module that owns it, and job-scout never touches résumé text at all.
- **Module boundary:** an HTTP call is not "importing another module's code" (`WORKSPACE.md`
  integration rule) — it is a network boundary, arguably the cleanest form of module separation.
  Logged cross-module per `WORKSPACE.md` D-8.
- **Failure modes that must be handled:** `/api/triage` returns **400** when `evidence_bank` is empty
  ("No resume uploaded yet"), so the pane must show "upload your résumé first →" rather than a generic
  error. Verified that resume-builder's upload flow rebuilds `evidence_bank` in the same operation, so
  an uploaded résumé implies populated evidence.
- **Security posture recorded, not resolved:** resume-builder's endpoints have **no authentication**
  and RLS is disabled (`002_disable_rls_mvp.sql`, a deliberate single-user MVP shortcut). Anything that
  can reach the URL can call them, and that URL is deliberately public (quoted in recruiter-facing
  case-study docs). A shared-secret header was considered and **rejected as theatre**: resume-builder's
  own browser UI calls the same endpoints, so the secret would ship in client-side JavaScript. Real
  fixes are a login on resume-builder (a project, not a patch) or Vercel password protection (which
  would break the recruiter-facing URL that `WORKSPACE.md` D-9 protects). **Not decided** — Sakshi did
  not pick an option. Related: if junk records ever were created, cleaning them up needs the Supabase
  dashboard she currently cannot reach (D-88).

## D-96 — Canonical Supabase project reverts to job-tracker's original `gwvrpdkiblozwdwoqsgd`, superseding D-88 a second time; schema dropped and reapplied fresh, not migrated
**2026-08-06**
D-88's pick (`xxfeagpjaxudhbihjruq`, resume-builder's live project) was applied to `.env` and then found
completely unreachable — Sakshi confirmed directly ("I can't recover"). Re-checked what the Supabase MCP
connector could actually reach, live, rather than trusting the memory-file snapshot that said it "has
never seen either active project": that claim was stale. The connector reaches org "Hello Bump"
(`dnnaykjkbrtwjuzonnal`) with two `ACTIVE_HEALTHY` projects, one of which — `gwvrpdkiblozwdwoqsgd` — is
job-tracker's *original* project (D-14). Sakshi confirmed via the dashboard link that she still has
access to it (a "did I delete this?" worry turned out to be a false alarm).
- **Decision: `gwvrpdkiblozwdwoqsgd` is canonical.** `.env` repointed. Schema on it is **dropped and
  reapplied fresh**, not migrated incrementally.
- **Why drop instead of migrate:** the live table set there predates this session's schema work by a
  wide margin — it still has `resume_versions`, `job_tracking`, `decisions`, `status_history`, all four
  deliberately removed from the current `0001_schema.sql` (the first three moved to the tracker module
  per D-42; `resume_versions` belongs to resume-builder per D-38/D-46). The current schema also adds
  `remote_companies` and `job_feedback`, which don't exist there yet. All 16 existing tables are
  confirmed at 0 rows, so a full drop is zero data loss, and reconciling table-by-table would be more
  work than just reapplying the current file.
- **Alternatives considered:** (a) create a brand-new 4th project — checked cost directly via the
  Supabase MCP (`get_cost`, `get_organization`): $0/month, free plan, so not rejected on cost. Rejected
  anyway because it adds a fourth project ref to an already-confusing set of three, with no reachability
  or cost advantage over reusing a project already confirmed live and empty. (b) keep pursuing
  `cdjgxrmeoqiogylveagr` (job-tracker's dedicated project, D-36) — rejected for now: still invisible to
  this MCP connector, would require Sakshi to hand-paste every future migration into its SQL editor with
  no tool access for ongoing work.
- **Not resolved by this decision:** whether `cdjgxrmeoqiogylveagr` or `xxfeagpjaxudhbihjruq` get cleaned
  up or abandoned outright is still open — both are left alone, no cost, Sakshi's call later.
- Logged cross-module: `WORKSPACE.md` D-9 gets a second amendment for the same reason D-88's original
  pick did.
- **Executed 2026-08-06, with a correction to this entry's own premise.** The drop was approved on the
  stated basis that all 16 tables held 0 rows. That was wrong: `list_tables` reports Postgres's cached
  `n_live_tup` estimate, which reads 0 for any table written to since the last ANALYZE. An exact
  `count(*)` immediately before the drop found **`company_watchlist` = 11 rows** and **`app_config` = 3
  rows**. Inspected rather than proceeding: the 11 companies are precisely the seed set **D-32 already
  ordered deleted** on 2026-08-01 (all `created_at` 2026-07-09 21:40:49, 21s after the original 0001
  migration — the July seed run, untouched since), and the 3 config keys are `0002_lane_ready`
  artifacts (`active_goal`="ai_pm", `lane_rules`={}, `urgency_prefs`={}) from the migration this
  consolidated 0001 replaces per D-86. All discardable, so the drop proceeded — but on verified grounds,
  not the assumed ones. `active_goal`="ai_pm" was the only value with content and was deliberately **not
  carried over**: it belongs to the retired lane-ready design and has no key in the new schema.
- **Post-apply state, verified (see also D-97):** 14 tables + 4 views (`v_jobs_enriched`, `v_company_rollup`,
  `v_freshness`, `v_ai_cost`); `app_config` seeded with 2 keys; `job_tracking`/`decisions`/
  `status_history`/`resume_versions` confirmed absent (correct per D-42, D-38/D-46);
  `v_jobs_enriched` confirmed to project `remote_type` — Session 9's defect is fixed in the live
  database, not just the file. `npm run typecheck` clean.

## D-97 — `GEMINI_MODEL` moves to `gemini-3.6-flash`; a pinned version, not a `-latest` alias
**2026-08-06**
Forced by the first real end-to-end run: `gemini-2.5-flash` returned a hard 404 from Google —
*"no longer available to new users"* — so `classify` and `skills` failed on every job while the
non-AI stages (`salary` regex, `recommend` rule) succeeded. Not a code defect; the pinned model was
retired out from under the project.
- **Decision:** `GEMINI_MODEL=gemini-3.6-flash`. Sakshi's call from four verified options.
- **Verified before offering, not assumed:** listing the models the key can see was *not* sufficient —
  `gemini-2.5-flash` still appears in the models list but 404s on `generateContent`. Each candidate was
  tested with a real `generateContent` call: `gemini-3.6-flash`, `gemini-3.5-flash`, and
  `gemini-flash-lite-latest` all returned 200.
- **Options considered:** (a) `gemini-flash-latest` (alias) — rejected: it auto-follows Google's current
  model, which prevents this breakage recurring but silently changes classifier behaviour underneath a
  fixed `classifier_version`. That directly undermines D-71's premise that hand-tagged accuracy is
  comparable across runs; a pinned model failing loudly is better than an alias drifting quietly.
  (b) `gemini-flash-lite-latest` — rejected: higher free quota but weaker at the structured JSON the
  classify/skills stages demand. (c) `gemini-3.5-flash` — rejected: no advantage over 3.6.
- **Accepted cost of the choice:** 3.6-flash will eventually be retired the same way 2.5-flash was. The
  failure mode is loud (`StageFailed` rows with the provider's message), which is the tradeoff taken.
- **Note for the model-selection rule in `CLAUDE.md`:** this is the second vendor-model fact to go stale
  in-repo. Treat any pinned third-party model id as perishable.

## D-98 — RESOLVED: duplicates are hidden from the read model *and* never enriched
**Raised 2026-08-06 (Session 13) · resolved 2026-08-06 ~18:30 IST (Session 14)**
Found by the first live fixture run, not by reading code. Cross-source dedup **works** — the fixture's
deliberate near-duplicate pair (`ln-1001` "Product Manager, AI Platform" and `gh-2001` "Product Manager
AI Platform", same Acme AI role) was correctly grouped, with `gh-2001.canonical_job_id` pointing at
`ln-1001`. But `v_jobs_enriched` filters only on `dropped_reason is null` — it never filters
`canonical_job_id is null`, which `v_company_rollup` does correctly.
- **Consequence:** the all-jobs dashboard (D-89/D-93) would list the same job twice.
- **Worse, and the reason this is not a one-line view fix:** each duplicate is enriched **separately**,
  so it burns its own AI quota *and* lands a different verdict. Measured on this exact pair:
  `technical_depth` 3 vs 4, `institute_requirement` preferred vs none, skills 4 vs 2, and **`priority`
  med vs low** — two different answers for one job. That is a live, unprompted measurement of the
  classifier instability D-71's validation pass exists to quantify.
- **Decision (Sakshi, 2026-08-06): (a) and (b) together, not (c).** `v_jobs_enriched` gains
  `and j.canonical_job_id is null`, *and* enrichment skips non-canonical jobs entirely.
- **Why both rather than just the view:** filtering alone fixes only what you see. The duplicate would
  keep burning a second helping of AI quota on every run and keep storing a contradictory verdict that
  nothing reads. One job, one AI read, one answer.
- **Why not (c), "duplicates inherit the canonical verdict":** once the view is filtered, nothing reads
  a duplicate's enrichment — so the plumbing would buy nothing while bumping into D-6/D-9. The option
  was recorded as "likely right" when raised; reading the code changed that. Nothing *reads* through a
  duplicate, so nothing needs to be *written* to one.
- **The view was the outlier, not the pattern.** `v_company_rollup` (`0001_schema.sql:376`) and
  `services/notify/notify.ts:32` already filtered canonical correctly. Only the main read model didn't.
- **Implemented** in `supabase/migrations/0002_canonical_read_path.sql` and `lib/enrich/pipeline.ts`.
  The guard lives in `enrichJob`, not only in the pending query, because `recommend` reads
  `v_jobs_enriched` with `.single()` (`recommend.ts:89`) — without an explicit early return a manual
  `npm run enrich -- --job <duplicate-id>` would die on an opaque no-rows error four stages in, having
  already spent quota on the first three. It now returns `skipped: 'non_canonical'` and emits an
  `EnrichmentSkipped` event. The same guard covers `dropped_reason` jobs, which fail identically.
- **Verified live** on `gwvrpdkiblozwdwoqsgd`: `v_jobs_enriched` went 2 → 1 rows for the Acme AI pair,
  `remote_type` still projects, `v_company_rollup` unchanged, `npm run enrich -- --all` processed the
  canonical row only, and the duplicate skipped cleanly by job id.
- **The duplicate's four stale enrichment rows are deliberately left on disk** — supersede-never-
  overwrite (D-6/D-9), and they are the live sample of classifier disagreement (`priority` med vs low
  for one role) that D-71's validation pass exists to quantify. Unread, not deleted.

## D-99 — RESOLVED: completion is a recorded run outcome, not an inferred side effect
**Raised 2026-08-06 (Session 13) · resolved 2026-08-06 ~19:05 IST (Session 14)**
`lib/enrich/pipeline.ts:45-52` decides which jobs still need work by checking for an active `recommend`
row. `recommend` is a deterministic in-code rule (D-53/D-62/D-66) that succeeds regardless of whether
the AI stages did. In this run both jobs had `classify` and `skills` fail on the dead Gemini model, yet
`recommend` wrote a row — so `npm run enrich -- --all` reported `processed: 0` and the jobs looked
finished while holding **no classification at all**.
- **Consequence:** a provider outage silently produces jobs that are permanently unenriched and never
  retried. Recovery required naming each job id by hand. At v1's volume that is survivable; on a real
  daily feed it is a silent data-quality hole.
- **Decision (Sakshi, 2026-08-06): record what each run actually did.** A new `enrich_runs` table
  stores `ok_stages` / `failed_stages` per run, and a new `v_enrich_pending` view is the single
  authority on outstanding work. `enrichJob` already computed `{ok, failed}` and discarded it at
  `pipeline.ts:39` — this is where it now lands.
- **Why not the stage-list check** ("has an active row for every expected stage"), which this entry
  originally called the near-certain fix: it cannot distinguish *skipped on purpose* from *failed*.
  `runGeoRecheck` returns early without throwing when a job was never assumed-eligible
  (`geoRecheck.ts:31`), so on most jobs a correct pipeline legitimately produces four rows, not five.
  Confirmed live before choosing: both fixture jobs held exactly 4 of 5 stages, correctly. Recording
  the run instead makes a deliberate skip land in `ok_stages`, where it can never look like a failure.
- **Why a separate table, not columns on `jobs`:** 0001's governing principle is immutable source
  (`jobs`) vs. versioned AI output (`job_enrichments`). Run status is neither.
- **Retry budget — RESOLVED 2026-08-06 (Session 15) by D-101**, which raised the cap to 5 and, more
  importantly, made giving up *temporary and visible* rather than permanent and silent. The text below
  records the original state. Capped at 3 **consecutive**
  failures. A first attempt counted total runs ever; that was wrong and was caught by its own
  verification run — a job re-enriched legitimately (prompt-version bump, D-71 validation) would
  exhaust its budget while perfectly healthy, then refuse to retry the first time it actually broke.
  A clean run now resets the counter. The cap itself still needs a real call: a provider outage hits
  every job at once, so too low a cap could silence the whole feed after three failed cycles.
- **Verified live by reproducing the original outage**, not by inspection: forcing
  `GEMINI_MODEL=gemini-2.5-flash` produced `ok: [geo_recheck, salary, recommend]`,
  `failed: [classify, skills]` — `recommend` succeeding on a failed run, exactly the shape that caused
  this defect. The job reappeared in `v_enrich_pending` naming both failed stages, and the next plain
  `npm run enrich -- --all` healed it with **no manual job id**. Full trace: green → outage → green.
- **Also fixed in passing:** `enrichPending` previously ignored its own query error and returned
  `processed: 0`, which is indistinguishable from "nothing to do" — the same silent-success shape as
  the defect itself. It now throws. And `lib/config.ts:23` defaulted `GEMINI_MODEL` to
  `gemini-2.5-flash`, the model D-97 recorded as retired, so an unset env var would silently reinstate
  this exact outage; the fallback now matches D-97's pinned value.

## D-100 — Apify actor pinned to `curious_coder/linkedin-jobs-scraper`; `bebity` rejected on cost
**2026-08-06 ~18:50 IST**
`apify/task-config.md` listed two LinkedIn actors and said "pick one" — never an actual decision, and
one of the specific gaps `CLAUDE.md` was written to catch after D-30. Forced into the open by Sakshi
asking for the LinkedIn scraper link.
- **Decision: `curious_coder/linkedin-jobs-scraper`** (https://apify.com/curious_coder/linkedin-jobs-scraper).
  $1.00 / 1,000 results, pay-per-event, no platform-usage charge — Apify's free $5/month covers
  roughly 5,000 results, so the D-5 $0 constraint holds.
- **`bebity/linkedin-jobs-scraper` rejected: $29.99/month rental**, and Apify's free plan grants rented
  actors "Limited (trial only)". It was listed *first* in the setup doc with no cost noted anywhere.
  Checked live rather than assumed — both actors' pricing pages and Apify's own pricing page.
- **Accepted cost of the choice:** bebity's input schema (`title`, `location`, `companyName`, `rows`)
  is what `task-config.md` §2 was written against, so choosing the affordable actor meant rewriting
  that section. curious_coder is **URL-driven** — `urls` (LinkedIn search URLs), `count`,
  `splitByLocation` — and accepts none of those fields. The old instructions would have silently
  configured nothing.
- **The URLs are deliberately not written down in this repo yet.** An attempt to verify LinkedIn's
  filter parameters by loading a hand-built search URL redirected to an authwall — a wrong parameter
  therefore looks like "no results today", not like an error. The actor's own documentation says to
  *"copy the full URL from address bar"* after filtering in LinkedIn's UI, and `task-config.md` now
  says the same, marked unreviewed until Sakshi pastes real captured URLs.
- **Still not decided, and deliberately left marked so:** the schedule cadence (the other half of
  D-30). It now has direct cost implications — this actor bills per result, so cadence x cap sets the
  monthly spend against the free $5. `task-config.md` §3 carries an inline UNREVIEWED DEFAULT marker
  rather than restating the old "every 30–60 min" as if settled.
- **Note for the perishability rule in D-97:** third-party *pricing* is now the third such fact to be
  found stale or unstated in-repo, after the Gemini model and the Supabase project refs.

## D-101 — A job that gives up is visible, self-heals after a cooling-off period, and can be retried on demand — resolves D-99's UNREVIEWED retry budget
**2026-08-06 ~20:10 IST (Session 15)**
D-99 shipped a retry cap of 3 consecutive failures marked `<!-- UNREVIEWED DEFAULT -->`. Putting it to
Sakshi produced the question the design had no answer for: *"how would retry happen if AI is down and 5
is done?"*
- **The hole she found.** It wouldn't. A job hitting the cap drops out of `v_enrich_pending`
  permanently. The counter resets on a clean run, but a clean run can never happen because the job is
  no longer being selected — a closed loop. The only exit was a manual `--job <id>`, precisely the step
  D-99 was fixed to eliminate. A Gemini-style outage lasting more than the cap would park the entire
  feed and leave it parked *after the provider recovered*.
- **Decision (Sakshi): cap at 5, plus all three of** — (a) a `v_enrich_parked` view so an exhausted job
  is never silent; (b) automatic re-eligibility after a 24-hour cooling-off, so an outage self-heals
  with no action from her; (c) an on-demand retry from the dashboard for when she already knows the
  provider is back and does not want to wait out the cooling-off. She chose "why not both?" on (b)/(c).
- **Why the number is the least important part.** At 1–2 jobs/day the wasted quota is negligible at 3,
  5, or 10. What actually protects the feed is that giving up is *temporary and visible* rather than
  *permanent and silent* — which is how dead-letter queues work in practice (SQS parks the message for
  inspection; Sidekiq spreads ~25 retries over ~21 days rather than stopping). An earlier version of
  this recommendation argued "visibility is where the real protection is" and was **wrong**: visibility
  reports the failure, it does not recover from it.
- **Options considered:**
  - *Cap with no recovery path (what D-99 shipped)* — rejected: the closed loop above.
  - *Visibility only, manual button, no cooling-off* — rejected: recovery then depends on Sakshi
    noticing the parked list, and not noticing is exactly what silent failures are good at.
  - *No cap at all* — rejected: a permanently unparseable posting would re-burn AI quota every cycle
    forever, the cost D-99 added the cap to prevent.
  - *Outage-aware counting* (don't charge a failure when every job in the run failed the same stage —
    the circuit-breaker analogue) — **rejected on scale grounds, not complexity.** At 1–2 jobs/day
    "every job in this run failed" is usually "the one job in this run failed", which is
    indistinguishable from a genuinely broken posting. The detection is least reliable exactly at the
    volume it would run at. Logged in `backlog.md`; revisit only if volume makes it meaningful.
- **Amends D-99**, whose retry-budget bullet is now resolved.

## D-92 — RESOLVED: `role_summary` is produced by the existing `classify` call
**Raised 2026-08-06 (Session 14) · resolved 2026-08-06 ~19:55 IST (Session 15)**
- **Decision (Sakshi): option (a)** — add `role_summary` to the `classify` call, which already sends the
  full `jd_clean` and already returns structured JSON. Extra output tokens on a request that is
  happening anyway, not a second API call; effectively free against D-5's $0 constraint.
- **Why not option (b)** (render the first ~200 characters of `jd_clean`): literally free, but JD
  openings are usually company boilerplate ("About Acme: we're a leading provider of…"), so she would
  open every posting to find out what it is — the exact problem the field exists to solve.
- **Implementation note for whoever builds it:** the prompt must ask for *what the work is*, explicitly
  not a restatement of the company blurb, or option (a) reproduces option (b)'s failure through a more
  expensive route. `AIService`'s `.catch()` fallback for this field must be `null`, so "the model didn't
  answer" stays distinguishable from a real summary (the silent-masking problem flagged in Session 7).

## D-94 (amended) — years-of-experience is AI-extracted on the `classify` call, not regex
**Amended 2026-08-06 ~20:00 IST (Session 15)**
D-94 decided the field is extracted, surfaced as an eligibility blocker, and filterable, but left
"whether this one is regex or AI-extracted" explicitly unresolved.
- **Decision (Sakshi): AI**, riding the same `classify` call as D-92 — same cost argument, and it keeps
  both eligibility barriers consistent in how they are produced.
- **Why not regex, despite D-57 setting that precedent for `institute_requirement`:** the precedent does
  not transfer. "IIT/IIM" is a closed set of two literal strings; years-of-experience appears as
  "3–6 years", "3+ years", "minimum three years", "at least 3 yrs". A regex covering those is a
  maintenance surface that fails *silently*, and a missed extraction reads as **no experience
  requirement** — the permissive direction. That is the wrong way to fail for a signal whose whole
  purpose is warning her off ineligible roles.
- **Storage:** `years_experience_min` / `years_experience_max`, both nullable. "Not stated" is a common
  and real answer and must stay distinguishable from zero.

## D-102 — The first Apify run searches four titles, not five; the "Product Manager" search is company discovery and waits for its destination — amends D-31 for search scope only
> **AMENDED 2026-08-07 by D-108 and D-109.** Product Associate is dropped, each URL now gets its own
> run (D-108), and the broad "Product Manager" search has its destination — the `remote_companies`
> catalog, now built (D-109).
**2026-08-06 ~20:40 IST (Session 15)**
Sakshi challenged D-31's five-title list while preparing the first real discovery run: *"Product manager
would not be applicable."*
- **The challenge is half right, and the half that matters is different from the one stated.** Plain
  "Product Manager" is not automatically senior — at a small startup with no APM ladder it *is* the
  entry-level role. But her own A1Apps posting breaks title-as-seniority-proxy in the other direction
  too: titled **Associate** Product Manager, asking for **3–6 years**. Title is a weak instrument both
  ways, which is precisely why D-94 exists.
- **What actually settled it:** she gave her real reason — she wants the broad PM search *to harvest
  remote-friendly company names*, so she is alerted when an APM role later opens there. That is **D-35**,
  decided 2026-08-02, and its destination is the **remote-companies catalog** (D-44), deliberately
  separate from `company_watchlist`. It is a different job from the four title searches: those answer
  "what should I apply to", this answers "who hires remote from India".
- **Decision: the first run uses four titles** — Associate Product Manager, Product Associate, Junior
  Product Manager, Product Manager I. The broad PM search keeps its D-35 mandate and is deferred until
  the catalog can receive it.
- **Why deferred rather than dropped:** `remote_companies` exists in `0001_schema.sql` but its column
  list is the single remaining `<!-- UNREVIEWED DEFAULT -->` item in the schema, and the auto-add path
  from D-35 is unbuilt. Running it today would put companies into the *jobs* list as roles she cannot
  apply to — the "complicates things" she identified herself.
- **Options considered:** (a) keep all five now and let D-94's years-of-experience mark the ineligible
  ones — rejected: "Product Manager" is the highest-volume title and this actor bills per result, so it
  is the most expensive search, and its output would still land in the wrong place; (b) build the
  catalog first, then run all five — rejected for this run as it delays real data behind a schema
  sign-off and a new code path, when the first run's purpose is verifying field mappings.
- **Does not narrow D-31.** Plain "Product Manager" remains in scope as a title; this governs which
  searches the first run issues. Worth noting LinkedIn's keyword field leaks across title, description
  and skills (Session 5's real-world finding), so PM postings will arrive in the results anyway — giving
  a free sample to judge whether a dedicated search is worth paying for later.

## D-103 — RESOLVED: the salary-band filter is cleared; discovery does not filter on a number LinkedIn invented
**2026-08-06 ~21:40 IST (Session 16) · resolved 2026-08-07 (Session 18)**
Sakshi captured the four D-102 search URLs across three attempts. All four carry
`f_SAL=f_SA_id_225001:272001` — LinkedIn's salary-band filter. It appeared on two URLs in the first
batch and on **all four** in the second, without her adding it to the two that lacked it, which points
at LinkedIn carrying filters across searches within a session rather than a deliberate choice.
- **Not decided — needs Sakshi's call.** It is being flagged rather than silently stripped because
  `CLAUDE.md` puts scope-of-search choices with cost implications in this file, not in a setup doc.
- **Why the recommendation is to clear it:** LinkedIn's salary filter matches against **its own
  estimate** when a posting states no pay. This project deliberately refuses to act on estimated pay —
  D-12 made the salary stage parse-only, and D-73's principle (applied to salary in the three-way
  `salary_status`) exists so the parser's own failures stay countable. Filtering the *discovery* step
  on a number LinkedIn invented removes postings before anything can be measured about them, and the
  removal is invisible: a filtered-out job looks identical to a job that was never posted.
- **The argument for keeping it:** fewer results per run, and this actor bills per result (D-100), so
  it directly reduces spend against the free $5. That is a real benefit, not a token one — which is
  why it is a decision rather than a bug.
- **Options considered:** (a) strip it silently while fixing the other URL problems — rejected, it is
  a scope change to what discovery sees and would be exactly the "written in as settled without being
  decided" failure D-30 logged; (b) keep it and note it in `apify/task-config.md` — rejected for the
  same reason, a setup doc is not where a choice gets made for the first time.
- **Blocks nothing on its own.** The four URLs are blocked on the missing Remote and location filters
  regardless; this rides along with the re-capture.

**Resolution — 2026-08-07 ~00:10 IST (Session 18). Sakshi's call: clear it.** She took the recommendation. The
four URLs re-captured this session carry no `f_SAL`; spend is controlled instead by the actor's own
`count` cap, which is a number this project sets rather than a threshold LinkedIn guesses.

Two things learned in the re-capture that change how this decision has to be maintained:

- **The salary filter's absence is not self-sustaining.** A fresh browser session did not inherit
  `f_SAL`, which is why the re-captured URLs are clean — not because it was actively removed. The
  Session 16 observation stands: LinkedIn carries filters across searches *within* a session. So any
  future re-capture must **check for `f_SAL` explicitly**; a clean URL today is evidence about this
  session, not a property of the search.
- **The cost argument for keeping it turned out to be aimed at the wrong target.** The real spend
  concentration is not stated-pay filtering — it is the "Product Associate" search returning 500+
  results against ~55 for each of the other three, mostly non-PM roles pulled in by LinkedIn's keyword
  leak. Whatever this project does about per-result cost, that is where it should act, and it can be
  done without discarding postings for having no stated salary. Recorded in `apify/task-config.md`
  and carried into D-30.

## D-104 — the ingest pre-filter's false-positive rate is 50% on its first real sample
> **RESOLVED 2026-08-07 (Session 19).** Option (d) chosen: the pre-filter no longer reads the JD at
> all and is off by default; `classify.remote_type` is the verdict. See the D-104 resolution entry at
> the end of this file (Session 19). All 7 historical drops were cleared.
**2026-08-07 ~00:50 IST (Session 18)**
The first real Apify run (50 postings) gave `isObviouslyNonRemote` (`lib/discovery/normalize.ts:31-35`)
its first-ever measurement. It dropped 6 of 50. **Three of those 6 are wrong:**

| Company | Text that matched | Verdict |
|---|---|---|
| Axestrack | "Location: Jaipur (In-office)" | correct |
| CargoEZ | "hybrid model that combines on-site work with some work-from-home flexibility" | correct |
| EZSpace Ventures | "Hybrid work setup with Bengaluru HQ" | correct |
| **Merck Group** | "Very Good skills in **Office** 365 tools" | **false positive** |
| **Franklin Templeton** | "**Onsite** fitness center, recreation center, and cafeteria" | **false positive** |
| **American Express** | "Flexible working model with hybrid, onsite **or virtual** arrangements" | **false positive** |

- **This is D-72 working exactly as designed.** Dropped postings are persisted with a reason instead
  of being discarded, which is the only reason this rate is measurable at all. Nothing is lost — the
  rows are in the database, they are merely excluded from enrichment. D-72 was decided on the
  argument that the pre-filter's own error rate should be auditable; this is the first time that
  argument has paid out, and it immediately found a 50% error rate.
- **The three failures are three different problems, which is why there is no one-line fix.**
  Merck is a pure token collision — `in office` matching "in Office 365"; note that adding a word
  boundary does **not** fix it, since "office" is followed by a space either way. Franklin Templeton
  matched a *perk* ("onsite fitness center"), not a work arrangement. American Express matched a
  benefits-boilerplate sentence that actually lists remote as an option ("or virtual").
- **Not fixed this session, deliberately.** Tuning this regex changes which postings reach the AI
  stages, and per D-105 those stages are now the project's scarcest resource — so this is a
  scope-and-cost decision, not a patch. Flagged per `CLAUDE.md` rather than silently adjusted.
- **Options to consider:** (a) restrict matching to the first N characters of the JD, where the work
  arrangement is stated, and away from the benefits section where these three all live; (b) drop the
  bare `in office` variant and keep only hyphenated `in-office`, which kills Merck but not the other
  two; (c) require the marker to sit near a work-arrangement word (`work`, `role`, `position`);
  (d) let the AI `geo_recheck` stage own this entirely and reduce the regex to a cost-saving
  pre-filter that only drops the unambiguous cases. Recommendation is (c) or (d); both need Sakshi.
- **Do not read the 6 as the whole story.** These are false positives (dropped but shouldn't be).
  The false *negatives* — non-remote jobs the filter let through — are not measured by this and
  would need a separate read of the 44 that were kept.

## D-105 — the real throughput ceiling is the AI provider's free-tier daily quota, not Apify cost
> **AMENDED 2026-08-07 by D-107.** The "daily quota" diagnosis here is wrong: the AI Studio
> dashboard shows the burst recovering to 100% *the same day*, so this was a per-minute rate/token
> throttle, amplified ~4x by a retry path that treated 429 like a transient 5xx. Everything below
> about enrichment being the scarce resource still holds; the *cause* and the *fix* changed.
**2026-08-07 ~01:00 IST (Session 18)**
The first real end-to-end run produced a number that reframes D-30 and several assumptions built on
top of it. **Discovery is cheap; enrichment is the scarce resource, by roughly two orders of magnitude.**

- **Measured Apify cost: $0.05 for 50 postings, 55.6 seconds**, against the $5/month free plan. Also
  settled: `count` is a **total across all URLs**, not per-URL — the actor's schema does not say which,
  and this run answered it.
- **Measured AI ceiling: 19 successful Gemini calls in a day, then hard 429s.** `npm run dispatch`
  processed all 44 enrichable jobs; `classify` failed on 39 and `skills` on 40, every one of them
  `gemini 429: You exceeded your current quota`. At roughly 2 AI calls per job, the free tier supports
  on the order of **10 jobs enriched per day** — while a *single* 50-result Apify run at 5 cents
  delivers 44 of them.
- **What this means for D-30.** Cadence has been framed as "how often can we afford to scrape". That
  is the wrong question: at $0.05 per 50 results, the $5 plan buys ~5,000 postings a month, far more
  than can ever be enriched. The binding constraint is the AI daily quota, and cadence should be
  sized to it — otherwise every run just deepens a backlog that drains at ~10/day.
- **This does not break anything, and that is worth stating.** D-99's fix behaved correctly under
  real load: all 39 jobs recorded `failed_stages: {classify,skills}`, stayed out of "complete", and
  went straight back into `v_enrich_pending` (40 pending, 0 parked). Before D-99 these would have
  been silently marked done holding no classification. The quota wall is a capacity problem, not a
  correctness one.
- **Options to consider:** (a) size cadence and result caps to ~10 enrichable jobs/day and accept
  slower coverage; (b) configure one of the already-scaffolded fallback providers — `CEREBRAS_API_KEY`
  and `GROK_API_KEY` exist in `.env` and are **both empty**, and `AI_PROVIDER_CLASSIFY` /
  `AI_PROVIDER_SKILLS` exist precisely to route per-stage; (c) cut AI calls per job (merge `skills`
  into the `classify` call, roughly halving consumption); (d) pay for quota — rejected on sight
  against D-5's $0 constraint unless Sakshi reopens it. Recommendation: (b) then (c); both preserve $0.
- **Open, not decided.** It has cost and vendor implications, which `CLAUDE.md` puts here.

## D-106 — RESOLVED (defect): notify recorded a permanent "sent" guard for messages it never sent
**2026-08-07 ~01:10 IST (Session 18)**
`sendTelegram` (`lib/telegram.ts:17-18`) returns `false` — it does not throw — when Telegram is
unconfigured. `notifyNew` discarded that return value, incremented `sent`, and wrote a
`NotificationSent` event. That event is the permanent idempotency guard from D-16, so each affected
job was marked delivered forever while nothing was actually sent.
- **Real, if small, data loss.** `npm run dispatch` reported `sent: 2` with no bot token configured.
  Two jobs were burned: **Esther Adorned — Product Manager** (a real posting from this run) and
  **Acme AI** (a fixture, harmless). Once Telegram is configured, the real one would silently never
  arrive, and nothing anywhere would indicate why.
- **This is D-99's mistake in a second code path** — treating an inferred outcome as a recorded one.
  D-99 was fixed in the enrich pipeline; the same bug was sitting in notify untouched, which is worth
  noting as a pattern rather than a one-off.
- **Fixed** (`services/notify/notify.ts`): the guard event is written only when `sendTelegram`
  actually returns true; otherwise the job stays a candidate and is retried once Telegram works.
- **Cleanup still outstanding — needs Sakshi's go-ahead**, since it deletes rows from real data:
  the two stale `NotificationSent` events must be removed or those jobs stay permanently suppressed.
  `delete from job_events where type='NotificationSent' and created_at < '2026-08-07';`

---

# Session 19 (2026-08-07) — quota diagnosis, filter handover to AI, catalog built

> All entries below share the timestamp **2026-08-07 ~15:30 IST** (single working session).

## D-107 — The 429s were a burst-rate throttle, not a daily quota; the fix is spacing + real backoff — amends D-105
> **SUPERSEDED ON DIAGNOSIS by D-111 (2026-08-07, evening).** Verified against a live run and the API
> returned `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20` — it *is* a
> daily quota, and D-105's original reading was right. The throttle/backoff code built here is kept
> (it is correct behaviour), but it does not solve the binding constraint. The fallback-provider
> premise recorded below is also corrected by **D-113**. Read D-111 before acting on this entry.
D-105 read "19 successful calls, then hard 429s" as the free tier's **daily** ceiling (RPD) and
recommended a fallback provider or a second account. Checking Sakshi's own Google AI Studio usage
dashboard reversed that diagnosis.
- **What the dashboard shows:** ~400 requests in one tight burst (Aug 5–6), success rate collapsing
  to ~0% during it, then **recovering to 100% later the same day** — not after a midnight-Pacific
  reset. A hard RPD cap stays at 0% until the next day. Recovery within the same day is the signature
  of a per-minute rate/token throttle clearing once the burst subsides.
- **The ~400 confirms the mechanism.** 44 jobs x 2 calls = 88 base calls. `callGemini` wrapped every
  call in `pRetry { retries: 3, minTimeout: 800 }` and treated a 429 exactly like a transient 5xx —
  800ms cannot clear a per-minute window, so each rejection was re-fired almost immediately.
  88 x up-to-4 attempts ≈ 352, close to the observed ~400. **The retry logic was amplifying the
  limit it hit rather than backing off from it.**
- **Decision:** two changes, both provider-agnostic. (1) `lib/ai/throttle.ts` — a single
  process-wide gate every AI call passes through, enforcing `AI_CALL_SPACING_MS` (default 4s)
  between consecutive calls. (2) `lib/ai/provider.ts` — 429 becomes its own error class with its own
  long backoff (`AI_RATE_LIMIT_BACKOFF_MS`, default 65s), honouring the provider's `Retry-After`
  header when present; 5xx keeps the short retry; other 4xx still aborts immediately.
- **Why a module-level gate rather than a sleep in each caller:** the enrich loop is already
  sequential — the burst came from *no gap*, not from parallelism. A single choke point in
  `AIService.callProvider` means a fourth AI stage added later cannot reintroduce the burst by
  forgetting to sleep.
- **Options considered:** (a) **a second free-tier account of the same provider** — rejected as the
  first move: it addresses a *daily* cap the evidence says isn't the problem, and separately sits in
  ToS-gray territory (no provider's terms clearly permit or forbid one person holding multiple
  free-tier accounts; Cerebras's "no disproportionate load" clause is the nearest live concern).
  Sakshi accepted the gray area as reasonable for an MVP, so this stays available — but unnecessary.
  (b) **a genuinely different fallback provider** (Cerebras/Grok, already scaffolded) — the pattern
  real companies use, kept as the fallback if throttling proves insufficient, not spent up front.
  (c) **merging `skills` into `classify`** to halve call volume — still available, deferred.
  (d) **paying for a higher tier** — rejected against D-5's $0 constraint.
- **Scoped out as disproportionate at this project's volume** (single user, ~50 jobs/run, one
  sequential run): concurrency caps (nothing to cap), a circuit breaker (optional, cheap, not
  required), per-request queueing infrastructure.
- **Not yet verified against a real run** — quota had not reset by end of session. See next steps.

## D-108 — Product Associate is dropped and each search URL gets its own run — amends D-102
The first real run's result split was the finding, not its price: `count` is a **total across all
URLs**, so a combined run lets the highest-volume search consume the cap. *Product Associate* took
28 of 50 while *Associate Product Manager* — arguably the most on-target title — got **2**.
- **Decision:** (1) drop the *Product Associate* search entirely; (2) run every remaining URL as its
  own Apify run with its own `count`, never one run with four `urls`.
- **Why drop rather than keep and re-weight:** Sakshi's reasoning — very few companies actually use
  "Product Associate" as a real job title, so its 500+ volume is keyword leak, not opportunity. Its
  own top results at capture were *Consultant*, *Market Research Analyst*, *Product Analyst*,
  *Project coordinator*.
- **Cost:** ~4x one run (~$0.05 → ~$0.20), irrelevant against the $5/month plan and explicitly not
  the constraint per D-105.
- **Options considered:** (a) separate runs but keep Product Associate — rejected: still pays per
  result for a title that yields non-PM roles; (b) keep the combined run and raise `count` —
  rejected: does not change the *ratio*, it just buys more Product Associate; (c) drop it without
  splitting the runs — rejected: the three remaining titles would still compete for one budget.

## D-109 — One broad "Product Manager" search feeds the company catalog; `remote_companies`' columns are signed off — resolves D-44, revisits D-35
D-44 (Session 8) decided the catalog table should exist but left its columns unresolved; they have
carried an `UNREVIEWED DEFAULT` marker in `0001_schema.sql` ever since. Reviewed with Sakshi and
settled, together with how it gets populated.
- **Schema (migration `0004_remote_companies_catalog.sql`, applied):** add `last_confirmed_at`
  alongside `added_at`. `added_at` answers "when did I first learn this company hires remote";
  `last_confirmed_at` answers "are they still doing it", which is what the dashboard's
  actively-hiring filter needs. **A timestamp rather than a boolean flag on purpose** — a stored
  flag goes stale silently, a timestamp cannot. Evidence stays single-valued (most recent
  confirmation); a multi-evidence child table was considered and rejected as more structure than a
  "which companies hire remote" catalog needs.
- **Population:** automatic from ingest, no manual confirmation step — D-44's own reasoning is that a
  real live posting *is* the evidence (D-32's bar). Runs for duplicate postings too: within a fresh
  run, seeing a posting again means it is still live, which is exactly what `last_confirmed_at` is
  for. Dropped-as-on-site postings are excluded — they are evidence of the opposite.
  `confirmRemoteCompany` never throws: the catalog is a by-product of ingest, and a failure there
  must not cost a real job posting its insert.
- **The broad search is reinstated, narrower than D-35 proposed:** **one** plain-keyword
  "Product Manager" search, catalog-only. A company posting solely a Lead/Principal/Director role
  never appears in the three junior-title searches, so its remote-friendliness is invisible today.
  LinkedIn matches "Product Manager" inside "Lead Product Manager", so one search covers the whole
  seniority range — four senior-title tasks are unnecessary.
- **Measured live, signed in, before deciding:** plain PM **72**, Lead PM **53**, Principal PM **57**,
  Director PM **64** — all genuinely remote-tagged. **The first pass at these numbers was wrong and
  nearly drove the decision:** read from a logged-out session they showed 1,000+/1,000+/740/870,
  because the public search page does not honour `f_WT=2` at all. Sakshi offering her signed-in
  session is what surfaced it. Recorded in `apify/task-config.md` as a standing warning.
- **Visibility:** its own tab in the future dashboard (job-scout owns it per D-89), not mixed into
  the job list — different data, browsed differently. Two filters required: actively-hiring
  (derived from `last_confirmed_at`) and watchlist-membership (cross-check `company_watchlist`).
  Not built; the requirement is recorded so the dashboard build starts from it.
- **Backfilled, not left for the next scrape:** `npm run backfill:remote-companies` populated
  **50 companies** from postings already in `jobs`.

## D-110 — Dashboard: Next.js on Vercel, querying Supabase directly with tightly-scoped RLS — unblocks the RLS item
> **See D-115 (2026-08-07, evening).** The safety condition stated below is violated by the obvious
> implementation: `v_jobs_enriched` carries `recruiter_email`/`recruiter_linkedin`/`hiring_manager`, so
> granting `anon` SELECT on it would publish recruiters' personal contact details. A narrower
> `v_jobs_public` is required before any anon grant.
The dashboard's *design* was settled (D-89/D-91); its technical shape was not, and RLS was blocked
behind it because how the browser reaches the data determines what RLS has to defend.
- **Decision:** a Next.js web app on Vercel (confirms D-4's hosting choice), querying Supabase
  **directly from the browser** via the public anon key, protected by RLS. No server layer.
- **Why, with the counter-argument stated plainly:** a server layer is what real companies default
  to — the database is never reachable from outside, and RLS is a second line of defence rather than
  the only one. Public anon key + RLS is the prototype pattern, and this dashboard will be shown to
  other people, which argued for the heavier option. What decided it: Sakshi asked why build effort
  should weigh on her when Claude implements either way, which is fair — so the real costs are the
  ones that *don't* transfer. Those are her ability to explain the architecture, and every extra
  layer being more surface to review and more that can break on her. At this scale, direct + tight
  RLS is defensible.
- **The condition that makes it safe rather than merely convenient:** RLS must grant read-only
  access to *only* the public job-listing surface. Application status, referral contacts, personal
  notes and any future user data must be unreachable by the anon key — not merely un-queried. The
  anon key is visible in the shipped site's source by design, so a permissive policy is a live
  data-exposure risk, not a theoretical one.
- **Options considered:** (a) thin server layer / API routes — the company-standard pattern and the
  stronger portfolio signal; not chosen, but the honest recommendation if the bar were production;
  (b) no dashboard, stay Telegram-only — long since rejected (D-89).
- **Not built.** This unblocks RLS design; both remain ahead.
- **Reaffirmed 2026-08-07 (Session 21), not reopened.** Claude re-proposed the rejected option (a)
  server layer as a fresh recommendation without labelling it as a proposal to overturn this entry;
  Sakshi caught it (*"but didn't we decide browser reads...i am confused"*). D-115 adds a
  prerequisite (`v_jobs_public`); it does not change the shape decided here.
  Browser-reads-Supabase-directly stands.

## D-104 — RESOLVED: the remote pre-filter stops reading the JD; the AI owns the verdict
Logged OPEN in Session 18 at a measured 50% false-positive rate. Sakshi chose option (d): hand the
judgement to the AI, keep the keyword filter only for what cannot be misread.
- **Resolution as built — the pre-filter is off by default.** `INGEST_REMOTE_FILTER` now defaults to
  `off`, so nothing is dropped at ingest and **`classify.remote_type`** is the verdict, with
  `geo_recheck` (D-75) as the second pass on assumed-eligible cases. `isObviouslyNonRemote` survives
  behind the flag, reduced to the structured `location` tag only — LinkedIn's own work-arrangement
  field rather than prose — for re-enabling if AI volume ever needs cutting.
- **A narrower regex was written first, then removed, and that is the point.** The first attempt kept
  a JD scan but required the marker to sit near a work-arrangement noun. It passed all three known
  false positives and still failed on Amex once re-checked against the real row: *"flexible working
  model with hybrid, onsite or virtual arrangements"* trips any "on-site near a work word" rule.
  Sakshi's correction — "we decided no regex but use AI" — was right; the proximity version was
  option (3) creep wearing option (4)'s label, patching three known postings while waiting to be
  wrong on a fourth. **Every one of the original false positives came from prose**, which is why
  prose is now out of scope for the filter entirely rather than parsed more cleverly.
- **One real gap found while investigating:** `"virtual"` was missing from the remote-signal
  vocabulary. It is standard JD language for remote, and its absence is what left Amex's on-site
  marker unopposed. Added — and this list only ever makes the filter *more* permissive, so a loose
  match there fails in the safe direction.
- **Accepted cost:** postings previously dropped for free now cost AI calls. Sakshi's condition:
  **watch call volume over the next 3 runs** rather than assume it is harmless, given D-105/D-107.
- **Historical rows corrected:** `npm run backfill:remote-companies` re-evaluated all 7 drops under
  the current policy and cleared every one, each with a `JobUndropped` audit event — D-72's
  persist-with-a-reason design is what made both the error rate and this correction possible.
  Pending enrichment went 40 → 47.

## D-111 — AMENDS D-107: the 429s are a per-day quota of 20, not a burst throttle (2026-08-07, evening)
D-107 was verified against a live run and **failed**. It is superseded on diagnosis; its code is kept.
- **Evidence, read directly off the API** rather than inferred from a dashboard:
  `"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"`, `"quotaValue": "20"`, on
  `gemini-3.6-flash`. A **daily** cap of 20 requests. **D-105's original reading was correct.**
- **Why D-107 got it wrong, and it was a reasonable mistake.** The same 429 body carries
  `"Please retry in 46.855s"` and `retryDelay: "46s"`. Timing alone reads exactly like a clearing
  per-minute window; only the `quotaId` distinguishes the two. Session 19's recovery-to-100% evidence
  is still unexplained but is no longer load-bearing — a direct probe outranks an inferred pattern.
- **The compounding failure: our own logging discarded the answer.** `provider.ts`'s `onFailedAttempt`
  printed `rate limited (attempt N)` and dropped `error.message`, where `quotaId` lives. The
  distinguishing evidence was present in every single 429 for two sessions and was thrown away. Fixing
  that log line is now part of the work.
- **No escape inside the Gemini free tier:** `gemini-2.0-flash` returns `limit: 0` (no longer
  free-tier eligible); `gemini-2.5-flash` and `-lite` return 404 (retired). `gemini-3.6-flash` at
  20/day is the only option, and it is already the configured model.
- **Options considered:** (a) **stay on the free tier and drain the backlog over ~5 days** — chosen;
  ~2.5 AI calls/job measured (38 calls → 15 jobs) means 20/day sustains ~8 new jobs/day, and all 53
  jobs arrived in a single ingest so the backlog is one-time. Rejected: (b) pay for Gemini — removes
  the ceiling but breaks the $0 constraint the portfolio framing rests on, and the constraint may not
  even bind at steady state; (c) switch provider — premature, see D-113; (d) reduce calls per job —
  cannot close a 5x gap, since even a perfect 1-call pipeline caps at 20 jobs/day.
- **What makes waiting the right call rather than the lazy one:** `processed_runs` holds **1 row** —
  every job arrived 2026-08-06. Steady-state arrival rate is genuinely unknown, and the 5 draining
  days produce exactly that measurement. Committing to a provider now spends the decision before the
  evidence exists.

## D-112 — `recommend` must not emit a verdict without its inputs; "not evaluated" is explicit in the read model (2026-08-07, evening)
Found by following up Sakshi's objection that all 47 jobs had been populated — which was true, and
which the quota theory alone could not explain. **The quota was the cause; this is the harm.**
- **The defect.** `recommend` (D-53, deterministic) reads `v_jobs_enriched`. With no `classify` row it
  sees `background_match = []` and `is_ai = null` — **byte-identical to a job genuinely judged to have
  no matching signals** — and falls through to `priority = 'low'`, empty reasons,
  `needs_review = false`. **33 of 48 jobs were silently ranked `low` because the AI never ran on
  them.** Of the 15 actually classified, 5 came out `med`, so the false-lows are burying real
  candidates. `enrich_runs` recorded `failed_stages = {classify,skills}` on **42 runs** and ran
  `recommend` anyway: `pipeline.ts` records a stage failure and continues with no precondition.
- **This is the third instance of a principle already named twice here** — D-73 (`remote_type`), then
  `salary_status`, where a single `'unknown'` collapsed "not stated" with "parser failed" and *"made
  the parser's own failure rate unmeasurable."* Same collapse, third site. Cross-checked against
  industry practice: credit bureaus never score a thin file as *low*; they emit a distinct
  **unscorable** outcome, because low means "we looked and it's bad" while unscorable means "we
  couldn't look."
- **Decision, two parts.** (1) `runRecommend` gains a precondition: no active `classify` row ⇒ write no
  `recommend` row, emit `StageSkipped`, return. `computeRecommendation` stays **pure and unchanged** —
  it was correct given real inputs; the defect was calling it with absent ones. (2) The read model
  states the absence explicitly: `v_jobs_enriched` gains `classify_status`
  (`'evaluated'`/`'not_evaluated'`) and `priority` becomes `coalesce(rec.priority, 'unknown')`.
- **Why `unknown` is read-model-only, never stored.** `job_enrichments` carries
  `CHECK (priority = ANY ('high','med','low'))`. Keeping `unknown` out of storage means we neither
  relax the constraint that keeps stored verdicts honest, nor write a fake verdict row. Storage says
  "no verdict exists"; the view says "unknown". `Priority` stays `high|med|low` for the computed
  verdict so the rule provably cannot return `unknown`; a separate `PriorityView` serves readers.
- **Options considered:** (a) skip the row only — rejected on Sakshi's objection that it renders as a
  *blank* card, which is ambiguous with "evaluated, found nothing" and reproduces the bug in a quieter
  costume; (b) a `not_evaluated` sentinel in every enum (`is_ai`, `remote_type`, `is_technical`,
  `business_model`, `institute_requirement`, `priority`) — rejected as encoding one fact in eight
  places that can drift apart, plus a type change across every consumer; (c) **both a row-level status
  label and an explicit `unknown` priority — chosen by Sakshi**, as insurance against future sorting
  or filtering logic mishandling an empty value.
- **Verified as already correct, needing no change:** `v_enrich_pending` reports **38 pending, 0
  parked**, so every unclassified job is already queued and self-heals — D-99 had already removed the
  "does a recommend row exist?" completion check for this exact reason. And `notify.ts` filters
  `.in('priority', ['high','med'])` (D-65), so no bad notifications went out. **The sting:** that
  filter is *why* this stayed invisible for two sessions — the system was quiet because it was broken,
  and quiet is also what healthy looks like.
- **IMPLEMENTED 2026-08-07 (Session 21)**, exactly as decided, no amendment. `lib/enrich/recommend.ts`
  carries the precondition (`computeRecommendation` untouched); `StageSkipped` added to
  `lib/events.ts`; migration `0005_not_evaluated_read_model.sql` superseded the 33 rows and added
  `classify_status` + `coalesce(rec.priority,'unknown')`; `lib/types.ts` splits `Priority` (written)
  from `PriorityView` (read). Post-apply state: 0 recommend rows without a classify row, 38
  `unknown` = 38 `not_evaluated`, 5 notifiable, 9 genuine `low`, `v_enrich_pending` unchanged at 38.

## D-113 — CORRECTS D-107's fallback-provider premise: neither reserve option is a standing $0 path (2026-08-07, evening)
D-107 deliberately kept "a second account and a fallback provider" unspent, in reserve. Checked
against the providers' own docs, that reserve is thinner than recorded.
- **Cerebras** free tier is 5 RPM / 30K TPM / 1M TPD per model — ample volume for 38 jobs (~20
  minutes). But the official docs state free credits are **$5, granted only after adding a verified
  payment method, expiring 30 days after issue**. That is a trial, not a standing free tier, and it
  requires a card. Third-party aggregator sites claiming "14,400 requests/day, no credit card" are
  contradicted by the vendor's own documentation; the docs win.
- **The configured Cerebras model is not free-tier eligible.** `lib/config.ts` defaults to
  `llama-3.3-70b`; the free-tier list is `gpt-oss-120b`, `zai-glm-4.7`, `gemma-4-31b`. This is the
  **same trap as the gemini-2.5-flash retirement (D-97)** — a pinned model that quietly stops being
  valid — at a second provider.
- **"Groq" and "Grok" appear to have been conflated.** `lib/ai/grok.ts` points at `api.x.ai` — xAI's
  **Grok**, which is paid. **Groq** (the free LLaMA host) is a different company and is not wired up
  at all. D-107's note says "Groq/Cerebras"; which was meant needs Sakshi's call.
- **Both `CEREBRAS_API_KEY` and `GROK_API_KEY` are empty.** There is no working fallback today, so
  "kept in reserve" overstates readiness. Nothing is broken by this — D-111 chose to stay on Gemini
  regardless — but the record should not imply a switch is a config change away.

## D-114 — Execute D-7's rename: this module is `job-scout`; `job-tracker` is a separate unbuilt module (2026-08-07, evening)
> **EXECUTED 2026-08-07, end of Session 20.** Folder is now `ApplicationOS/job-scout`; `package.json`
> is `remote-pm-job-scout`; memory copied to the `-job-scout` project key (20 files, old copy retained
> pending verification); git repo and both worktrees healthy. **One gotcha for the record:**
> `git worktree repair` with no arguments fixed only the *main* worktree — the nested worktree at
> `.claude/worktrees/sad-booth-957bb2` stayed registered under the old path and was flagged
> `prunable`, which would have dropped it (with its uncommitted change) on the next prune. Fixed by
> passing the path explicitly: `git worktree repair .claude/worktrees/<name>`. **Still outstanding:**
> docs describing the system as it is now (`WORKSPACE.md`, `architecture.html`, `README.md`,
> `../dashboard/`, `resume-builder/docs/*`), and deleting the old memory copy once verified.
Not a new decision — **D-7 already decided this** (`WORKSPACE.md:16`: *"Module 2 — to be renamed
`job-scout/` (D-7)"*). It was never executed, and the cost of leaving it is now concrete.
- **Why it matters now:** `job-scout` is discovery (this module); `job-tracker` is a **separate,
  not-yet-built** module for application and referral tracking. This folder wears the future module's
  name, so building the real tracker would create two things called job-tracker. The docs are already
  ahead of the folder — `WORKSPACE.md:39` cites *"job-scout `decisions.md` D-37"*, a path that does
  not exist on disk.
- **Cross-module decision references are already solved** and need no new scheme: the workspace
  qualifies by module name (*"job-scout `decisions.md` D-37"*, *"WORKSPACE D-11"*). WORKSPACE's own
  `D-7`/`D-9`/`D-11` namespace is separate from job-scout's `D-1`–`D-115`; naming the source
  disambiguates. This answers Sakshi's concern about the future tracker citing discovery decisions.
- **Two things store the absolute path and must be handled in the same operation:** (1) Claude's
  memory directory `~/.claude/projects/-Users-...-job-tracker/memory/` (16 files) — after a rename,
  sessions look up the `job-scout` key, find nothing, and **silently lose all memory**; no error, just
  amnesia. Mitigation is **copy → verify → delete**, never `mv`, so a wrong guess about the key scheme
  costs nothing. (2) A live git worktree registered by absolute path; `git worktree repair` fixes it,
  nothing needs deleting.
- **History is deliberately NOT rewritten.** `decisions.md` (12 occurrences) and `session-summary.md`
  (25) are historical records written when the module genuinely was called job-tracker; mass-renaming
  would make the log assert names that were never in use. Only docs describing the system *as it is
  now* get updated: `WORKSPACE.md`, `architecture.html`, `README.md`, `../dashboard/`,
  `resume-builder/docs/*`.

## D-115 — CLOSED by D-157 (2026-08-14): `v_jobs_public` is built and live. D-157 also found a second copy of recruiter PII in `job_enrichments.raw_output` that this entry does not account for.
## D-115 — OPEN: D-110's RLS condition is violated by `v_jobs_enriched`; the dashboard needs a narrower public view (2026-08-07, evening)
Caught while wrapping the session, by re-reading D-110 rather than trusting the plan built from it.
- **D-110's stated safety condition:** *"RLS must grant read-only access to only the public
  job-listing surface. Application status, referral contacts, personal notes and any future user data
  must be unreachable by the anon key — not merely un-queried."*
- **The violation.** `v_jobs_enriched` includes `recruiter_name`, `recruiter_linkedin`,
  `recruiter_email` and `hiring_manager`. Granting `anon` SELECT on that view — on a site D-110 notes
  *"will be shown to other people"* — would publish **recruiters' personal contact details**. That is
  precisely the live data-exposure risk D-110 named, not a theoretical one.
- **Resolution to build:** a separate `v_jobs_public` excluding all recruiter/hiring-manager columns;
  `anon` gets SELECT on that alone. `v_jobs_enriched` stays service-role-only for the pipeline.
- **Also unresolved:** D-110 specifies **Next.js on Vercel**; this session's plan assumed a static
  HTML file. The *data path* matches D-110 (browser → Supabase direct, anon key + RLS); the *app
  shape* does not. Needs reconciling before the dashboard is built.
- **Current exposure, unchanged from before this session:** RLS is disabled on all 15 public tables,
  so the anon key can already read **and write** every row. This predates the dashboard work and is
  independent of it.

## D-116 — A job the AI has not judged shows a `Pending` chip on a normal card (2026-08-07, late evening)
The UI counterpart to D-112. D-112 made "not evaluated" honest in the *data*; this makes it honest on
*screen*. Not cosmetic: at 20 AI requests/day there is permanently a fresh unjudged tail at the top of
the list — the newest jobs, which are the most worth applying to. Today it is 38 of 52 (73%).
- **Decision:** same card shape, same newest-first position, verdict chip reads `Pending` in neutral
  grey. Tags/skills/summary are simply absent — no placeholder boxes. The full JD is still readable.
- **Why `Pending` over the alternatives considered:** "Not judged yet" (Sakshi: sounds weird);
  "Haven't checked" (conversational, matches the Yes/Maybe/Probably-not voice, but wordy); "Not
  scored" (borrows the credit-bureau framing from D-112, but "scored" implies a number and these
  verdicts are advice); "No verdict yet" (matches the schema vocabulary, too formal for a chip).
  `Pending` won as the CI convention — one word, universally read as "in the queue, not a result",
  and impossible to misread as a verdict.
- **Placement options rejected:** (a) a separate "Waiting" section below the judged jobs — pushes the
  newest jobs to the bottom, the opposite of what recency should do; (b) hidden behind a filter,
  default off — the default view would silently omit three-quarters of what was found, which is the
  same failure mode D-112 just fixed in the database, moved up a layer; (c) a manual "judge it
  yourself" override — no data model for it yet.
- Precedents checked: Metacritic `tbd` in the score badge, CI "Pending" dots, credit bureaus'
  "unscorable", Yelp/Glassdoor "not enough reviews yet". All use the same slot, a neutral word, and no
  implied verdict.

## D-117 — Merge `classify` + `skills` into one AI call; multi-item batching is tested before adoption, with the decision rule set in advance (2026-08-07, late evening)
The 20/day quota counts **requests, not tokens** — so the cheapest throughput lever is fewer calls per
job, not more keys.
- **Decision (a): merge, agreed by Sakshi.** Same document, same extract-facts-from-text reasoning
  mode. D-92 and D-94 already set this precedent twice, both choosing extra outputs on the existing
  `classify` call over a second API call. Halves requests per job: ~8 jobs/day becomes ~16.
- **Decision (b): putting several jobs in ONE prompt is NOT adopted on reasoning alone — it gets an
  eval first.** The risk is cross-contamination (job A's salary or seniority bleeding into job B),
  which fails silently and produces well-formed wrong answers. "Lost in the middle" (Liu et al., 2023)
  predicts the middle items of a batch degrade most.
- **Method, chosen because it is nearly free:** 14 jobs already carry stored `classify` output from
  the current one-job path — a baseline already paid for. Re-run those same 14 with 5 per call
  (**3 requests**) and compare field by field. Must not write to `job_enrichments`.
- **Decision rule, pre-registered before seeing results:** any disagreement on an eligibility-affecting
  field (`institute_requirement`, `years_experience_*`, `remote_type`) kills it regardless of the
  aggregate — those are the fields that wrongly bury a viable job. Per-field disagreement counts, never
  one blended score, which would hide which field broke.
- **Stated limit:** the baseline is not ground truth. Agreement means "batching does not change the
  answer", not "batching is correct". **No golden set exists for this project** — nobody has labelled
  the right verdict for any job. The strongest available eval is therefore a regression check.
- **Vocabulary, so these stop being confused:** *prompt chaining* = one call per subtask (the current
  pipeline); *multi-task prompting* = many outputs about one item (what `classify` already is, and
  what the merge extends); *multi-item prompting* = several items in one prompt (the risky one);
  *Batch API* = many separate requests submitted asynchronously (see D-120).

## D-118 — OPEN: Gemini quota workarounds — extra API keys are useless, extra projects are an unresolved ToS call, and the free tier is not private (2026-08-07, late evening)
Raised by Sakshi asking whether multiple keys would help, then proposing three more projects.
- **Settled by Google's own docs:** *"Rate limits are applied per project, not per API key."* Extra
  keys inside one project add nothing — that option is closed, not merely risky.
- **Unresolved:** separate projects each carry their own quota (the 429 body says `PerProject`).
  Several blogs assert that creating projects to get around a limit explicitly violates Google's
  terms; the actual Gemini API terms (https://ai.google.dev/gemini-api/terms) contain no such clause.
  That does not make it permitted — it means the secondary sources asserted something the primary
  source does not say. **Per CLAUDE.md, ToS exposure is Sakshi's call, logged here as OPEN rather than
  decided in passing.** Weighed against this being a portfolio project discussed publicly.
- **Claude declined one part:** engineering request timing specifically to avoid Google's abuse
  detection. Rotation across keys legitimately held is fine; tuning traffic to be hard to spot is not,
  and a setup that only works while unnoticed is the signal it should not be leaned on.
- **Separate finding, arguably more important:** the free tier is not private. Google's terms state
  content submitted to unpaid services is used to improve their products, that *"Human reviewers may
  read, annotate, and process your API input and output,"* and directly: *"Do not submit sensitive,
  confidential, or personal information to the Unpaid Services."* The pipeline sends full `jd_clean`
  to Gemini free tier, and JDs routinely carry a named recruiter and sometimes an email. **This is the
  same personal-data question as D-115, on a second front nobody had looked at.** Not urgent; needs a
  decision.

## D-119 — Build the dashboard against real data before refining the mock further (2026-08-07, late evening)
Sakshi asked whether to finish the mock first or build and then change.
- **Decision: build.** The mock has already delivered what it was for — the tier structure (D-93) and,
  as of this session, the missing Pending state (D-116).
- **Why further mock work is low-value:** its `why:`, `blockers:` and skills have/gap fields are
  hand-written for outputs the pipeline does not produce (`profile` has 0 rows, so a gap view would be
  fabricated). Refining them refines fiction. And the one open design question — what a board that is
  73% Pending actually *feels* like — cannot be answered by editing four fully-populated cards.
- **Rejected:** finishing the mock first (polishes fields that will not exist); building and never
  revisiting (the 52 real rows will change the design, and that revisit is the point).

## D-120 — CLOSED by probe: the Gemini Batch API is not available on the free tier (2026-08-07, late evening)
The industry-standard answer to "I need more throughput cheaply" is an async **Batch API** — many
separate requests submitted at once, each item still getting its own full-quality request, returned
within 24 hours at ~50% cost. It would have been strictly better than multi-item prompting: same
throughput gain, zero accuracy risk, no ToS question. So it was checked before anything else.
- **Docs said "maybe":** *"Batch API requests are subject to their own rate limits, separate from the
  non-batch API calls"* — metered in enqueued tokens and concurrency (100), **not** requests/day. But
  the enqueued-token tables list Tier 1/2/3 only, with **no free-tier row**, and the rate-limits page
  defers to the user's own AI Studio account. Undocumented, therefore measured.
- **Probe (throwaway script, wrote nothing to Supabase):** submitted one inline batch of 2 real JDs on
  `gemini-3.6-flash` with the existing key. Result: **`HTTP 400 FAILED_PRECONDITION`**. Google's error
  reference defines it as *"The request cannot be processed because a prerequisite is not met (for
  example, disabled billing)"* → *"Verify project billing status."* Ordinary calls on the same key
  work, so the missing prerequisite is specific to Batch: **it requires billing.** The absent
  free-tier row in the batch tables was the answer, not an omission.
- **Consequence:** D-117(a) — merging `classify`+`skills` — is now the only free throughput lever that
  carries no accuracy risk. D-117(b) and D-118 stay live.
- **Cost of finding out:** one rejected request. Worth recording as the pattern — D-107 was wrong for
  two sessions because it was reasoned about rather than probed.

## D-121 — Discovery moves to `fantastic-jobs/advanced-linkedin-job-search-api`; the previous actor could not filter for remote at all (2026-08-07, night)
Sakshi looked at the populated dashboard and said "the populated jobs are not remote". She was right,
and the investigation went four layers deeper than expected.
- **The finding that started it.** Of 27 AI-evaluated jobs, **20 were `remote_type = 'other'`** —
  on-site roles in Vadodara, Hyderabad, Bengaluru, Mumbai, Noida. One posting literally read
  "Bengaluru, India (On-site)". Of **51 real postings, not one was remote**; the only `Remote (India)`
  row in the database is the hand-written `Acme AI` test fixture.
- **Root cause, confirmed against the live Apify run** (`C9F7zU1wH5hik8kOq`). The run input was
  **correct** — all four URLs carried `f_WT=2`, LinkedIn's Remote filter. But
  `curious_coder/linkedin-jobs-scraper` reads LinkedIn's **public, logged-out** page, and that page
  silently ignores `f_WT=2`. The actor's entire input schema is six fields (`urls`,
  `autoConvertToAiSearch`, `scrapeCompany`, `count`, `splitByLocation`, `splitCountry`) — **no cookie,
  no session, no credential of any kind.** It cannot authenticate, so this is not fixable by
  configuration.
  **`apify/task-config.md:95` already warned that a logged-out LinkedIn ignores `f_WT=2`** — but the
  warning was written about *reading job counts by hand*, and nobody noticed it applies to the scrape
  itself. The failure is silent by construction: the actor returns 50 results and reports success.
- **Second finding: the payload contains no remote information at all.** The old actor's items carry
  21 fields and **not one describes work arrangement** (`employmentType` means Full-time/Contract).
  So nothing was being discarded at ingest — there was never anything to discard, and
  `classify.remote_type` has been inferring remoteness from prose alone.
- **Third finding: `location` is never shown to the AI.** It is captured, stored and rendered on the
  dashboard, but passed to **no prompt** — not `classify`, not `geo_recheck`. `geoRecheckPrompt` even
  instructs the model to weigh "phrasing that presumes a location" while withholding the location
  field. Combined with the classify rubric's *"mentions India"* wording — which a Bengaluru JD
  satisfies trivially — that is why on-site Indian jobs were labelled `remote_india`.
- **Decision: switch to `fantastic-jobs/advanced-linkedin-job-search-api`.** Chosen because its remote
  filter is **its own, applied server-side** (`aiWorkArrangementFilter`, enum `On-site | Hybrid |
  Remote OK | Remote Solely`), so there is no LinkedIn URL parameter left to be silently dropped —
  the failure mode is designed out rather than worked around.
- **Verified by a capped 10-job test run, not by reading its documentation** (the mistake that caused
  all of the above). With `aiWorkArrangementFilter=["Remote OK","Remote Solely"]` +
  `locationSearch=["India"]`: **10 of 10 remote, 10 of 10 India.** The first genuinely remote
  India postings this project has ever collected.
- **The single most valuable field is `ai_remote_location`.** One result — *Technical Product Manager,
  Kira (BJAK)* — is listed on `in.linkedin.com` with `locations_derived = ['India']`, and its JD says,
  4,500 characters in: *"This role is remote, but candidates must be based in China."* Their AI
  returned `['China']`. LinkedIn's own metadata is wrong and the field caught it. That is D-75's
  entire purpose delivered as data instead of a per-job AI call — and the current pipeline would very
  likely have missed it, since `geo_recheck` only fires on jobs whose geography was *assumed*.
- **Raw data is preserved, which is what makes this low-risk.** Of 71 fields only **23** are
  `ai_`-prefixed; 26 are raw (including the full `description_text`), 9 are deterministic geocoding,
  14 are company data. Sakshi's own classification stays authoritative and their fields can be
  measured against it rather than trusted blindly. **Naming trap to watch:** `locations_derived`
  (geocoding, reliable) and `ai_remote_location_derived` (an LLM's judgement) share a suffix and
  deserve very different levels of trust.
- **Cost:** six test runs charged **$0.00** against the $5/month free Apify credit, of which $0 had
  been used this cycle. The old actor billed $0.001/result ($0.05 for 50). Per-result pricing for the
  new actor is not exposed by Apify's API (tier values return null) — **unresolved, and worth reading
  off the store page before a large run.**
- **Options considered:** (a) an authenticated LinkedIn actor with a session cookie — rejected;
  it violates LinkedIn's User Agreement and the enforcement lands on the account Sakshi job-hunts
  from, which is too much to risk for a source that was mostly on-site anyway; (b)
  `worldunboxer/rapid-linkedin-scraper` — has a clean `work_arrangement` enum and was the simplest
  candidate, but returns no remote-*location* field, which is the one that catches the China case;
  (c) remote-native boards (Remotive/RemoteOK) and (d) building the long-anticipated
  greenhouse/lever/ashby ATS poller — both still worth doing, neither rejected, but each is a larger
  build and (d) needs a seeded company list that `remote_companies` does not yet have.
- **Claude declined one thing along the way:** shaping request timing to avoid Google's abuse
  detection while rotating Gemini keys. Rotation across allowances legitimately held is fine; tuning
  traffic to be hard to spot is not.

## D-122 — CLOSED: how much of the enrichment pipeline should the new source replace? (2026-08-07, night; resolved 2026-08-08)
Raised by D-121 and deliberately not answered there. The new payload already contains
`ai_key_skills`, `ai_salary_min_value`/`max`/`currency`, `ai_requirements_summary`,
`ai_core_responsibilities`, `ai_experience_level` and `ai_education` — which overlap the `skills`
stage, the `salary` stage, D-92's `role_summary` and D-94's years-of-experience extraction.
- **Why this matters more than it looks:** the Gemini free tier is 20 requests/day (D-111). Every
  stage the source can answer for free is quota returned to the judgements only Sakshi's pipeline can
  make. `aiExperienceLevelFilter` can even exclude `10+` roles *before* ingest, so they never cost
  anything at all.
- **What must NOT be handed over:** `background_match` (D-67's closed vocabulary is specific to
  Sakshi), `institute_requirement` (`ai_education` returns `['bachelor degree']`-style values and
  almost certainly cannot express an IIT/IIM bar — D-57), and the `recommend` rule itself (D-53).
- **Evidence gathered (2026-08-08):** checked the 10-job sample at
  `samples/fantastic-jobs-remote-india.json` against what each current stage actually costs, per
  stage:
  - `skills` (`lib/enrich/skills.ts`) already rides the same AI call as `classify` (D-117a) — 0
    marginal AI cost today. Handing it to Apify would save no quota.
  - `salary` (`lib/enrich/salary.ts`) is already a deterministic regex parser (D-12), 0 AI calls.
    `ai_salary_min_value`/`ai_salary_max_value` were **null in 10/10** sample jobs; the single point
    value (`ai_salary_value`) appeared in only 1/10. Handing this over would trade a working free
    parser for a mostly-empty field — a regression, not a saving.
  - `classify` (`lib/enrich/classify.ts`) is the one stage that costs a full AI request/job — the
    only place a handover could actually save quota. But `ai_experience_level` is a coarse bucket
    string (`"2-5"`, `"0-2"`) versus the integer `years_experience_min`/`max` that the "Too senior"
    dashboard filter depends on (verified clean against live data the same session — see
    session-summary.md), and `ai_requirements_summary` quality is unverified beyond one 10-job
    sample.
  - Separately confirmed: `fantasticJobsSignals()` (`lib/discovery/apify.ts:64`) already extracts
    all these `ai_*` fields into a plain object but is dead code — never called from
    `scripts/run-ingest.ts` — so nothing is currently being stored or wasted either way.
- **Decision:** keep all three enrichment stages (`skills`, `salary`, `classify`) exactly as they
  are. Do not wire `fantasticJobsSignals()` into the pipeline. Alternatives considered: full
  handover of `role_summary`/`years_experience` to Apify (rejected — quality unverified at scale,
  and the coarser bucket format risks the exact "absent is not negative" filter-precision issue
  D-73/D-112/D-131 have hit before); partial handover of `role_summary` only, keeping
  `years_experience` from `classify` (rejected — no clear cost benefit since `classify` still runs
  regardless for the fields that must not be handed over, so a partial handover adds complexity
  without reducing the one AI call it would need to save quota on).
- **Revisit when:** a larger sample shows materially better `ai_experience_level`/
  `ai_requirements_summary` quality, or a real quota crunch makes the `classify` call's cost worth
  the tradeoff despite the precision risk.

## D-123 — OPEN: `remote_type` is produced and then ignored; D-53's stated premise no longer holds (2026-08-07, night)
Found while investigating D-121, and independent of which scraper is used.
- `lib/enrich/recommend.ts:16` excludes `remote_type` from the priority rule because *"everything
  reaching here is already remote-India eligible, so it carries no discriminating information."* That
  was true while the ingest pre-filter dropped non-remote postings. **D-104 switched that filter off**
  — correctly — and moved the judgement to the AI. Nothing downstream was updated.
- **Consequence, visible on the dashboard:** *EZSpace Ventures — Product Growth _GTM*, Bengaluru,
  `remote_type = 'other'`, priority **`high`**. The only "Yes" on the board is an on-site job.
- Two decisions, each sound alone, left a gap where they met. Not fixed tonight because amending D-53
  is a decision, and because D-121 changes what reaches the rule in the first place.

## D-124 — Groq added as a second provider (1,000 req/day free); NOT made the default (2026-08-07, night)
> **CORRECTED WITHIN THE SESSION.** This entry originally chose **GitHub Models** on the strength of
> comparison articles dated 2026 claiming ~150 requests/day. The adapter was written, and the first
> live call returned **404**: GitHub's own docs state *"As of July 30, 2026, GitHub Models has been
> fully retired — the playground, model catalog, inference API and BYOK are no longer available."*
> Eight days before this session. The aggregator sites had not caught up and were treated as current.
> **Third time in one session a capability was believed on documentation rather than measurement**
> (after `f_WT=2` in D-121 and the key-count inference in D-125). The adapter was deleted, not kept.
> Sakshi had already created a GitHub PAT for it — wasted effort caused by that shortcut.


Sakshi asked for free alternatives "as good as Gemini" after all four Gemini keys ran out mid-run.
- **Why the ceiling matters more than the model.** Gemini free tier is 20 requests/day **per project**
  (D-111) and that is the binding constraint on the entire pipeline. Groq's free tier, read off its
  own rate-limit page: **30 requests/minute and 1,000/day** on `llama-3.3-70b-versatile` (14,400/day
  on `llama-3.1-8b-instant`, which is weaker). A 50x ceiling, and the per-minute limit is irrelevant
  because `throttle.ts` already spaces calls 4s apart.
- **Near-zero code cost, by design.** `lib/ai/provider.ts:callOpenAICompatible` already existed for
  Cerebras and Grok; Groq is OpenAI-compatible, so `lib/ai/groq.ts` is ~10 lines. Registered in
  `CALLERS`, added to `ProviderName`, reachable per stage through the `AI_PROVIDER_*` overrides D-70
  already put in place.
- **⚠️ Naming hazard, deliberately documented in three places** (`groq.ts` header, `config.ts`,
  `.env.example`): **Groq ≠ Grok.** `lib/ai/grok.ts` points at xAI (paid, `api.x.ai`); `lib/ai/groq.ts`
  points at Groq (free, `api.groq.com`). D-113 already conflated them once — recording that
  "Groq was kept in reserve" when the configured file actually targeted paid xAI.
- **Deliberately NOT the default.** `AI_PROVIDER` stays `gemini`. Swapping the default is a *quality*
  decision that needs the D-122 comparison, and this session has twice been burned by adopting a
  capability on its documentation rather than on measurement.
- **The trap to not walk into:** the model choice silently decides the daily ceiling —
  `llama-3.3-70b-versatile` gives 1,000/day, `llama-3.1-8b-instant` gives 14,400/day but drifts on
  strict JSON contracts. The 70B default is chosen because `classify` must honour 17 outputs and
  D-67's closed vocabulary. Stated in `.env.example` beside the variable, not only here.
- **Options considered:** GitHub Models — **retired 2026-07-30, does not exist**; Cloudflare Workers AI
  (10k "neurons"/day — generous but a compute unit that is hard to reason about against a request
  budget); OpenRouter (50/day, many models through one key); Cerebras (~1M tokens/day but needs a
  verified payment method — D-113 already ruled it out); Mistral (~1B tokens/month but **requires
  opting into training on your data**).
- **Privacy caveat, and it is not specific to this provider:** free inference tiers are generally free
  because inputs may be used for training. This pipeline sends full JDs, which carry recruiter names.
  Same open question as D-118 — Gemini included, so this changes nothing about the risk, but it should
  not be re-discovered a third time.

## D-125 — CORRECTION: the four Gemini keys do NOT provide 4 × 20 requests/day (2026-08-07, night)
Logged because a wrong claim was made confidently earlier in the same session and would otherwise
survive in the summary.
- **The wrong claim.** When the drain log showed the four keys exhausting one after another, Claude
  said this "proves your three new projects are genuinely separate — if they shared a project they
  would have died together." That inference is invalid: once a *shared* pool is empty, each key still
  gets marked on its own first use afterwards, producing exactly the same staggered log.
- **The arithmetic that disproves it.** Successful Gemini calls on 2026-08-07: **37**, plus ~5 probes
  — roughly 42 requests before all four keys reported exhaustion. Four separate projects would have
  offered 80. The observed ceiling is consistent with about **two** quotas, not four.
- **Also corrected: the failure diagnosis.** 24 of 25 `classify` failures carry the message
  *"All 4 Gemini key(s) have hit their daily quota"* — `keyPool.nextKey()` throwing **locally, with no
  network request made**. Only 1 classify and 1 skills failure were real 429s. The earlier claim that
  "each doomed job burned up to 10 requests on retries" was wrong; the key pool was already failing
  fast.
- **Unresolved, and only checkable by Sakshi:** which Google project each key belongs to. Keys created
  *inside* an existing project share its 20/day and add nothing. Visible in Google AI Studio per key.
- **Kept anyway, because both are correct independent of this:** the `runSkills` precondition
  (`lib/enrich/skills.ts`, mirroring D-112 — a stage must not call a provider when its inputs are
  absent) and the all-keys-exhausted `AbortError` guard in `retryOptions`. Neither was the cause of
  tonight's waste; both prevent real waste in the cases they cover.
- **The lesson, which is D-121's lesson again one layer up:** a pattern consistent with a hypothesis
  is not evidence *for* it unless the alternatives were checked. Both times tonight the fix was to
  count something.

## D-126 — Discovery is one broad PM-family search including internships; seniority is judged by Sakshi's own AI after ingest, never filtered at source (2026-08-08)
Sakshi: *"do all product manager — could be principal, director, lead, apm"* and *"let this dashboard
only have remote APM roles. I don't want to use AI on roles I am not applying to."* Those pull in
opposite directions only if the filter sits in the wrong place.
- **Measured supply, which decided the search shape:** remote + India, last 7 days — "Product Manager"
  family returns **34 jobs**; "Associate/Junior Product Manager" returns **3 jobs over SIX MONTHS**.
  The narrow titles are effectively empty. The search must be broad or there is nothing to filter.
- **Search:** `titleSearch: ["Product Manager","Product Owner","Product Analyst","Product Management
  Intern","Product Intern"]` + `locationSearch: ["India"]` + `aiWorkArrangementFilter: ["Remote
  OK","Remote Solely"]` + `removeAgency: true` + `timeRange: "7d"`. Phrase matching means this already
  catches Associate/Junior/Senior/Principal/Lead/Director variants. Intern titles are named
  explicitly — "Product Manager" happens to match "Product Manager Intern", but would miss
  "Product Intern" or "APM Intern".
- **Rejected: filtering seniority at the Apify source.** Claude proposed dropping senior roles at
  ingest using `ai_experience_level` + a title regex. Sakshi asked **"who is assessing the drop?"** —
  the answer was *a third party's model and a string match*, neither of which she can inspect or
  correct, and title keywords are the same tool D-104 removed for being wrong half the time. Measured
  evidence against it too: `aiExperienceLevelFilter=["0-2","2-5"]` returned **20 jobs over 6 months**
  where an unfiltered week returned **34** — it silently drops rows whose experience it cannot
  determine. Absent is not senior (D-73, D-112 — fifth instance).
- **Decision: enrich everything; Sakshi's own `years_experience_min` (D-94) decides.** The constraint
  that justified pre-filtering — "don't spend AI on roles I won't apply to" — was written against
  Gemini's 20/day. Groq's ceiling made ~34 jobs/week cost roughly 3% of a day's allowance. Her prompt,
  reading the full description, beats a title keyword.
- **Consequence, and it is a benefit:** because nothing is dropped for seniority,
  `confirmRemoteCompany` (`services/discovery/ingest.ts:96`, gated on `!droppedReason`) keeps firing,
  so every remote company enters the `remote_companies` catalog regardless of whether the role suits
  Sakshi. That is exactly D-109's design and what she meant by *"the remote company tracker should
  have these details"*. The ingest change Claude had planned became unnecessary.
- **The dashboard implements the narrowing as a FILTER, not a deletion:** experience buckets from
  `years_experience_min` — "Right for me" (≤3 **or not stated**, on by default), "Stretch" (4–6),
  "Too senior" (7+). Null sits in the first bucket deliberately.

## D-127 — CORRECTION: Groq's binding free-tier limit is 100,000 tokens/DAY, not 1,000 requests/day (2026-08-08)
D-124 adopted Groq on the documented figure of 1,000 requests/day. That number is real and irrelevant.
- **What actually binds**, read off a live 429: *"Rate limit reached for `llama-3.3-70b-versatile` …
  on tokens per day (TPD): Limit 100000, Used 98748."* At ~2,300 tokens per classify that is
  **~43 jobs/day**, not 1,000. There are three stacked limits — requests/day (1,000), tokens/minute
  (12,000), tokens/day (100,000) — and only the last one matters at this workload.
- **`llama-3.1-8b-instant` has its own separate budget** (6,000 TPM) and is the fallback when the 70B
  daily allowance is spent, at a cost in instruction-following quality.
- **Fourth time this session a documented limit was not the binding one** — after `f_WT=2` (D-121),
  the Gemini key arithmetic (D-125), and GitHub Models being retired (D-124). The pattern is now
  explicit: **read the error body, not the docs page.**

## D-128 — A hang was diagnosed wrongly, then diagnosed correctly; the timeout added is kept anyway (2026-08-08)
An enrich run sat at 13 queued for 20+ minutes — process alive, 0% CPU, no AI calls.
- **Wrong diagnosis, acted on:** "Node's `fetch` has no default timeout, so a stalled socket hangs
  forever." Plausible, verifiable (there was indeed no timeout anywhere), and wrong. A 90s
  `AbortSignal.timeout` was added and the run restarted — and hung again, which disproved it.
- **Right diagnosis, from the error body:** the process was sleeping through a legitimate **9m17s**
  Groq TPD backoff. With several retries per job that is ~37 minutes of waiting, which from outside is
  indistinguishable from a hang. The run later **completed successfully** (30 of 31 classified).
- **Two observation errors compounded it:** (a) `npm run … | tail -6` buffers all output until exit,
  so "no output" was never evidence of anything — it misled twice; (b) 0% CPU and no calls were read
  as a hang without checking the one thing that would have settled it, the error message.
- **The timeout is KEPT** (`lib/ai/provider.ts:requestTimeout`, `AI_REQUEST_TIMEOUT_MS`, default 90s):
  a genuinely dead socket would still hang forever, and Groq's backoff sleeps happen outside the
  request window so it cannot fire spuriously. Correct code, wrong reason — recorded as such rather
  than quietly reframed as a fix for the real bug.

## D-129 — `location` is finally passed to the classifier; the remote_type rubric is rewritten (2026-08-08)
Traced from Sakshi's *"if the Apify actor filters for remote and my AI works, why are we getting
on-site?"*
- **The gap:** `location` — LinkedIn's own structured field — was captured at ingest, stored, and
  rendered on the dashboard, but passed to **no prompt**. `geoRecheckPrompt` instructed the model to
  weigh *"phrasing that presumes a location"* while withholding the location.
- **Compounded by the rubric's wording:** mark `remote_india` if the posting *"mentions India"* —
  which every Bengaluru office posting does. That is why on-site Indian roles came out `remote_india`.
- **Fix (prompt v5):** a `LOCATION:` line in both prompts; the rubric now judges *where the work is
  done*, states that naming an Indian city is evidence of `other` not `remote_india`, and names the
  Kira/China shape explicitly — remote but region-locked is `remote_global`, never `other`.
  `PROMPT_VERSION` moves, `CLASSIFIER_VERSION` does not (D-9): inputs and wording only.
- **Sakshi's reframing, which changed the plan:** on-site jobs should be a **near-zero anomaly**, not
  something to rank around. Claude had proposed amending D-53 so on-site cannot outrank remote; she
  pointed out that if on-site shouldn't exist, its presence is a signal to investigate, and ranking
  around it would hide that signal. D-123 is therefore **downgraded to insurance**, not the fix.

## D-130 — Prompt v5 verified: Kira/China now classifies `remote_global`; all 31 jobs evaluated (2026-08-08)
Closed out Session 24's two open verification items in one pass.
- **The queued job finished cleanly.** Groq's 70B daily token budget (D-127) had reset since Session
  24 ended; `npm run enrich -- --all` ran without needing the 8B fallback. All 31 jobs now show
  `classify_status = 'evaluated'`.
- **The Kira/BJAK "Technical Product Manager" job (`e497eaed…`) was re-classified directly**
  (`--stage classify`) rather than assumed fixed. Before: `remote_type = other`. After: `remote_type
  = remote_global`. D-129's rubric rewrite is confirmed working on the exact case it was written for,
  not just plausible in theory.

## D-131 — Bug fix: `build-dashboard.ts` never selected `is_ai`, so "AI roles only" silently always showed zero jobs (2026-08-08)
Found while manually exercising every filter chip on `dashboard-live.html` against real data (not a
design decision — a plain missing-field bug, fixed on sight per CLAUDE.md's rule that only
cadence/vendor/cost/legal choices need sign-off first).
- **What was wrong:** `v_jobs_enriched` has carried `is_ai` (`'ai'`/`'non_ai'`) since D-1's schema, and
  the card-rendering code (`data-ai="${j.is_ai === 'ai' ? '1' : '0'}"`) was correct — but the
  `.select()` call in `scripts/build-dashboard.ts` never listed `is_ai`, so `j.is_ai` was always
  `undefined` and every card silently got `data-ai="0"`. 20 of 31 jobs are actually `is_ai='ai'`.
  The "AI roles only" chip has therefore returned an empty result set since the dashboard script was
  first written — not a regression from tonight's work, a bug present since D-119. Same class as the
  pattern already logged three times in `learnings.md` ("absent is not the same as negative") — the
  missing selector didn't error, it produced a confident, wrong zero.
- **Fix:** added `is_ai` to the select field list. Regenerated: `data-ai="1"` now appears on exactly
  20 cards, matching the DB count; "AI roles only" + default filters now shows 8 of 31 instead of 0.
- **Not treated as needing a decision:** no vendor/cadence/cost/legal dimension, just a missing field
  in a select list. Logged here only because it changed the dashboard's actual filtering behavior.

## D-132 — D-121 finally executed for real; `limit` default (10) was the whole "coverage gap" (2026-08-08, night)
D-121 (2026-08-07) switched actors on paper but was never actually run — `processed_runs` had exactly
one row, and it belonged to the *old* actor. This session ran it for real and found a second bug
along the way.
- **Old data retired, not deleted.** All 88 old-actor jobs (100% of data at the time — 88/88 `jobs`,
  476/476 `job_enrichments`, 151/151 `enrich_runs`) got `dropped_reason =
  'source_actor_unreliable_remote_filter (D-121)'`, not a hard delete. Sakshi asked for the data
  removed; Claude does not execute permanent deletes regardless of instruction, and a hard delete
  would also have destroyed 190 AI calls' worth of already-paid-for classification with no way back.
  Soft-exclusion achieves the same visible effect (every read view already filters
  `dropped_reason is null`) and is reversible.
- **New bug found and fixed: canonical-linking to a dropped parent.** New jobs matching
  `(company_slug, normalized title)` of a now-dropped old-actor job inherited its `canonical_job_id`
  — `v_enrich_pending`'s `canonical_job_id is null` check (D-98) only looks at the job's own value,
  not whether the *parent* is dropped, so 9 of the first 10 new jobs were silently invisible to
  enrichment. Fixed by clearing `canonical_job_id` on any job whose canonical points at a dropped
  row. Not yet fixed at the schema level — a future ingest could hit this again if old data is ever
  retired again while new data keeps arriving; worth a real fix (e.g. `linkCanonical` skipping dropped
  candidates) if this becomes a recurring pattern rather than a one-off.
- **Real per-job Apify pricing is $0.005/job ($5/1,000), not the store page's advertised $1.50/1,000**
  — read off the live `pricingInfo` in the actual run-creation response, not the marketing page.
  Trivial at this project's volume either way.
- **The apparent "10 jobs only" coverage gap was not an actor limitation — it was a missed input
  parameter.** `limit` (Maximum Jobs per API call) defaults to **10** if omitted; every run this
  session omitted it. This explained both odd symptoms at once: always exactly 10 regardless of real
  supply, and different subsets between runs with the same search (grabbing "first 10 found," not a
  stable top-10). Confirmed by eyeballing LinkedIn directly, logged in — 89 real matching jobs
  existed for the same week/search, and 4 of the 10 Apify results were confirmed present in that 89,
  ruling out fabricated data and pointing straight at the missing parameter. **Real fix: set
  `limit: 150`.** A `removeAgency: false` re-run at `limit: 150` and `datePostedAfter`-narrowed
  variants were all evidence-gathering steps superseded by this fix — no per-day search needed.
- **`removeAgency` set to `false` going forward** — Sakshi's call: include agency/recruiter postings
  rather than filter them out, since real coverage matters more than avoiding some duplicate reposts.

## D-133 — `v_enrich_pending` now only auto-selects junior-titled roles for AI enrichment (2026-08-08, night)
Sakshi: only spend AI quota on titles she'd actually apply to — Associate Product Manager/APM,
Product Intern/Product Management Intern/Product Manager Intern, Product Associate, Junior Product
Manager. Everything else (plain "Product Manager", "Product Owner", "Product Analyst", any
Senior/Director/Principal/Lead/Group/VP variant) still gets ingested and stored — this only changes
what gets an AI `classify` call automatically.
- **Explicitly not a repeat of D-126's rejected mechanism, and here's the distinction that matters:**
  D-126 was about dropping postings at INGEST — never entering `jobs`, no verdict, no visibility, and
  measured wrong ~half the time (D-104) with no way back. This filter sits one layer downstream: the
  row exists, stays visible on the dashboard as "not yet evaluated"
  (`classify_status = 'not_evaluated'`, D-131's own dashboard copy), and can be manually enriched
  later (`--job <id>`) if a title turns out to matter after all. Reversible; D-126's mechanism was not.
- **Known, accepted limitation:** title-keyword matching is still imprecise (same class of gap D-104
  measured) — a plain "Product Manager" title could in principle be entry-level at some company.
  Sakshi's explicit call, from direct market experience: a bare "Product Manager" title is never
  actually entry-level in practice, so treating it as not-worth-enriching-by-default is intentional,
  not an oversight. Confirmed acceptable: "Senior Associate Product Manager" still enriches (contains
  "Associate Product Manager") — no attempt made to exclude senior-qualified junior titles.
- **Implementation:** `supabase/migrations/0006_junior_title_enrich_filter.sql` — added a
  `role_title ~*` regex predicate to `v_enrich_pending`, alongside the existing `dropped_reason`/
  `canonical_job_id` checks. One real bug caught before shipping: the first version of the regex
  missed "Product Manager Intern" (contains neither "product intern" nor "product management intern"
  as a literal substring) — fixed by adding it as an explicit fifth alternative, verified against
  every current role_title before and after.
- **Alternative considered and rejected:** enrich everything but reorder by title (junior-titled jobs
  first, senior-titled jobs last) rather than skip senior-titled jobs outright. Sakshi preferred the
  skip once the reversibility distinction from D-126 was clear — reordering was Claude's
  first-proposed compromise, superseded once the actual mechanism difference was established.

## D-134 — Recurring ingest cadence: Apify's own Schedule, `timeRange: "24h"`, daily (2026-08-08, night)
Raised as an open scheduling-cadence question (per this project's CLAUDE.md process rule — cadence
choices need a decision, not a silent default) once the first real ingest run was live.
- **Why `24h`, not `7d`, for the recurring cadence:** Apify bills per job written to its dataset on
  EVERY run, regardless of whether that job is already in `jobs`. A recurring `7d` search run daily
  would re-charge for the same overlapping jobs every single day. The actor's own docs recommend
  running at a consistent time daily/weekly specifically to avoid this — a `24h` window run once a
  day naturally covers "since roughly the last run" without re-scanning the full week each time.
  Our own `(source, external_id)` hard dedupe (`services/discovery/ingest.ts:83-86`) is a backstop
  against accidental overlap, not the primary cost control — the time-window choice is.
- **Mechanism (Apify Schedule vs. external cron) left open, not decided here** — noted so it isn't
  silently assumed either way in a future session.

## D-135 — Two free quality flags added to the standing Apify search: `populateAiRemoteLocation` / `populateAiRemoteLocationDerived` (2026-08-08, night)
Sakshi confirmed both. No cost, no downside identified — they backfill `ai_remote_location`/
`ai_remote_location_derived` from geocoded `locations_derived` data only when the AI field would
otherwise be empty. This is the same field D-121 credited with catching the Kira/China
remote-but-region-locked case LinkedIn's own metadata got wrong, so keeping it populated matters.
- **Also flagged, not yet actioned:** LinkedIn's own fixed `org_linkedin_industry` field (a real
  closed taxonomy, unlike the AI's free-text `domain` field that produced 26 unique values for 31
  jobs) is likely the right fix for the industry-filter problem raised earlier this session — Sakshi
  confirmed the direction ("yes use LinkedIn own fixed real industry taxonomy") but this needs actual
  schema/mapping work, not something to fold into tonight's run. Revisit as its own task.

## D-136 — Senior-titled jobs get a new, cheap "remote-only" check; D-133's skip stays in force for the full pipeline (2026-08-09)
Sakshi's call, in chat, after looking at the live dashboard and noticing senior-titled jobs sitting
as unexplained "Pending": *"the junior titles are the ones that I actually care about, so for that,
all the classification steps should happen for the senior titles. The remote should be assessed,
but it can be queued. If, after the apify run, we still have quota left, the pending tasks run."*
- **Narrower than D-133's rejected "reorder" alternative, not a reversal of it.** D-133 explicitly
  rejected "enrich everything but reorder junior-first" in favor of skipping senior titles outright.
  This does NOT reopen that — skills/salary/`recommend` (the full verdict) stay skipped for senior
  titles, unchanged. Only ONE cheap field (remote status, the same `remote_type`/`geo_explicit`
  enum `classify` already produces) gets a standalone AI call for senior titles, run strictly AFTER
  the full junior pipeline completes for the day, using whatever quota remains.
- **Why this matters, concretely:** confirmed live before building this — 3 senior-titled jobs
  (CodeRound AI, Pocket FM, Danaher) came through Apify's own `aiWorkArrangementFilter` (Remote
  OK/Remote Solely) as on-site anyway. For junior titles, `classify` independently catches this
  (D-121's whole point — never trust the source's remote tag blindly). For senior titles, nothing
  did, because `classify` never runs on them at all under D-133. This closes that specific gap.
- **New stage `remote_check`** (`lib/enrich/remoteCheck.ts`), modeled on `geo_recheck`'s narrowness
  (3-key output vs. classify's ~17) but NOT dependent on a prior `classify` row — there isn't one
  for senior titles — so it reads the job row directly, like `classify` does. Reuses
  `job_enrichments.remote_type`/`geo_explicit` (classify's own columns) rather than parallel ones,
  so the two stages' outputs are directly comparable. One new column: `remote_check_reasoning`.
- **Fully separate orchestration path**, not a 6th stage in `enrichJob`'s `ORDER` loop.
  `runRemoteCheckJob`/`enrichRemoteCheckPending` (`lib/enrich/pipeline.ts`) mirror
  `enrichJob`/`enrichPending` structurally but are never invoked by the junior pipeline. Rejected
  alternative: folding `remote_check` into `ORDER` behind a per-job title check — rejected because
  it would make `enrichJob` implicitly branch on title again, exactly the coupling D-133 was written
  to keep out of it. Verified after building: `ORDER` is unchanged and `remote_check` is excluded
  from it (regression-tested, `tests/enrich.test.ts`).
- **New view `v_remote_check_pending`** (`supabase/migrations/0007_remote_check_stage.sql`), the
  Priority-2 sibling of `v_enrich_pending`. Unlike the junior pipeline (which reruns all 5 stages on
  every retry regardless of prior success), this is a run-once check — a senior job with an active
  `remote_check` row is excluded from re-selection. Extracted D-133's junior-title regex into a
  shared SQL function `is_junior_title()` so both views draw from one predicate instead of a
  hand-maintained inverse copy (the exact class of drift bug D-132 already found once, applied
  preemptively here rather than waited on). Verified live against the real data immediately after
  applying the migration: `v_enrich_pending` = 0, `v_remote_check_pending` = 33 — exactly the
  "Pending 33" figure from the dashboard banner, confirming this was the whole conflation.
- **No quota predictor — this was a deliberate choice, not an omission.** Priority 2
  (`enrichRemoteCheckPending`) runs strictly after Priority 1 (`enrichPending`) in the same
  `npm run enrich -- --all` invocation (`scripts/run-enrich.ts`) and simply attempts jobs in order
  until quota runs out, relying entirely on existing D-99/D-101 retry/parking mechanics — a job that
  doesn't get to run today just stays pending for tomorrow's run, same as everything else in this
  pipeline already works.
- **Real gap found and closed while building this: Groq had no daily-quota detection at all.**
  Gemini's short-circuit (`isDailyQuotaError`/`markExhausted`, D-111/D-118, `lib/ai/keyPool.ts`) was
  never extended to Groq, which has been the sole provider since D-132 and has its own binding daily
  limit — tokens-per-day, not requests-per-day (D-127: ~100,000 TPD, ~43 jobs/day at classify's
  token cost). Confirmed in code before writing anything: `lib/ai/groq.ts` called
  `callOpenAICompatible` directly and never touched `keyPool.ts`. Without closing this, Priority 2
  would have burned a full 3-retry backoff cycle on every remaining senior job once the day's Groq
  budget was spent, instead of stopping. Fixed with a Groq-specific module
  (`lib/ai/groqQuota.ts`) — deliberately separate from `keyPool.ts`, since Groq's single-key,
  tokens-per-day shape is structurally different from Gemini's multi-key,
  requests-per-day-per-project shape — matched on the literal TPD error text from D-127's live 429,
  not a guess. `enrichRemoteCheckPending`'s loop checks it after every job and stops cleanly, rather
  than predicting remaining budget in advance.
- **Verified end-to-end against live data**, not just typechecked: applied the migration, ran
  `remote_check` on a real senior-titled job (Flexiple, "Product Manager") — wrote a real
  `remote_type`/`geo_explicit`/`remote_check_reasoning` row via Groq, recorded `ai_usage`, and the
  job dropped out of `v_remote_check_pending` immediately after. Ran the batch path
  (`enrichRemoteCheckPending(2)`) against 2 more real jobs to confirm the orchestration loop itself
  (not just the single-job function) — queue count moved 33 → 30 as expected.

## D-137 — `curious_coder` removed completely; the removal exposed a dead-wired webhook (2026-08-09 ~evening)
Sakshi: *"remove curious coder completely"*, followed by the constraint that shaped the execution
order — *"Don't delete anything until you confirm the new code works."*
- **Decision:** `curious_coder/linkedin-jobs-scraper` is gone from the codebase — `mapApifyItem`
  deleted from `lib/discovery/apify.ts`, the `'curious-coder'` entry removed from `MAPPERS` in
  `scripts/run-ingest.ts`, and `apify/task-config.md` rewritten against the actor actually in use.
  D-121 retired the actor two days ago; it was never actually removed.
- **The finding that made this more than cleanup: `services/discovery/webhook.ts` was still calling
  `mapApifyItem`.** This is the live endpoint Apify POSTs to when a scheduled run finishes. D-121
  switched the actor but never updated this file. The two payloads share **no** field names
  (`id`/`organization`/`title`/`url`/`description_text` vs.
  `jobId`/`companyName`/`jobTitle`/`jobUrl`/`descriptionHtml`), and `mapApifyItem` returns `null`
  when it finds no id — so a real fantastic-jobs delivery would have mapped **every item to null,
  ingested zero jobs, and returned HTTP 200**. Dormant only because D-134's schedule was never built,
  so nothing has ever POSTed there for real. **This is the same silent-success failure shape D-121
  itself exists to record** — a source reporting success while returning nothing usable — reproduced
  one layer down, in the code written to consume the fix.
- **Execution order was Sakshi's constraint, and it caught a real error.** Everything was added and
  proven green *before* anything was deleted: new fixture → ported tests → webhook fix → full verify
  → only then the deletions. During deletion, `pick()` was removed as "used only by `mapApifyItem`" —
  wrong, `mapFantasticJobsItem` calls it as `pick<string>(...)`, which the earlier `grep "pick("`
  had missed. The typecheck caught it immediately because the working state was already established.
  Had the deletion gone first, that failure would have been tangled up with the port.
- **Test coverage was ported, not dropped.** All four discovery tests ran through `mapApifyItem` +
  a curious_coder-shaped fixture. New `tests/fixtures/sample-fantastic-jobs.json` (field names copied
  from `samples/fantastic-jobs-remote-india.json`, per D-121's verify-against-a-real-run rule).
  Net **+2 tests**: the epoch-ms passthrough check became an ISO passthrough check *plus* a
  `date_posted`→`date_created` fallback case the mapper implemented but nothing tested, and a new
  no-`id`-no-`linkedin_id`→`null` guard covering D-8's dedup precondition.
- **Options considered:**
  - *Keep `mapApifyItem` as a fallback for re-ingesting historical curious_coder runs* — **rejected,
    and the webhook is the argument.** An unused second path is exactly what let that endpoint sit
    wrong for six sessions without anyone noticing. The retained capability was hypothetical; the
    rot was real. Accepted loss: old curious_coder-shaped files/runs can no longer be re-ingested.
    Nothing live depended on it.
  - *Collapse `MAPPERS` to a direct call now that it has one entry* — rejected: D-121's explicit
    design point is that the mapper is **chosen deliberately, never sniffed from the payload**, and
    a second source (ATS pollers, remote-native boards) sits in D-121's own rejected-options list as
    "worth doing, not rejected". The map is the shape that keeps the next source honest.
  - *Delete first, then fix what breaks* — rejected on Sakshi's instruction, and vindicated by the
    `pick()` error above.
  - *Also delete `tests/fixtures/sample-linkedin.json`* — not done. Harmless on disk and it documents
    the old shape; removing it is a separate call.
- **Verified:** `npm run typecheck` clean; discovery tests 9/9; enrich tests unchanged and green;
  `grep` for `mapApifyItem`/`curious` in live source returns only the explanatory comments. And
  **proven with real data, not just types** — `npm run ingest -- --file
  samples/fantastic-jobs-remote-india.json` returned `received: 10, duplicates: 10`, i.e. all 10 real
  records mapped and none lost to null (under the old mapper `received` would have been 0). This
  exercises the exact record shape the webhook receives.
- **Left explicitly out of scope:** `.claude/worktrees/sad-booth-957bb2/` (a stale worktree copy with
  its own older versions of all these files — not live code); and the `date_valid_through` /
  job-expiration question surfaced separately this session, which is its own decision.

## D-138 — Clean-slate reset: hard delete (not soft-exclude), Remote Solely narrowed at source as a TEMPORARY proving step, `timeRange: "6m"` (2026-08-09, later evening)
Sakshi: *"delete everything, let us start from scratch, causing too much confusion."* Database held
three generations of mixed data — 88 jobs soft-dropped from the retired curious_coder actor (D-132),
45 live jobs of which only 14 carried any AI enrichment, plus a mid-flight 30-job remote-check queue.
Every dashboard number was a blend; no figure meant one thing.

- **Decision: hard delete, not D-132's soft-exclusion precedent.** `truncate` on
  `job_feedback, ai_usage, job_enrichments, enrich_runs, job_events, processed_runs,
  remote_companies, jobs` (FK-safe order, `cascade`). `company_watchlist` excluded — separate table
  (D-44), empty anyway. **Why this reverses D-132's precedent:** the soft-delete is *itself* the
  mechanism behind an unfixed bug — `lib/discovery/dedup.ts`'s canonical-linking never filters
  `dropped_reason`, so a new job matching a hidden job's (company, title) silently inherits a pointer
  to it and vanishes from the enrich queue with no error (D-132 already hit this once: 9 of the first
  10 new jobs). Measured this session: **93 distinct company+title pairs** in the current data would
  each be a landmine for a re-ingest under soft-delete. A hard delete removes every one. D-132's
  reason for choosing soft-delete — preserving ~190 AI calls of paid classification — barely applies
  here (only 14 of 45 live jobs carry any enrichment), so the tradeoff that justified soft-delete
  originally no longer holds at this scale.
- **`remote_companies` included in the delete — see D-139 for why this went beyond "her call."**
- **Decision: narrow the Apify search to `aiWorkArrangementFilter: ["Remote Solely"]` for this run —
  explicitly TEMPORARY, reversing Session 26's dismissal of the same narrowing.** Sakshi: *"for now
  let us use actors… once we have proved our system works, and the actor cost isn't much, we can take
  in all pm jobs that come in."* Phase 1 (this run): narrow at source to produce a small,
  high-confidence set to prove the pipeline end-to-end. Phase 2 (later, explicitly the return path,
  not a new idea): widen back to all PM jobs, letting Sakshi's own AI judge — which **is D-126's
  original design**. Marking this temporary matters because narrowing at source means a third party's
  model decides what Sakshi never sees, which is precisely what she rejected in D-126 for
  seniority-filtering (*"who is assessing the drop?"*) — left unmarked, a future session could read
  this as a reversal of that principle rather than a proving step.
- **Phase 2's real constraint is AI quota, not Apify spend** — Apify is ~$0.005/job (D-132), and
  D-105 already established scraping cost was never binding. Groq is sole provider, no fallback
  (D-132), ~43 jobs/day real ceiling (D-127). D-136 still spends one AI call per senior-titled job for
  the remote check, so widening ingest raises AI cost close to linearly. Decide Phase 2's timing on
  AI budget, not on this decision's Apify numbers.
- **`timeRange: "6m"`, not D-126's `"7d"`** — Sakshi's call, to give the freshly emptied database a
  real starting population rather than one week. **Checked a stale claim before adopting it:**
  `plans.md:1911` says an earlier `"6m"` run returned only 10 jobs "because of an artifact of `6m`
  only returning still-active postings." That does not hold up against the same document's own next
  step (plain `"7d"` also hit exactly 10) or against `decisions.md` D-132 (the authoritative record),
  which attributes the entire "always exactly 10" symptom to the missing `limit` parameter, with no
  `6m`-specific behavior mentioned anywhere. Treating the `plans.md` note as a superseded
  mid-investigation guess, never corrected — `limit: 150` is set this run, so there is no reason to
  expect the same symptom.
- **`limit: 150`, `removeAgency: false`, both populate flags** — unchanged from D-126/D-132/D-135;
  `limit` is load-bearing given the `"6m"` caveat above. **Amended to `limit: 500` — see D-146.**
- **Options considered:** keep soft-delete and fix `dedup.ts` first — rejected for this run
  specifically (not for the codebase generally, see D-139's follow-up note): a hard delete removes
  every row the bug could collide with, so fixing the bug first would add a step to a session whose
  point is reducing confusion, for a bug this particular delete makes moot. The fix is still owed the
  next time anything is soft-dropped.
- **Not done, deliberately:** the recurring Apify Schedule (Sakshi: *"don't do a schedule yet"* —
  also recorded directly in `apify/task-config.md` §3 and `session-summary.md`'s next steps, since a
  decided cadence sitting next to a next-steps list reads like a green light otherwise). `linkCanonical`'s
  `dropped_reason` fix. `date_valid_through` mapping (open question, see Session 28 summary).
- **Status: truncate EXECUTED 2026-08-09 (see D-146/D-147 for amendments made before it ran — `limit:
  500` not `150`, `titleSearch` expanded).** `jobs`, `job_enrichments`, `job_events`, `ai_usage`,
  `enrich_runs`, `processed_runs`, `remote_companies` all confirmed 0 rows post-truncate.
  `company_watchlist` re-verified empty (0) immediately before truncating, not assumed — it was
  excluded as planned. Backups created first and confirmed intact: `jobs_backup_20260809` (133),
  `job_enrichments_backup_20260809` (524), `remote_companies_backup_20260809` (82). Full plan at
  `~/.claude/plans/session-26-priority-2-serialized-lark.md`, also copied into `plans.md`.
- **Status: RESET COMPLETE 2026-08-09.** Apify run triggered via browser (Claude in Chrome, Sakshi's
  logged-in console session — no API/MCP tool for this existed, drove the console UI directly), run
  ID `zsQWxBqXxwHc5e6ge`. **Succeeded: 52 results, $0.27, 3 seconds** — empirically confirms Sakshi's
  own prediction that jobs would stay well under 150 even with the cap raised to 500 (D-146).
  Ingested cleanly (52 received, 52 inserted, 0 duplicates, 0 dropped). Enriched: 5 junior-titled jobs
  through the full pipeline, 47 senior-titled jobs through `remote_check` — the split itself confirms
  D-147's title expansion worked, this batch skews heavily toward the newly-added senior terms.
  Dashboard rebuilt: 52 jobs, 32 companies, 29 remote companies tracked. **First real validation of
  this session's whole fix chain on live data:** all 29 fresh `remote_companies` rows have
  `evidence_seniority` set (100%, vs. 0% on the old pre-fix 82) — D-142's gating fix and D-144's
  seniority snapshot both confirmed working, not just passing an empty-data sanity check.

## D-139 — `remote_companies` catalog found structurally unverified: 91% never AI-confirmed remote; root cause is `confirmRemoteCompany` firing before verification exists (2026-08-09, later evening)
Sakshi's stated reason for wanting the catalog deleted: *"most of the jobs that I'm seeing there are
not remote jobs."* Checked live rather than taken on faith.
- **Measured:** of 82 companies in `remote_companies`, **30 (37%) were confirmed only via jobs from
  the retired curious_coder actor** — the actor D-121 proved returned 0 of 51 real postings as
  genuinely remote. **75 of 82 (91%) have never had a job actually AI-confirmed as `remote_type =
  'remote_india'`** by `classify` or `remote_check`. Only 4 have another job at the same company
  explicitly confirmed on-site — the 91% figure, not the 4, is the real scale of the problem, because
  most of these jobs were simply never classified at all (senior titles are excluded from `classify`
  by D-133, and many junior jobs remain unclassified).
- **Root cause: not just old data, a structural timing gap.** `confirmRemoteCompany`
  (`lib/discovery/remoteCompanies.ts:26`) is called from `services/discovery/ingest.ts:96` for **any
  job that survives ingest** — it does not check `remote_type` at all, and structurally cannot: `npm
  run ingest` and `npm run enrich` are separate scripts, and `remote_type` is not computed until
  `enrich` runs, which is always later. "Confirmed" in this table has never meant "my AI verified this
  is remote" — only "a job with this company survived ingest's weak location-string pre-filter,"
  which is exactly the kind of third-party/heuristic trust D-121 and D-126 both moved the *main*
  pipeline away from. The catalog's confirmation logic never got the same fix.
- **Consequence for D-138's fresh run, left as an open question rather than silently fixed:** without
  changing `confirmRemoteCompany`'s timing, the Remote Solely run will repopulate the catalog the
  exact same unverified way — a smaller number of rows, equally untrustworthy. Whether to fix this
  before or after D-138's run is explicitly unresolved; Sakshi asked to wrap the session before
  answering.
- **Direction agreed, not yet built:** move the confirmation call to fire after `classify`/
  `remote_check` sets `remote_type = 'remote_india'`, not at ingest. Not implemented this session.
- **Options considered:** leave the ingest-time gating and just re-run it on cleaner search input —
  rejected, since the gating bug applies regardless of how clean the search input is; a job the search
  lets through still isn't AI-verified remote just because it survived ingest.

## D-140 — Remote-company tracker redesigned as a permanent archive, decoupled from live job state — not a live-state dashboard (2026-08-09, later evening)
Raised by Sakshi as a new tab: *"track companies that are remote, so that if these companies have any
APM roles, I can reach out to them for internships or send my portfolio."* Design went through two
wrong drafts before the real shape emerged.
- **Draft 1 (rejected in conversation):** company list joined live to `jobs`, split into "has a
  current opening" vs. "no current opening," with a role-title/seniority-fit column. Wrong on two
  counts, both caught by Sakshi's own follow-up questions: (a) the seniority-fit column was added by
  Claude via pattern-reuse from the main dashboard's existing bucket filter, not because she asked for
  it — conceded and dropped once she asked "why do I need this?" (b) a company with a currently open
  *junior* role would land in this tab too, duplicating what the main dashboard already shows as an
  individual AI-evaluated job card.
- **Draft 2 (also superseded):** restrict the tab to companies with NO current opening only — treats
  "is a role open" as the organizing filter, just inverted. Sakshi's actual framing reverses this
  entirely: *"this is going to be a permanent database... I want all companies to be there... an APM
  role which is active now may not be active later, after a week, but I will lose that data that this
  company was remote."*
- **Decision: the tab is a durable record of every AI-confirmed remote company, full stop — not
  filtered by current job-open state at all.** Main view has no live join to `jobs`: company name,
  first/most-recently confirmed dates, the evidence posting (historical proof, not current status).
  Junior/senior becomes an **optional, off-by-default filter** — a secondary lens, not the page's
  organizing principle. This is close to `remote_companies`' own original D-44 intent
  ("confirmed once, no commitment, never re-derived"); the live-join designs were Claude overbuilding
  relative to what she actually described.
- **Real gap found and agreed, not yet built:** `remote_companies` never captures recruiter contact
  info, even though `jobs.recruiter_name`/`recruiter_linkedin`/`recruiter_email`/`hiring_manager`
  exist. For a permanent record meant to support outreach, this needs to be **snapshotted onto the
  catalog record at confirmation time**, not fetched live from `jobs` — a live join is the wrong shape
  for a record that's supposed to survive `jobs` rows being dropped or (as in D-138) truncated
  entirely.
- **This tab's trustworthiness now depends on D-139's fix.** A permanent archive of unverified
  "remote" companies is worse than no archive — it would look authoritative while being wrong 91% of
  the time. Building this tab before D-139 is fixed would just give the same bad data a nicer home.
- **Not yet decided:** (a) single-snapshot evidence (current `confirmRemoteCompany` behavior —
  overwrites on every reconfirmation) vs. a full evidence history — the original 0004 migration
  explicitly rejected a history table as more structure than the catalog needs; Sakshi's "don't lose
  data" framing this session may argue the other way, but she has not been asked this directly yet.
  (b) Build timing — asked directly, dismissed without an answer.
- **Not started:** no schema changes, no new code, no dashboard tab. Design only.

  **Resolved same session, see D-141 (evidence model) and D-142 (build timing + location).**

## D-141 — Remote-company evidence model resolved: single snapshot, not a history table (2026-08-09)
Closes D-140's open item (a). Asked directly this session: single snapshot (current
`confirmRemoteCompany` behavior — `evidence_url`/`evidence_note`/`last_confirmed_at` overwritten on
every reconfirmation) or a full evidence history (every confirming posting kept, not just the
latest).
- **Decision: single snapshot.** Matches the original 0004 migration's reasoning ("a multi-evidence
  child table was considered and rejected as more structure than a 'which companies hire remote'
  catalog needs") and needed no new schema beyond D-142's recruiter-contact/seniority columns.
- **What "don't lose data" ends up meaning instead:** recruiter contact is now coalesced, not
  overwritten (`lib/discovery/remoteCompanies.ts`) — a later confirming job with no contact info
  can't erase one a previous job supplied. That is the concrete answer to the "don't lose data"
  framing that raised this question, without needing a full history table.
- **Options considered:** full evidence history — rejected; nothing in this session's stated use
  case (outreach to companies with proven remote hiring) needs more than the latest confirming
  posting plus first/last-confirmed dates.

## D-142 — `confirmRemoteCompany`'s gating fixed before the reset; remote-company tracker built as a
tab inside `dashboard-live.html`, reversing D-115 for that file (2026-08-09)
Closes D-139's and D-140's remaining open items (fix-timing and build-timing/location).
- **Decision: fixed the gating first, before running D-138's reset.** Sakshi's call: the reset's
  purpose (proving the job pipeline end-to-end) doesn't depend on `remote_companies` at all, and a
  fix landing after the reset would just repopulate the freshly emptied catalog the same unverified
  way. Implemented: `confirmRemoteCompany` no longer fires at ingest (`services/discovery/
  ingest.ts`); it fires from `classify`/`remote_check` only when `remote_type === 'remote_india'`
  is actually known (`lib/enrich/classify.ts`, `lib/enrich/remoteCheck.ts`).
- **Decision: the tracker is a tab inside `dashboard-live.html`, not a separate file.** Real
  conflict surfaced and put to Sakshi directly: D-115 deliberately kept recruiter/hiring-manager
  contact out of this exact file because it "might get shared," and D-140's tracker exists
  specifically to carry recruiter contact for outreach. Sakshi chose the single-file tab anyway.
  **This explicitly reverses D-115's premise for `dashboard-live.html`** — the file now contains
  third-party PII and can no longer be shared casually. Mitigation: a visible on-page banner on the
  Remote Companies tab stating this plainly, not just a code comment.
- **New column, not previously scoped: `evidence_seniority`.** D-140's optional junior/senior filter
  had no mechanism to work off, since the tracker deliberately has no live join to `jobs`. Snapshotted
  at confirmation time instead: bucketed from `years_experience_min` when confirmed via `classify`
  (`fit`/`stretch`/`senior`, same buckets the Jobs tab already uses — extracted into a shared
  `bucketExperience()` in `lib/enrich/experience.ts` so the two can't drift apart), or always
  `'senior'` when confirmed via `remote_check` (which D-133/D-136 already gate to senior titles
  only). A company with no derivable bucket is never hidden by the filter — same "absent is not
  negative" rule as everywhere else in this pipeline.
- **Loose end found and resolved, not silently:** `scripts/run-backfill-remote-companies.ts` called
  `confirmRemoteCompany` with the same broken ingest-time semantics this decision fixes, and would
  not compile against the new signature. Deleted (with its `backfill:remote-companies` package.json
  entry) rather than updated — its purpose was superseded by D-138's reset plus the now-automatic,
  correct confirmation flow. Sakshi confirmed after asking for the tradeoff explained in full.
- **Options considered:** a separate `tracker-live.html` file, keeping `dashboard-live.html`
  PII-free — this was the recommended option, rejected by Sakshi in favor of one file.

## D-143 — RLS enabled on all 15 `public` tables, no policies yet (2026-08-09)
Sakshi: *"Change RLS now."* Supabase's own advisor flagged RLS-disabled as critical — with it off,
the anon key can read or write every row in every table.
- **Checked before acting, not assumed:** nothing in this codebase currently uses the anon key.
  `lib/db.ts` uses only the service-role key (bypasses RLS by design) in every script (`ingest`,
  `enrich`, `dashboard`). `SUPABASE_ANON_KEY` exists in `.env.example`/`lib/config.ts` purely as a
  placeholder for D-110's future browser-facing dashboard — unused today. This makes enabling RLS
  with zero policies safe immediately: nothing currently running depends on anon access, and the
  default with RLS on + no policies is "anon gets nothing," which is the safe direction.
- **Decision: enable now, no policies.** `supabase/migrations/0009_enable_rls.sql` — one `alter table
  ... enable row level security` per table. Applied via Supabase MCP to `gwvrpdkiblozwdwoqsgd`.
  Policy design deferred to when D-110's real dashboard actually needs anon access — matches D-115's
  existing plan, which already gated that dashboard behind sorting RLS out first.
- **Verified:** `get_advisors` re-run post-migration — the `rls_disabled` (critical) finding is gone,
  replaced by `rls_enabled_no_policy` (informational, expected). `npm run dashboard` re-run
  successfully post-migration, confirming service-role scripts are unaffected.
- **New findings surfaced by the same advisor check, NOT acted on — flagging, not fixing silently:**
  6 views (`v_enrich_parked`, `v_enrich_pending`, `v_remote_check_pending`, `v_jobs_enriched`,
  `v_company_rollup`, `v_freshness`, `v_ai_cost`) are `SECURITY DEFINER` (ERROR level — these run with
  the view creator's permissions, not the querying user's, which matters more now that RLS is on).
  `is_junior_title` has a mutable `search_path` (WARN level). Neither was in scope for "change RLS
  now" and neither is fixed by this migration — real decisions of their own, for a separate pass.
- **Options considered:** designing real read policies now (e.g. a recruiter-PII-safe public view)
  instead of enabling with none — rejected for this pass; no anon consumer exists yet to design
  policies against, and D-115 already established that policy design should wait for D-110's actual
  requirements rather than being guessed at in advance.

## D-144 — Remote Companies tab: nav relabeled, Industry + Hiring status filters added (build-time
join, not stored), salary snapshotted when stated (2026-08-09)
Four small follow-ups from the same feedback thread, landed together.
- **Nav relabeled "Seniority" → "Role level".** Sakshi caught a real ambiguity: "Fit" (my first
  proposal) collides with `computeRecommendation`'s unrelated background-match "fit" elsewhere in
  this codebase, and even ignoring that, reads as a holistic judgment call rather than what's
  actually bucketed (the confirming job's title-level seniority). "Role level" names the mechanism
  precisely. Internal identifiers (`evidence_seniority`, `SENIORITY_LABEL`, `senioritySet`) kept
  as-is — display-label-only change.
- **Hiring status + Industry filters — confirmed NOT a D-140 reversal, after an initial
  overcorrection.** I first read "add a hiring-status filter" as reversing D-140 (which rejected
  organizing the whole tab around open/no-opening, twice). Sakshi corrected this: an optional,
  off-by-default filter chip — same shape as the existing seniority filter — never restructures the
  tab or its default view, which is what D-140 actually rejected. Landed as designed: computed
  **at build time only**, in `scripts/build-dashboard.ts`, from the already-fetched `jobs` array —
  nothing is written to `remote_companies` for this, so the archive table itself stays exactly as
  D-140 specified (no live coupling, survives `jobs` being truncated). "Currently hiring" = at least
  one job for that `company_slug` with `link_status` not in `(closed, expired, not_found)` — unknown
  counts as still-open, the same absent-isn't-negative rule used everywhere else in this project.
  Industry reuses the Jobs tab's own domain-chip pattern; a company with no domain data is never
  hidden by an active Industry filter, matching the seniority filter's own never-hide-unknown rule.
- **Salary snapshotted onto the archive, when stated.** Not an AI call — `lib/enrich/salary.ts`'s
  `parseSalary()` is a deterministic regex parser (D-12), already running on every job in the junior
  pipeline. `runSalary` now checks the job's already-written `classify` row for
  `remote_type === 'remote_india'` (same gating D-139 established) and, only when
  `salary_status === 'stated'`, calls `confirmRemoteCompany` again with the figure — idempotent,
  since `classify` already created the row moments earlier in the same `enrichJob()` run. New
  columns: `evidence_salary_min/max/currency/period` (migration `0010`), coalesced on write like
  recruiter contact — a later job with no stated figure can't erase one already captured. Senior-
  titled companies (confirmed via `remote_check`) never get a salary snapshot, since that stage sits
  outside `ORDER` and `salary` never runs for them — expected, consistent with D-133's junior/senior
  split, not a new gap.
- **Bug fixed in passing:** `confirmRemoteCompany`'s `evidence_seniority` field was being overwritten
  unconditionally on every call, not coalesced like the recruiter-contact fields already were. Once
  `salary.ts` started calling `confirmRemoteCompany` a second time for the same job (after
  `classify.ts`'s first call), an un-coalesced `evidence_seniority` would have been silently nulled
  out on every classify-then-salary pair. Fixed to coalesce, matching every other field's semantics.
- **Careers-page lookup — explicitly deferred, not built.** Sakshi's call: a real search-API lookup
  is v2/v3 work. `evidence_url` stays what it already is (the job posting link, often just LinkedIn),
  not repurposed as a careers-page stand-in. Confirmed this is NOT a good AI-call candidate even for
  v2/v3 framing purposes: generating a guessed URL risks hallucinating a link that doesn't exist,
  worse than no link for an outreach tool — the real fix is a genuine search lookup, not generation.
- **Verified:** typecheck clean (caught and fixed two real bugs along the way — a stray backtick
  inside a JS comment embedded in the outer TS template literal broke the whole `<script>` block;
  and the same `.select()` string-concatenation gotcha from D-142's session recurred and was fixed
  the same way, single-line literal). Migration `0010` applied to `gwvrpdkiblozwdwoqsgd`, columns
  confirmed. `npm run dashboard` rebuilt against real data; verified interactively in-browser — Role
  level label renders, Hiring status/Industry chips show correct counts (34 hiring / 48 not, of 82),
  clicking "No current opening" narrows 82→48 exactly matching its own count, Industry chip narrows
  correctly. Salary chips: zero present on current data, expected — all 82 companies predate this
  session's confirmation-gating fix (D-142), so none have been through the new salary-snapshot path
  yet; will start appearing as new `classify` runs confirm companies going forward.

## D-145 — Fixed the two findings D-143's RLS check surfaced: 7 views set to `security_invoker`, one
function's search_path pinned (2026-08-09)
Sakshi: *"help me do rls"*, asked to confirm scope first since "RLS" could mean either finishing this
or designing real anon-access policies — she confirmed finishing this.
- **Correction to D-143: it said "6 views," the actual advisor output lists 7** —
  `v_enrich_parked`, `v_enrich_pending`, `v_remote_check_pending`, `v_jobs_enriched`,
  `v_company_rollup`, `v_freshness`, `v_ai_cost`. None of their `create view` statements set
  `security_invoker`, so Postgres ran them as the view owner (definer-style), ignoring the querying
  role's RLS — harmless while only the service-role key (bypasses RLS regardless) ever queries this
  database, but a real gap once an anon-key caller exists. Fixed with `alter view ... set
  (security_invoker = true)` per view — a property flip, no view body changes, Postgres 17 supports
  it natively.
- **`is_junior_title(role_title text)`'s mutable search_path pinned to empty.** Checked its body
  first (`supabase/migrations/0007_remote_check_stage.sql`): a pure SQL immutable function, one regex
  match against its own parameter, no table or unqualified-object references — safe to pin.
- **Migration** `supabase/migrations/0011_security_definer_views_and_search_path.sql`, applied to
  `gwvrpdkiblozwdwoqsgd`.
- **Verified:** `get_advisors` re-run — both `security_definer_view` and
  `function_search_path_mutable` findings gone, only the expected informational
  `rls_enabled_no_policy` entries remain. `npm run dashboard` re-run successfully. Direct counts on
  the three affected views post-migration: `v_enrich_pending` 0, `v_remote_check_pending` 30,
  `v_jobs_enriched` 44 — all sane, nothing broke.
- **Not done, still deferred:** real RLS policies for anon access — same reasoning as D-143, no anon
  consumer exists yet to design against.

## D-146 — D-138's reset run amended: `limit: 500`, not `150`, diagnostic; a periodic "cleanup run"
concept designed (not built) as the real alternative to D-45's stalled re-fetch mechanism; recurring
schedule stays explicitly deferred (2026-08-09)
Three related threads, same conversation.
- **`limit: 500`, amended from D-138's `150`.** Sakshi: *"I don't think at any time jobs are going to
  be more than 150, we can check the number of jobs that come in right now with 6m run... for current
  run do not limit to 150 keep it to 500, let us see what happens."* Diagnostic, not a belief that
  500 will actually be needed — the point is measuring the real population size in a 6-month window
  rather than continuing to assume `150` is close to binding. Cost stays trivial regardless (worst
  case ~500 × $0.005/job ≈ $2.50, per D-132/D-105's already-established "never binding" finding).
  `plans.md`'s Session 28 plan JSON updated in place; D-138's own `limit: 150` line annotated with a
  pointer to this entry rather than rewritten.
- **A periodic "cleanup run" concept, designed this session, not built:** re-run the SAME bulk-search
  Apify actor call (not per-posting URL fetches) on a schedule — Sakshi's proposal was every 30 days,
  `timeRange: "6m"`. This is a materially better answer to "is a job still open?" than D-45's original
  mechanism, which stalled specifically because individually re-fetching posting URLs is "its own
  scraping-adjacent subsystem with its own ToS/anti-bot questions" (D-45, never built). Reusing the
  existing bulk-search call sidesteps that entirely — same actor, same query shape, already-accepted
  ToS posture, just repeated. Mechanically: `jobs.last_checked_at` already gets bumped on every
  reappearance (`ingest.ts`'s duplicate-handling branch, pre-existing code) — a job still inside the
  6-month window whose `last_checked_at` does NOT get refreshed by a cleanup run becomes the "likely
  closed" candidate signal. A 6-month window against a 30-day cadence was chosen specifically to keep
  most genuinely-still-open jobs well inside the window between cycles, avoiding the dominant
  false-positive source in the earlier, rejected "naive" version of this idea (aging out of a narrow
  `timeRange` mistaken for closure).
- **Real design questions surfaced, explicitly NOT decided yet:** (a) one missed cleanup cycle = closed,
  or require several consecutive misses to guard against a `limit`/ranking-truncation blip; (b) where
  the result gets written — a new column, or finally activating the long-dead `link_status` (D-45)
  now that a real detection mechanism would exist behind it. Neither picked; flagged for their own
  decision when this actually gets built.
- **Schedule stays deferred — confirmed, not reversed.** Sakshi: *"yes we will do a schedule later."*
  Both the recurring ingest cadence (D-134, `"don't do a schedule yet"`) and this new cleanup-run idea
  need an actual Apify Schedule or cron to run for real — neither is being set up now. This session's
  output on the cleanup idea is a design, not a build.
- **Options considered:** naive "missing from any run = closed" — rejected earlier in this same
  conversation (see the exchange preceding this decision): timeRange dominates absence for anything
  that ages out of a narrow window, which would mislabel most still-open postings as closed. The
  6-month-window/30-day-cadence version was proposed specifically to avoid that failure mode.

## D-147 — `titleSearch` expanded with 5 full-form title variants; corrects a wrong claim in D-126
about "Director" already being covered (2026-08-09)
Sakshi asked whether "Director PM," "Lead PM," "SPM" would be caught — checked empirically rather
than assumed, and found a real, previously-uncaught gap plus a factual error in this project's own
prior reasoning.
- **The mechanism, confirmed against real sample data:** `titleSearch` terms match by phrase/substring
  containment against the job title (D-126), not exact-title lookup. "Senior Product Manager,"
  "Principal Product Manager," "Group Product Manager," "Staff Product Manager," and "Associate
  Product Manager" are all already caught for free — every one of them literally contains "Product
  Manager." Verified against `samples/*.json`: 3 real "Associate Product Manager" records present
  despite that exact phrase never being a search term.
- **Correction: `apify/task-config.md` (D-126's own text) claimed "Director" variants were already
  covered by phrase matching — they were not.** "Director of Product Management" contains "Product
  Management," not "Product Manager" — same word-mismatch gap "Product Intern" already had before it
  got its own explicit term. Nobody had checked this specific claim until now.
- **Decision: add 5 explicit full-form terms, no abbreviations.** `"Product Management Trainee"`
  (entry-level gap — neither "Product Management" nor "Trainee" matches an existing term),
  `"Director of Product Management"` (also catches "Senior Director of Product Management," since it
  still contains the phrase), `"VP of Product"`, `"Head of Product"`, `"Chief Product Officer"`.
  Researched the standard PM career ladder first (Associate → PM → Senior/Principal/Group/Staff →
  Director → VP/Head → CPO) to make sure nothing else in the hierarchy was missing — see sources
  below.
- **Bare abbreviations explicitly rejected — "SPM," "Lead PM," "Director PM," "APM" all considered
  and left out.** Two different reasons: (a) "APM" — Sakshi checked real postings directly and
  confirmed the abbreviated form always appears alongside "Associate Product Manager" spelled out in
  full too, so the existing phrase match already covers it, no separate term needed. (b) "SPM"/"Lead
  PM"/"Director PM" — genuine gaps, same mechanism as "APM," but bare acronyms carry real collision
  risk against unrelated domains (e.g. "APM" = Application Performance Monitoring, a whole DevOps/IT
  job category with real titles like "APM Engineer"). Full forms carry none of that risk.
- **Why senior coverage matters at all, despite D-133 excluding senior titles from AI enrichment:**
  Sakshi's own framing — this isn't for her application funnel, it's for the remote-company tracker
  (D-140). `remote_check` (D-136) already runs on senior-titled jobs specifically to confirm
  `remote_type`, and that confirmation feeds `remote_companies`. A remote VP/Head of Product/CPO
  posting is still real evidence the company hires remote product roles generally — valuable for
  outreach even though Sakshi wouldn't personally apply to that specific opening. Chief Product
  Officer was nearly left out on rarity grounds alone; Sakshi's own point (the same logic that
  justified VP/Head of Product applies equally to CPO) is what settled it.
- **Applied to both `plans.md`'s D-138 reset config and the standing `apify/task-config.md` template**
  — the expansion is a general coverage fix, not specific to the one-time reset.
- **Options considered:** bare 2-letter "PM" as a catch-all — rejected outright, far too broad a
  substring for a title-level match, worse collision risk than even "APM."

## D-148 — Jobs tab now shows junior-titled postings only; senior-titled jobs (permanently
"Pending," per D-133) no longer clutter it, but still feed the Remote Companies tracker (2026-08-09)
Sakshi, after the reset run skewed 47-of-52 senior thanks to D-147's own title expansion: *"I don't
want any pending jobs which are senior to be in the job scout dashboard."*
- **Root cause: a senior-titled job's "Pending" is not the same fact as a junior job's "Pending."**
  D-133 excludes senior titles from `classify`/`recommend` entirely — they can never get a
  Yes/Maybe/Probably-not verdict, ever. A junior job showing "Pending" just hasn't been enriched
  yet. On screen these looked identical, which is exactly what triggered the question in the first
  place (D-138's reset run this session: 47 of 52 jobs sat as Pending with no way to tell why).
- **Fix: `v_jobs_enriched` now exposes `is_junior_title(role_title)` as a column** (migration `0012`)
  — reuses the exact SQL predicate D-133 already gates the enrich pipeline with, rather than
  re-implementing the regex a second time (the same "one predicate" reasoning `is_junior_title()`
  was originally extracted for, D-136). `scripts/build-dashboard.ts` filters its Jobs-tab rendering
  (`jobsForDisplay`) to `is_junior_title === true`; every Jobs-tab-derived value (verdict counts,
  company grouping, experience/industry filter chips, the detail-pane blob) now reads from that
  filtered set instead of the full one.
- **Deliberately NOT dropped from the database or hidden from the Remote Companies tab.** The
  unfiltered `jobs` array is still used for `jobInfoByCompanySlug` (the Hiring status/Industry
  signals, D-144) — senior-titled jobs are exactly what's driving most of the tracker's 29 confirmed
  companies this run, so excluding them there would gut the feature this fix is protecting.
- **Verified:** rebuilt against real post-reset data — Jobs tab dropped from 52 to 5 (all real
  junior-titled jobs with actual verdicts: 3 Maybe, 2 Probably not, 0 Pending), Remote Companies tab
  unaffected at 29. Confirmed visually in-browser, not just via the build log.

## D-149 — Reason-before-classify prompt redesign scoped and approved — NOT YET IMPLEMENTED
(2026-08-10)
Grew out of the "Remote OK" investigation (D-146/D-147's follow-up): after finding 2 confirmed wrong
`remote_check` verdicts (Danaher, Equinix — both have explicit "remote" language in the real JD, our
AI called them `other` anyway), checked WHY rather than just re-running the check. Found a real
mechanism: `classifyPrompt`'s single `reasoning` key is listed LAST in the JSON schema, after every
verdict field. Since JSON generates left-to-right, the model commits to each verdict BEFORE writing
any justification — closer to post-hoc rationalization than real reasoning.
- **Decision: reason-before-verdict ordering, split into 7 separate reasoning fields, all named
  explicitly by Sakshi** — `remote_type`, `is_technical`, `technical_depth`, `is_ai`,
  `business_model`, `domain`, `background_match` each get their own reasoning key immediately before
  them, worded to require quoting/naming the specific JD signal rather than a vague sentence. Same
  reorder applied to `remoteCheckPrompt` (the actual prompt that produced the Danaher/Equinix misses)
  and `geoRecheckPrompt` (already has `geo_verdict_reasoning`, just needs the key moved first).
- **Cost estimate corrected before deciding, not after.** First pass claimed "roughly doubles" the
  token cost — wrong, and corrected when Sakshi pushed back rather than defended: a real classify
  call is ~1,880 prompt + 273 completion tokens; 6 more ~15-token reasoning fields add ~90-140
  tokens, roughly **5-6% more total tokens per call**, not a doubling. The original estimate only
  looked at completion tokens in isolation and ignored that the prompt (JD text, rubric, candidate
  background) already dominates the per-call token count.
- **Scope confirmed as all 7 fields, not a narrower remote_type-only start** — Sakshi's call, once
  the corrected (small) cost was on the table. The narrower option was offered and explicitly not
  taken.
- **Status: designed and scoped, zero code written.** No migration, no prompt file changes, no
  `writeEnrichment` wiring. New columns still needed: `remote_type_reasoning`,
  `is_technical_reasoning`, `technical_depth_reasoning`, `is_ai_reasoning`,
  `business_model_reasoning`, `domain_reasoning`, `background_match_reasoning` on `job_enrichments`.
  `CLASSIFIER_VERSION` needs bumping (`v4` → `v6`, skipping `v5` since that label is already used
  descriptively in `lib/ai/prompts.ts`'s comment history for a wording-only change that never
  actually bumped the exported const). Full design in `plans.md` / the session's plan file.
- **Also can't be verified even once built until tomorrow** — today's Groq daily TPD quota is
  exhausted (used up by this session's own "Remote OK" diagnostic probe, D-146/D-147's follow-up).
  Real end-to-end verification (one classify call, confirm all 7 columns populate with real, citing
  reasoning) has to wait for the next quota reset.

## D-150 — `RemoteType`'s third value renamed from `'other'` to `'not_remote'` — FULLY COMPLETE (code, DB, xlsx, worktree cleanup) as of 2026-08-13, later same day
(2026-08-13; status amended same day — see final bullet)
Sakshi asked, while reading the Excel golden-dataset Legend explanation, why the not-remote bucket of
`remote_type` is called `'other'` rather than something that names what it actually is.

- **The problem.** `RemoteType = 'remote_india' | 'remote_global' | 'other'` ([lib/types.ts:10](lib/types.ts:10)).
  The first two values both start with `remote_`, so `'other'` reads like a third flavor of remote
  rather than what it actually means per the rubric: `"other" = on-site or hybrid; the role requires
  attending a workplace.` Checked `decisions.md` for a prior rationale before recommending anything
  (per this project's own CLAUDE.md rule) — found none. D-121/D-129 touch `'other'` only as something
  to classify correctly, never as a label worth choosing deliberately; D-132's own diagnostic text
  paraphrases it as "on-site" rather than using the value name, which is itself a tell that the name
  doesn't explain itself. Concluded this was inherited, not decided — same pattern as
  `learning_inherited_not_decided`.
- **Decision: rename to `'not_remote'`.**
- **Alternative considered: `'on_site'`.** Rejected — the bucket also catches hybrid roles per the
  rubric text above, and `on_site` would misdescribe a hybrid job caught in this bucket. `not_remote`
  is accurate for both on-site and hybrid, and reads as a clean three-way split alongside
  `remote_india` / `remote_global` rather than a leftover "everything else" catch-all.
- **Scope: rename everywhere the literal value appears** — `lib/types.ts`'s `RemoteType` union,
  `classifyPrompt` and `remoteCheckPrompt`'s rubric text in `lib/ai/prompts.ts`, any DB
  constraint/default in `supabase/migrations/*.sql`, runtime comparisons in `lib/`/`services/`/
  `scripts/` (including `notify`'s hard-gate filter, per the reference at
  [decisions.md:1472](decisions.md:1472)), test fixtures in `tests/*.test.ts`, seed data, and the
  golden dataset (`samples/golden-dataset/golden-dataset-template.xlsx` — both the `Golden Dataset`
  sheet's data and any rubric-description text in the `Legend` sheet).
- **Status: code and xlsx done; DB migration written but not yet applied.** An Explore agent
  enumerated every reference site first. Renamed in: `lib/types.ts:10` (`RemoteType` union, comment
  added citing D-150), `lib/ai/prompts.ts` (rubric text in both `classifyPrompt` and
  `remoteCheckPrompt`; `PROMPT_VERSION` bumped `prompt-2026-08-08` → `prompt-2026-08-13`,
  `CLASSIFIER_VERSION` unchanged — wording-only, per this file's own versioning convention),
  `lib/ai/AIService.ts` (both `classifySchema` and `remoteCheckSchema`'s fail-open `.catch()`
  defaults — `business_model`'s separate `'other'` at the same file left untouched, different field),
  `scripts/build-dashboard.ts` (lines 91, 289, 380 — comparison, count, and rendered HTML string).
  Checked `tests/*.test.ts`, `seed/*.json`, and the golden-dataset xlsx (`Golden Dataset` + `Legend`
  sheets) — none reference the literal `'other'` value, nothing to change there. `services/notify`'s
  hard gate ([lib/telegram.ts:64](lib/telegram.ts:64), `services/notify/notify.ts:31`) is implemented
  as a positive allowlist on `remote_india`, not an exclusion of `'other'`/`'remote_global'` — no
  edit needed there either.
  **DB migration** (`supabase/migrations/0013_remote_type_not_remote_rename.sql`) is written —
  confirmed the real constraint name (`job_enrichments_remote_type_check`) and exact affected-row
  count (3 rows had `remote_type = 'other'`) against the live `gwvrpdkiblozwdwoqsgd` project before
  writing it, per this project's exact-counts-before-destructive-ops practice — but applying it was
  blocked by the harness's own permission classifier (a live-DB write needs direct approval separate
  from chat approval). **Not yet applied — pending Sakshi running/approving it.**
  A stray git worktree at `.claude/worktrees/sad-booth-957bb2/` holds duplicate copies of the renamed
  files (same base commit as `main`, one uncommitted `package.json` change, branch
  `claude/sad-booth-957bb2`) — left untouched; looks like leftover scaffolding from a prior
  `isolation: worktree` agent run, not active work, but not deleted without Sakshi's say-so.
  Historical prose in `decisions.md` (D-121, D-123, the D-129/D-131-area session note) and
  `session-summary.md:2563` citing `remote_type = 'other'` as what the AI actually returned at the
  time was deliberately left unchanged, per Sakshi's explicit instruction — those are accurate
  records of what happened, not current state.
- **Amendment (2026-08-13, later same day) — fully applied and closed.** Verified against the real
  repo/DB before touching anything (the file/migration state above came from a parallel session
  already, not redone). Three things completed:
  1. **Stray worktree cleared.** `.claude/worktrees/sad-booth-957bb2/` confirmed safe to remove
     first — same base commit as `main` (no unique commits on `claude/sad-booth-957bb2`), only
     uncommitted change was a trivial one-line `package.json` script fix. Removed via
     `git worktree remove --force` + `git branch -D`.
  2. **Migration 0013 applied to the live DB** (`gwvrpdkiblozwdwoqsgd`) — but the checked-in file as
     written would have failed: it backfilled rows to `'not_remote'` *before* dropping the old CHECK
     constraint, which still only allowed `'other'` at that point, so the `UPDATE` violates the
     constraint. Caught on first apply attempt (`23514` constraint violation), fixed the ordering
     (drop constraint → update → add new constraint) both live and in the committed
     `supabase/migrations/0013_remote_type_not_remote_rename.sql`. Re-confirmed row count (3) both
     immediately before and after applying. Live DB now shows `remote_type` grouped as
     `remote_global: 2, remote_india: 47, not_remote: 3, null: 17` — rename fully reflected in
     production data.
  3. **Golden-dataset xlsx** already had no literal `'other'` references (confirmed by the parallel
     session, re-confirmed here) — nothing further needed there.

## D-151 — Before any DB reset/clear, export real AI-failure evidence first; never let it be destroyed with the rest of the data (2026-08-13)
Direct consequence of trying to build 3 golden-set rows from real production cases (Kira/BJAK,
Danaher, Equinix) and finding the underlying JD text for 2 of them permanently gone. D-138's
clean-slate reset (hard delete, Session 30, 2026-08-09) wiped `jobs`/`job_enrichments` — including
the only two confirmed AI misclassification cases (Danaher, Equinix) that directly motivated D-149's
prompt redesign. The one-off Excel export that had captured their full JD text (Session 30) was never
saved anywhere durable — it only existed wherever it landed after being sent to Sakshi, and wasn't
checked into the repo or otherwise preserved. Confirmed via live query against `gwvrpdkiblozwdwoqsgd`
(zero rows for either company) and a repo-wide file search (no trace of the export) before concluding
it was actually gone, not just unfound.
- **The cost, concretely:** a real, already-diagnosed AI failure — the exact evidence that justified
  D-149's redesign — can no longer be used to *verify* D-149 actually fixes what it was built to fix.
  The best available fallback is a synthetic case reconstructing the failure pattern from what
  survived in prose (see the synthetic-data discussion this session), which is weaker evidence than
  the real thing would have been.
- **Decision: before any future DB clear/reset/truncate (D-138-style or otherwise), any row where
  `job_enrichments` shows AI disagreement against a manually-verified real answer must be exported
  first** — full `jd_text` plus the enrichment columns (`remote_type`, `geo_explicit`, `reasoning`,
  etc.) — into something that survives the reset: a committed file under `samples/` or directly into
  `tests/golden/` rows, not a one-off chat deliverable that depends on where it happens to get saved.
  This is not optional cleanup — these rows are the raw material `tests/golden/` (D-71/D-149) is
  supposed to be built from, and once deleted they cannot be reconstructed from documentation alone
  (prose captures the story, not the exact text a grading rubric needs).
  **Scope: only rows with a confirmed or suspected AI failure** — this is not a blanket "never delete
  anything" rule, and does not conflict with D-138's reset itself (bulk data with no known
  disagreement is fine to hard-delete; a full historical archive of every job ever seen was never the
  ask and isn't now).
- **Applies retroactively as a lesson, not just forward:** the 4 other inconclusive cases from the
  same 2026-08-10 audit (Pocket FM, EOK Gems, Netomi — and CodeRound AI from a related but separate
  probe) are likely gone too, for the same reason; not re-verified individually since the fix here is
  procedural (export before reset), not a recovery effort for cases already lost.

## D-152 — Golden-dataset xlsx gets an automated "Summary" sheet computing pass-rate metrics from the raw PASS/FAIL grading columns (2026-08-13)
Grew directly out of walking through what metrics apply to `samples/golden-dataset/golden-dataset-template.xlsx`
(D-71/D-149's still-unbuilt eval) — Sakshi asked to automate the aggregation inside the spreadsheet
itself rather than count by hand each time a `pass_fail_prompt-{version}` column gets filled in.
- **Decision: added a new "Summary" sheet to the existing xlsx**, driven entirely by live formulas
  (`COUNTIFS`/`COUNTIF`) reading `'Golden Dataset'!A2:S500` — no macros, no external script needed to
  refresh it. Computes, per prompt-version pair (`2026-08-08`, `2026-08-11` today; any future
  `actual_prompt-*`/`pass_fail_prompt-*` pair the same way): overall pass rate, graded-case count,
  false-negative rate and false-positive rate (grouped by the existing `severity` column), pass rate
  broken out by `field_under_test`, by `input_pattern`, and by `root_cause`, and a before/after
  comparison row pairing both existing prompt versions' overall pass rate and false-negative rate.
  Also added Excel data-validation dropdowns (`PASS`/`FAIL`) to the `pass_fail_prompt-*` columns
  (down to row 500, so future rows inherit it), since none existed before and the formulas depend on
  exact-match text.
- **Options considered — full precision/recall/F1 + confusion matrix + MAE for every field type,
  rejected for this pass:** the sheet currently has only 3 real rows, all testing `remote_type`
  (categorical) — no rows yet test `technical_depth`/`years_experience` (which would need MAE, not
  pass/fail) or list fields like `skills`/`background_match` (which would need set-based
  precision/recall). Building formulas against fields with zero real rows would mean guessing at a
  layout instead of matching real data; deferred until such rows exist. A full categorical confusion
  matrix (cross-tabbing the *actual* predicted class in `P`/`R` against `expected_value`, not just
  PASS/FAIL) was also identified as useful and technically buildable now — offered as a follow-up,
  not built this session, since it wasn't in the approved plan.
- **Why plain COUNTIFS formulas instead of a PivotTable:** formulas recalculate automatically on any
  edit with zero manual refresh step, survive being read by `pandas`/scripted tooling later (a Pivot
  is UI-state, not portable data), and this environment's LibreOffice-based verification pipeline
  cannot reliably evaluate spilling/dynamic functions (`UNIQUE`, `XLOOKUP`) — confirmed unusable per
  the `xlsx` skill's own documented LibreOffice-function-support gaps, so the list of unique
  `field_under_test`/`input_pattern`/`root_cause` values was built once in Python at write-time
  instead of live in-sheet.
- **Verification status: COMPLETE (2026-08-13, later same day).** LibreOffice installed
  (`brew install --cask libreoffice`; first attempt silently failed on a partial download despite
  reporting exit 0 — retried and succeeded). `recalc.py` first run caught a real bug: the
  per-`field_under_test`/`input_pattern`/`root_cause` `COUNTIFS` formulas had range/criteria arguments
  incorrectly paired (`COUNTIFS(rangeA,rangeB,criteriaA,criteriaB)` instead of the required
  `COUNTIFS(rangeA,criteriaA,rangeB,criteriaB)`), producing 8 `#VALUE!` errors. Fixed, re-verified
  clean (`total_errors: 0`, 20 formulas). Smoke test (`Q2=PASS`, `Q3`/`Q4=FAIL`) confirmed every
  number by hand — pass rate 1/3, false-negative rate 2/3, per-tag breakdowns all correct, zero-
  denominator cells degrade to `0` rather than erroring — then reverted back to blank.
- **Follow-up built same day: case-level detail table, not a full confusion matrix.** Sakshi asked
  for the previously-offered "what wrong answer was given" view. A full N×N confusion matrix was
  judged too sparse to be useful at 3 rows; built instead as a table (not a single column, since
  showing a mismatch needs the expected value and the actual value side by side) mirroring
  `case_id`/`field_under_test`/`expected_value`/`actual`/`pass_fail` per prompt version for up to 100
  rows (comfortable headroom over the planned 20-30 case set), with conditional formatting turning
  FAIL cells red. Verified the same way — recalc clean, smoke-tested (`GC-002` correctly showed
  expected `remote_india` vs. actual `remote_global`; `GC-003` showed expected `remote_india` vs.
  actual `not_remote`), reverted after.

## D-153 — Golden eval will run on the current (baseline) prompt first, before D-149's reasoning-redesign ships (2026-08-13)
Sakshi confirmed the sequencing recommendation raised earlier this session.
- **Decision: run `classify`/`remoteCheckPrompt` against the golden set on the current prompt
  version first** (no reasoning-before-verdict reorder yet) to get a baseline per-field accuracy and
  false-negative-rate number, **then** implement D-149's redesign and rerun the same fixtures to
  measure the delta directly.
- **Why, and what was rejected:** building D-149 first and only ever running one eval pass against it
  was considered and rejected — D-149 is a hypothesis about *why* classify fails (reasoning committed
  before verdict), not a proven fix; skipping the baseline means there would be no way to confirm the
  redesign actually improved accuracy versus just moving the error somewhere else, or to know how much
  of classify's error the redesign actually explains. The golden xlsx's paired
  `actual_prompt-{version}`/`pass_fail_prompt-{version}` columns (D-71/D-152) were already built for
  exactly this before/after comparison, which was the more concrete reason to sequence baseline-first
  rather than a purely theoretical one.
- **Still blocked on the same underlying gap:** this decision governs *order*, not readiness — the
  eval still can't actually run yet, since `tests/golden/fixtures.ts` + `tests/golden/run.ts` (D-71)
  remain unbuilt. This decision applies the moment that harness exists.

## D-154 — Golden-dataset prompt-version column naming convention: `<slug>_<CLASSIFIER_VERSION>_<PROMPT_VERSION>` (2026-08-13)
The `actual_prompt-{date}`/`pass_fail_prompt-{date}` column pair D-152 built for the before/after
comparison had hand-typed calendar dates (`2026-08-08`, `2026-08-11`) that were never derived from
code. Both turned out wrong: `2026-08-11` never corresponded to any real `PROMPT_VERSION` that ever
shipped (it was a placeholder guess for D-149's still-unbuilt redesign), and `2026-08-08` — the
column meant to represent "the current baseline" — had itself gone stale, since `PROMPT_VERSION` in
`lib/ai/prompts.ts` had already moved on to `prompt-2026-08-13` (D-150's `remote_type` rename)
by the time this was caught.
- **Decision: column labels follow `<slug>_<CLASSIFIER_VERSION>_<PROMPT_VERSION>`**, where `<slug>` is
  a short human name for what changed (e.g. `baseline`, `reasoningredesign`) and
  `<CLASSIFIER_VERSION>`/`<PROMPT_VERSION>` are pasted **verbatim from the live code constants** in
  `lib/ai/prompts.ts` — never retyped, guessed, or pre-dated. Applied immediately: the baseline column
  is now `baseline_v4_prompt-2026-08-13` (today's real constants); the second column is
  `reasoningredesign_TBD_TBD` (both halves stay `TBD` until D-149 actually ships and the real constants
  can be copied in).
- **Rule that prevents this recurring: a column is only created or renamed at the moment the eval is
  about to run against that version** — not written speculatively ahead of the code shipping. Both
  prior mistakes were speculative labels written before the thing they named was real.
- **Why both version constants, not just one:** `PROMPT_VERSION` (wording/rubric changes) is the axis
  that actually varies for D-149's comparison — `CLASSIFIER_VERSION` (output-contract/schema changes)
  would read `v4` in both columns today and add no information for *this* comparison. It's included
  anyway so the convention doesn't have to be re-decided the day a future comparison spans a
  schema-changing version too.
- **What was rejected:** a bare calendar date (the original design) — proven fragile twice in one
  session, since a hand-typed date is a second, independent copy of a fact the code already owns and
  can silently drift from it. Also rejected: the informal `v5`/`v6` labels used in `prompts.ts`'s own
  comments — confirmed these are **not real exported values**, only prose in comments for a human
  reading git history (the file's own comment notes v5 was "skipped as an exported const"); nothing
  programmatic can reference them, so they can't anchor a naming convention.
- **Verification: recalc clean** (`total_errors: 0`, 723 formulas) after both the initial relabel pass
  and this final convention pass — 20 label cells changed across `Golden Dataset` (header row) and
  `Summary` (five table-label rows, the before/after comparison row, and the case-detail table
  headers), zero formulas touched since all of D-152's `COUNTIFS` reference columns by letter, not by
  the label text.

## D-155 — Recruiter contact data in `dashboard-live.html` is fine to commit to git; repo should be private regardless (2026-08-13)
Raised as an open question by Claude while checking whether the two dashboards (`dashboard-mock.html`,
`dashboard-live.html`) could be committed to GitHub. D-142 had already reversed D-115 to let recruiter
PII into this file but left "is it OK to actually publish this" unaddressed.
- **Decision: the recruiter contact fields (`recruiter_name`, `recruiter_email`, `recruiter_linkedin`,
  `hiring_manager`) are fine to commit.** Checked their actual source before deciding: `recruiter_name`/
  `recruiter_email`/`hiring_manager` are extracted from the job description text itself (an "extract if
  explicitly present" AI field, [lib/ai/prompts.ts:76](lib/ai/prompts.ts:76)) — i.e. contact info the
  recruiter/company already published in a public job posting so applicants could reach out.
  `recruiter_linkedin` comes from Apify's `recruiter_url`
  ([lib/discovery/apify.ts:57](lib/discovery/apify.ts:57)), LinkedIn's own public "Job poster" field
  visible to any visitor. None of it is scraped from a private profile or a connections-only view.
  Sakshi's framing: data brokers (Lusha, Apollo, RocketReach, Hunter.io) run entire businesses on
  exactly this pattern — aggregating public job-poster/profile data into a searchable record. That
  model is legally *tolerated*, not fully settled (Lusha specifically has drawn GDPR
  complaints/fines in the EU) — but the thing that draws scrutiny is commercial scale (millions of
  records, sold to third parties), not a personal repo with a few dozen contacts gathered for one
  person's own job search.
- **Decision: the GitHub repo hosting this should be private anyway**, independent of the PII call.
  Reasoning is aggregation, not legality: individual disclosure (one recruiter's email on one job ad)
  and a compiled, Google-indexable page listing every recruiter's contact info in one place are not
  the same act, even when every underlying fact was public. Private costs nothing — Vercel deploys
  private and public repos identically on the free/Hobby tier, no feature loss — so there's no reason
  to accept the wider exposure.
- **Not yet decided:** whether `dashboard-mock.html`/`dashboard-live.html` (as static files) or the
  real D-110 Next.js app is what actually gets committed/hosted first — see D-110's still-open
  `v_jobs_public`/RLS-policy prerequisite (D-115, D-143), which static-file commits don't touch but
  the real Next.js-on-Vercel dashboard still needs before going live.

  **Resolved same session by D-156** (real Next.js app, both tabs, PII public at the live URL).

## D-156 — The real D-110 Next.js app is what gets hosted, not the static snapshot; both tabs ship in v1 with recruiter PII publicly reachable at the live URL (2026-08-14, early hours)
Closes the open item D-155 left. Sakshi asked to "get the app up"; three paths were put to her.
- **Decision (a): build the real thing, not a fast static deploy.** Options rejected: (1) deploying
  `dashboard-live.html` to Vercel as-is — fastest (minutes), but it is explicitly a throwaway
  generator (D-119, and `scripts/build-dashboard.ts`'s own header says so), goes stale until the
  script is re-run by hand, and would have made the snapshot the de-facto product; (2) the same
  static deploy with recruiter fields scrubbed from the rendered output — same staleness problem plus
  a second divergent copy of the render logic to maintain.
- **Decision (b), the genuinely new call: both tabs ship in v1, recruiter contact info included and
  publicly reachable by anyone with the URL.** This is *not* covered by D-155, which decided only
  that the PII could sit in a **private git repo** — a public Vercel URL is a materially different
  exposure (Vercel Hobby deployments are world-readable by default, no login), and the aggregation
  argument D-155 used to justify keeping the repo private applies at least as strongly to an
  indexable public page. Sakshi was shown that distinction explicitly and chose both-tabs-public
  anyway. **Options rejected by her:** Jobs tab only for v1 (was the recommendation — `v_jobs_public`
  excludes recruiter columns entirely, so a Jobs-only app has no PII surface at all, and the tracker
  could stay local until it earned its own decision); and both tabs with the Remote Companies route
  behind a password gate.
- **Consequence to be aware of:** the on-page PII banner (D-142's mitigation, written for a local
  file) now sits on a public web page. It warns the *viewer*, which is not the same as protecting the
  recruiters named on it.

## D-157 — `v_jobs_public` built, closing D-115; a second, undocumented copy of recruiter PII found in `job_enrichments.raw_output`; defense-in-depth grant design chosen and applied (2026-08-14, early hours)
D-115 has been open since 2026-08-07. D-156 made it blocking, so it was built.
- **Built and live:** `v_jobs_public` (`supabase/migrations/0015_public_dashboard_access.sql`,
  applied to `gwvrpdkiblozwdwoqsgd`) — same joins, filters and coalescing as `v_jobs_enriched`
  (D-98's canonical path, D-112's `unknown`/`not_evaluated`, D-148's `is_junior_title`) with the four
  recruiter/hiring-manager columns removed. **The column list is enumerated explicitly rather than
  `j.*`** — that implicit widening is precisely how D-115 happened, and an enumerated list means a
  future column added to `jobs` cannot silently join the public surface. `remote_companies` got a
  SELECT-only anon policy with no view and no column filtering, per D-156. Verified: anon holds
  `SELECT` and nothing else on both surfaces; `v_jobs_public` returns 52 jobs (5 junior-titled),
  `remote_companies` 29 rows.
- **Found while verifying, not previously known:** Supabase provisions `grant all on all tables in
  schema public to anon` by default, so **every table and view in this project already carries
  anon INSERT/UPDATE/DELETE/TRUNCATE grants** — including the brand-new view, the moment it was
  created. RLS default-deny (D-143/D-145) neutralises this on base tables, which is why nothing has
  leaked, but it means "no policy exists" has been the *only* thing standing between anon and write
  access this whole time. Write grants were explicitly revoked on both new surfaces rather than
  assumed harmless because a join view "isn't updatable."
- **Second PII copy found — new, and documented nowhere:** `job_enrichments.raw_output` (jsonb)
  stores the verbatim AI response, and the classify prompt's output contract
  (`lib/ai/prompts.ts:76,89`) includes `recruiter_name`, `recruiter_email` and `hiring_manager`.
  **So recruiter contact data exists in two places, not one** — `jobs`' four columns (which D-115,
  D-142 and D-155 all reason about) and this jsonb blob (which none of them mention). Nothing is
  exposed today, since anon cannot read `job_enrichments` at all. The risk is future: any change that
  grants anon table-level access "because the view is safe" would leak it silently.
- **Decision: defense in depth, chosen by Sakshi and applied.** `v_jobs_public` runs
  `security_invoker = true` (matching D-145, which hardened all 7 existing views out of definer mode
  — a definer-mode 8th was the first attempt and the Supabase advisor correctly flagged it
  ERROR-level). Invoker mode requires the querying role to reach the base tables itself, so anon also
  gets SELECT policies on `jobs`/`job_enrichments` scoped to the same rows the view exposes, plus
  **column-level** grants that omit the four recruiter columns *and* `raw_output`. Net effect: even a
  direct `/rest/v1/jobs` request cannot return PII. **Verified after applying:** zero PII columns
  appear in anon's column privileges; the `security_definer_view` ERROR is gone; `jobs` and
  `job_enrichments` no longer appear in the `rls_enabled_no_policy` list.
- **Option rejected:** stay on the definer-mode view. It worked and leaked nothing, and the advisor
  ERROR could have been documented as deliberate — but it contradicted D-145's own precedent, and it
  left the newly-found `raw_output` copy protected by exactly one control. The deciding argument was
  that the failure mode is silent: a future change granting anon table access "because the view is
  safe" would expose recruiter data with no error and no warning.
- **Process note worth keeping:** the first attempt at this migration was **blocked by the permission
  classifier** (broad `revoke all` / `grant` statements). It was not re-attempted in smaller slices —
  slicing to slip past the check would defeat the block's purpose — but put to Sakshi in plain
  language instead, and applied once she approved. The block was a reasonable place to stop.

## D-158 — 12 happy-path rows added to `golden-dataset-template.xlsx` (GC-004–015), sourced from real DB jobs, two rows explicitly flagged as unconfirmed (2026-08-14)
The golden dataset's 3 existing rows (GC-001–003) are all diagnosed *failure* cases — nothing in the
set would catch a future prompt change breaking the easy, unambiguous case. Discussed with Sakshi what
"happy path" means for this project and how to source it.
- **Decision: pulled 3 real jobs `classify` has already run against** from `job-tracker`
  (`gwvrpdkiblozwdwoqsgd`, via `v_jobs_enriched` filtered to `classify_status='evaluated'`,
  `needs_review=false`, confidence ≥0.8) rather than writing synthetic JDs — only **5 jobs total** have
  ever been classify-evaluated, so "random" here means picked for diversity out of a pool of 5, not a
  large sample. Chosen: Interview Kickstart (explicit geo, technical, AI-skills-required), Cloud
  Security Web (explicit geo, non-technical, product genuinely AI-centered — a cleaner is_ai contrast
  to Interview Kickstart's borderline case), Ethos (silent-on-geography, tests the fail-open default
  itself, not just a field value).
- **One assertion per Tier-1 field, reusing the same JD** (the "one input, many assertions" pattern
  confirmed against DeepEval/Pydantic Evals/Promptfoo docs earlier this session): `remote_type`,
  `geo_explicit`, `is_ai`, `technical_depth`/`is_technical` — 12 rows total across 3 postings, each
  tagged `input_pattern_status`/`root_cause_status = not_applicable`, `source = real_prod_case`.
- **Two rows explicitly flagged, not silently trusted as ground truth** — GC-006 (`is_ai=ai` for
  Interview Kickstart: the *product* isn't AI-centered, only the *role's required skills* are — a
  borderline read of the rubric's own wording) and GC-012 (`technical_depth=2` for Cloud Security Web:
  its "Preferred: SQL, dashboard creation" reads closer to the rubric's own depth-3 example than
  depth-2). Marked "FLAGGED, NOT YET CONFIRMED" in `why_this_test_exists` rather than treated as
  settled — a golden dataset's value depends entirely on `expected_value` being actually correct, not
  merely plausible, and these two are genuine judgment calls the AI's own field values happened to
  land on, not independently human-verified from scratch.
- **What was rejected:** hand-writing synthetic JDs for the happy-path rows — real, already-classified
  jobs are faster to verify (you're checking an existing verdict, not authoring a new scenario from
  nothing) and more representative of what the pipeline actually sees.
- **Still open:** Sakshi's explicit sign-off on GC-006 and GC-012 before they count as confirmed
  baselines rather than flagged edge cases.

## D-159 — `input_pattern` gets a two-tier family/specific structure (both `ip_`-prefixed); Golden Dataset sheet fully reordered into logical column groups (2026-08-14)
Sakshi found the existing `input_pattern` slugs (`geo_metadata_contradiction`,
`awkward_explicit_confirmation`) unclear standalone, and separately asked for the sheet's columns to be
rearranged so related fields sit together — done together since adding a new column made a full reorder
the natural moment to do both, and doing it now (before any real eval run) meant testing and fixing
formula breakage was low-stakes.
- **Decision: new `input_pattern_family` column** (short, structured umbrella — e.g.
  `ip_location_conflict`) sits alongside the existing `input_pattern` (renamed to fuller, self-
  explanatory slugs — e.g. `ip_location_field_contradicts_jd_text`), both `ip_`-prefixed so either
  value is self-identifying if quoted out of context (a filter, a chart legend) without its column
  header traveling with it. `root_cause` (`reasoning_after_verdict`) stays exactly as-is — Sakshi was
  fine with it, and it was already the clearest of the three original slugs (it names a mechanism, not
  just a symptom).
- **Golden Dataset sheet fully reordered into 9 logical groups** (Identity → Input → Test target incl.
  `severity` moved up next to `expected_value`, since it's about the consequence of *this* assertion,
  not provenance → Grading → Tags-input-pattern → Tags-root-cause → Tags-other (`source`) →
  Documentation → Results), 20 columns total (was 19; `input_pattern_family` is new). Every `Summary`
  sheet formula (pass-rate, false-negative/positive rate, per-field/per-pattern/per-root-cause
  breakdowns, before/after comparison, 100-row case-detail table + its conditional formatting) rebuilt
  against the new column letters. Added a new "Pass rate by `input_pattern_family`" rollup section —
  the whole reason the family tier exists.
- **Failure Categories and Legend sheets updated to match**: two new sections (family values, then
  specific values each noting which family they belong to), stale unprefixed duplicate rows removed.
- **Two real bugs found and fixed during this pass, not just cosmetic changes:**
  1. LibreOffice's resave (via `recalc.py`) silently converts boolean-literal cells into formula text
     (`=TRUE()`/`=FALSE()`) — hit on the 3 new `geo_explicit` rows' `expected_value` cells. Confirmed
     cosmetic only (cached value still reads correctly as `True`/`False`), but worth knowing this
     happens on every recalc pass in this environment.
  2. A genuine bug in the verification script itself: `openpyxl`'s `ws.cell(row, col, value=None)`
     treats `value=None` as "no value passed" and silently no-ops rather than clearing the cell
     (confirmed from its source — it only assigns when `value is not None`). This meant an early
     "revert the smoke test" pass appeared to succeed but left stale `PASS`/`FAIL` values in place,
     undetected until a manual re-check. Fixed by using direct `cell.value = None` attribute
     assignment instead. See `learnings.md`.
- **Verification: full smoke test performed as requested** — set 7 `PASS`/`FAIL` values, recalculated,
  hand-checked all 8 affected Summary numbers against the raw data (all matched, including catching an
  arithmetic error in the hand-check itself, not the sheet), then genuinely reverted and re-confirmed
  zero state. `recalc.py` reports `total_errors: 0` across 727 formulas in the final state.
- **What was rejected:** appending the new column at the end instead of inserting it in logical
  position — this was the plan for the earlier, smaller version-naming fix (D-154), but Sakshi
  explicitly asked for a real reorder this time, and the "first run" framing (nothing live depends on
  column position yet) made the larger, more disruptive fix worth doing now rather than deferring it.

## D-160 — `actual_prompt-*` columns renamed to `actual_output-*`; `grading_rationale`/`why_this_test_exists` get wrap-text and content-scaled row heights (2026-08-14)
Sakshi flagged two problems while reviewing the reorganized sheet: `actual_prompt-*` reads as "the
prompt that was used," not "the model's output when that prompt ran" — and long prose in
`why_this_test_exists` was overflowing/unreadable.
- **Decision: renamed `actual_prompt-*` → `actual_output-*` and `pass_fail_prompt-*` →
  `pass_fail_output-*`** across the Golden Dataset header row, the Summary sheet's case-detail table
  headers, and the Legend sheet's Results row. The version identifier (`baseline_v4_prompt-2026-08-13`)
  still carries "prompt" in its own name (correctly — it names which prompt version produced the
  output), but the column's own name no longer implies it holds the prompt itself.
- **Enabled `wrap_text=True`** on `grading_rationale` and `why_this_test_exists` (the two long-prose
  columns; `jd_text` deliberately left alone — it's meant to be read by opening the cell, not displayed
  inline, per the Legend's own note that it's "usually the longest cell in the row"). **Row heights
  recomputed per row from actual content length** (75–255pt) rather than the stray, wildly inconsistent
  values that were there before (some rows at the default 15pt, others at 952pt/2084pt from an earlier
  unexplained auto-size). Verified both survive a `recalc.py` pass unchanged.

## D-161 — AMENDS D-157: `v_jobs_public` was unreadable by `anon`; one column grant added (2026-08-14)
Found by the first real anon query rather than by review: the Next.js app loaded and rendered
`Could not load from Supabase — v_jobs_public: permission denied for table jobs`. The public read
surface D-157 built and verified had never actually returned a row to the role it was built for.
- **Cause.** `security_invoker = true` means the view body executes with the *caller's* privileges,
  and the body ends `where j.dropped_reason is null and j.canonical_job_id is null`.
  `dropped_reason` was excluded from anon's column grants as "internal, not needed by the UI" —
  true of the view's *output*, false of its *filter*. Reading a column in a `WHERE` clause needs
  `SELECT` on it exactly as returning it does.
- **Why the D-157 verification missed it.** It checked the privilege *listing* — "zero PII columns
  appear in anon's column privileges" — which is a statement about what is absent. It never issued a
  read as `anon`, so it confirmed the omissions without noticing that one of them was load-bearing.
  Same shape as `learnings.md`'s "read the error, not the docs": the property was reasoned about
  instead of exercised.
- **Fix (`0016_v_jobs_public_dropped_reason_grant.sql`, applied):** `grant select (dropped_reason) on
  jobs to anon`. It discloses nothing — the `jobs_public_read` policy already restricts anon to rows
  where `dropped_reason is null`, so NULL is the only value anon can read from it. Confirmed live:
  `/rest/v1/jobs?select=dropped_reason` returns `[{"dropped_reason":null}]`.
- **Options rejected:** dropping the `WHERE` from the view (changes what service-role readers see;
  the RLS policy only covers anon), and reverting to definer mode (contradicts D-145, re-raises the
  advisor ERROR — the exact option D-157 already rejected).
- **Verified end to end as `anon` this time, not by reading grants:** `v_jobs_public` returns rows
  with zero recruiter keys; `jobs?select=recruiter_email`, `jobs?select=hiring_manager` and
  `job_enrichments?select=raw_output` all return 401 `42501`; `POST /rest/v1/jobs` returns 401.

## D-162 — The D-110 dashboard is built: one stylesheet, one set of formatting rules, three renderers (2026-08-14)
`app/` now exists — a Next.js 16 app reading Supabase from the browser (D-110's shape, unchanged),
porting `dashboard-live.html` behaviour rather than redesigning from it (D-156).
- **`styles/dashboard.css` is now the single home for the CSS**, extracted out of
  `dashboard-mock.html`, which links it instead of carrying it inline. Three things render this
  design — the mock (D-93), the snapshot generator (D-119), and the app — and the snapshot's own
  header already claimed the styling had "exactly one home". Copying it into the app would have made
  that claim false; the alternative (leaving CSS inline in the mock and importing a copy) was
  rejected for that reason.
- **`lib/dashboardFormat.ts` is the same move for presentation logic** — verdict labels, salary
  formatting, `daysAgo`, blockers, the remote/experience buckets and the unimplemented-action copy.
  It returns **data, never markup**, since a helper returning HTML would only be usable by the
  snapshot. `scripts/build-dashboard.ts` was refactored onto it and re-run; the regenerated snapshot
  differs only in timestamps, day counts, `remote_type=other` → `not_remote` (D-150, the committed
  snapshot predates it), and the CSS comment move. No structural change — which is the evidence the
  refactor is behaviour-preserving.
- **The D-142 PII banner was reworded, and this is a content change, not a port.** Its old text said
  the file "should NOT be shared without redacting it first". On a public URL that instruction is
  simply false — the page *is* shared. It now states what the tab contains, where the data comes
  from (public job postings) and that it is publicly reachable, citing D-142 and D-156. This does not
  fix what D-156 flagged: a banner warns the viewer, it does not protect the recruiters named.
- **One deliberate behaviour choice while porting:** when the open job gets filtered away the detail
  pane closes *and stays closed* if the filter is widened again, matching the snapshot's
  `closeJob()`. Deriving the open job from the visible list alone would have silently re-opened it.
- **Defect fixed in passing:** the snapshot's "no description stored" fallback was markup run through
  `esc()`, so it rendered a literal `<em>` on screen. Fixed in both renderers.
- **Known cosmetic defect, NOT fixed, needs a call:** the "Hiring now" tag is `#004440` text on
  `--secondary-c`, which is `#00504c` in dark mode — dark-on-dark and effectively unreadable. It is
  inherited from D-144's styling, predates this session, and now ships on a public page.
