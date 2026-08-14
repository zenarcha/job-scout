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

---

## Session 3 — 2026-07-28 (workspace relocation discovered)

### What happened this session

Discovered mid-session that, between Session 2 and this one, a separate effort (outside any tracked
conversation) restructured the project: `~/Documents/Job Postings` no longer exists; the project now
lives at `~/Documents/ApplicationOS/job-tracker/`, alongside sibling modules `resume-builder/` (live,
own git repo) and `app-os-contracts/` (new, empty). Governed by a `WORKSPACE.md` at the workspace root
with its own decision record. Verified the move was content-neutral: `decisions.md` still ended at
D-28, this file still ended at Session 2, `.env` still had both blocking secrets empty, and job-tracker
was not yet git-initialized — nothing from Session 1–2 was lost or altered.

### Decisions / amendments
D-29 — adopt the new workspace home; flagged (not decided) whether the workspace's contracts-extraction
prerequisite blocks resuming Phase 2 or can run in parallel with pending real-data verification. (Full
detail in `decisions.md`.)

### Next steps (ordered, actionable)
1. Ask Sakshi: does the `@app-os/contracts` extraction prerequisite block Phase 2, or run in parallel
   with real-data verification?
2. Everything from Session 2's next-steps list still applies (verification blocked on `.env` secrets).

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 4 — 2026-08-01 (discovery walkthrough → process gap found and fixed)

### What happened this session

**Explained discovery in depth.** Walked through every discovery-related decision (D-1, D-3, D-8,
D-21, D-22, D-27) and the live code behind them (`lib/discovery/*`, `services/discovery/*`,
`apify/task-config.md`), tracing exactly what was decided-with-reasoning vs. what was merely built.
Also gave a production-engineering critique of the discovery pipeline (sync webhook handling, static-
secret auth vs. HMAC signing, no dead-letter path, N+1 DB calls, no heartbeat/watchdog on the Apify
scheduler, no observability layer, ToS risk framing, unvalidated cadence) — offered as external
analysis only, explicitly not claiming insider knowledge of any specific company's internal systems,
and not acted upon this session.

**Found a real process gap.** Sakshi asked "did we decide this?" about the Apify scheduling passage
in `apify/task-config.md` (cadence, actor choice, staggering, ToS caveat) and traced it: none of it was
ever logged as a decision or reviewed by her. A prior session (Session 1, building Phase 1) invented
these operational specifics while implementing and wrote them straight into the setup doc as if
settled — there was no mechanism distinguishing "architecture Sakshi approved" from "implementation
details an agent filled in unilaterally."

**Fixed the gap going forward.** Wrote a plan (`~/.claude/plans/why-i-m-scraping-jobs-groovy-peacock.md`,
approved) and executed it: created a project `CLAUDE.md` establishing that polling cadence, vendor/
actor selection, cost implications, and ToS/legal exposure must be logged in `decisions.md` or raised
to Sakshi before being written into code/config/docs as settled; added a governance pointer to the top
of `decisions.md`; logged **D-30** retroactively flagging the four specific unreviewed items from
`apify/task-config.md` as open questions (not resolved).

**Reformatted discovery decisions into a 4-tier structure** (User Needs / Constraints / Product
Questions / Architecture Questions) after Sakshi correctly pushed back that several items I'd labeled
"user needs" (e.g. "same recommendation regardless of entry path") were actually system requirements
or PM/engineering rationale in disguise — no real user says something like that without already
knowing the system's internals. Landed on: a "need" only counts if a naive user would say it
unprompted; a "constraint" is a non-negotiable external boundary (cost, legal exposure, eligibility)
that rules out alternatives before any tradeoff judgment happens; "requirements" with no real
alternative don't get their own tier, they attach as a `Satisfies:`/`Verify:` note on whichever
Product/Architecture decision actually earns them.

**Re-litigated the 6 job titles and 11-company watchlist — both turned out to be unreviewed, and both
got substantively rewritten, not just re-confirmed.** Applying the same "when did we decide this"
scrutiny from the D-30 process gap to two more pieces of content:
- The 6 target role titles (D-31) were first logged as "confirmed correct" based on an ambiguous
  "yes" — that was premature. Sakshi then reopened it: she's transitioning into PM and realistically
  targeting entry-level titles, not the original mix of PM + five adjacent functions (Product
  Operations, Analyst, Specialist, etc.). Landed on: Product Manager, Associate Product Manager,
  Product Associate, Junior Product Manager, Product Manager I — naming variants of one role, not
  different job functions. Product Owner/Associate Product Owner discussed and excluded for v1 (often
  narrower, backlog-grooming scope vs. full PM scope).
- The 11-company watchlist (Anthropic, OpenAI, etc.) had the same gap — never logged, no evidence any
  of them are actually remote-from-India friendly. Sakshi rejected the list outright: reset to empty,
  adopt an evidence-gated approach (a company is added only when she personally has direct proof it's
  remote-from-India friendly), no UI built for it (additions are rare enough that telling the assistant
  or hand-editing the seed file is simpler than building a form).
- Discovered and fixed a real efficiency gap along the way: reading `lib/enrich/pipeline.ts` confirmed
  every ingested job runs the *full* 5-stage AI enrichment with no cheap pre-filter — meaning the
  original "company tasks pull everything, no title filter" design would waste both Apify quota and AI
  quota on entirely unrelated roles at any watchlisted company. Fixed by applying the same title filter
  to company tasks as role tasks. A proposed alternative (a cheap keyword-blocklist pre-filter in code)
  was raised and rejected: PM titles routinely contain domain words like "Sales"/"Engineering"
  describing scope, so a blocklist misfires, and it doesn't save Apify's own fetch cost anyway.
- Also rejected in passing: using salary currency (₹/INR vs. USD) as an India-eligibility signal —
  Sakshi gave a real counterexample (a genuinely India-based job paying in USD).
- Separately, ATS polling (Greenhouse/Lever/Ashby direct feeds, previously "Phase 4") was de-scoped
  from the committed roadmap to a candidate improvement — the watchlist companies are already covered
  by (now title-filtered) Apify company search; ATS polling would only improve copy quality/freshness,
  not add coverage, and per D-28 shouldn't be built speculatively.

### Decisions / amendments
D-30 — `apify/task-config.md` contained unreviewed operational choices, not decisions; four items
(polling cadence, actor selection, task staggering, ToS risk posture) flagged as open questions for
Sakshi, not resolved. New project `CLAUDE.md` created establishing the logging rule going forward.
D-31 — title scope for v1 rewritten (entry-level PM naming variants only; adjacent functions and
Product Owner/APO excluded). D-32 — company watchlist reset to empty, evidence-gated additions, no UI,
two-step gap (watchlist row ≠ Apify Task) documented. D-33 — company-based Apify tasks now
title-filtered, reversing the original "pull everything" design; two related ideas considered and
rejected (keyword-blocklist pre-filter, currency-based India signal). ATS polling de-scoped from
roadmap to `backlog.md` candidate-improvements. (Full detail in `decisions.md`.)

### Next steps (ordered, actionable)
1. **Sakshi to decide (from D-30, still open):** polling cadence (is 30–60 min actually right?), which
   scraper actor to use for LinkedIn/Indeed, whether task staggering is tuned to real free-tier
   quota, and whether the current ToS risk posture ("keep caps modest") is acceptable as-is or needs
   tightening.
2. **Sakshi to decide (from D-31, still open):** whether to add Product Owner/Associate Product Owner
   once there's real signal it's used as a true PM synonym at specific companies.
3. **Sakshi to action (from D-32):** the watchlist is currently empty — add companies as she
   personally verifies remote-from-India eligibility; remember each addition still needs a manual
   Apify Task created to actually take effect.
4. **Sakshi to decide (carried from D-29, still open):** does the `@app-os/contracts` extraction
   prerequisite block Phase 2, or run in parallel with verification?
5. **Sakshi to decide (carried from Session 1/2, still open):** Notion new-vs-existing DB; dashboard
   auth (Supabase Auth vs. shared password); provide resume text to seed `profile`; which free AI key
   first.
6. **Still blocking everything:** the two `.env` secrets (`SUPABASE_SERVICE_ROLE_KEY`,
   `GEMINI_API_KEY`) needed to run the end-to-end verification.
7. Files touched this session: `CLAUDE.md` (new), `decisions.md` (governance note, D-30, D-31 rewrite,
   D-32, D-33), `plans.md` (Context paragraph, Build order annotation), `backlog.md` (ATS polling,
   watchlist UI), `seed/company_watchlist.json` (cleared to empty), `apify/task-config.md` (title list,
   title filter on company tasks). No functional code changed.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

<!-- NOTE: Session 6 appears at the END of this file, after Session 5 — out of order. Session 7 follows it. -->

## Session 5 — 2026-08-02 (discovery-pipeline evaluation framework)

### What happened this session

**Answered Sakshi's handwritten evaluation questions about the discovery pipeline, grounded in the
actual repo, not general advice.** Traced each question (coverage, remote-job gaps, source choice,
freshness, all-details-scraped, "how else do I evaluate") against `decisions.md`, `apify/task-config.md`,
and the live code (`lib/discovery/*`, `services/discovery/*`), distinguishing settled decisions from
D-30's still-unreviewed items and from genuine gaps. Confirmed **Wellfound was never actually scoped**
into discovery — it appears only as one aspirational line in `plans.md`, never in D-1's real source
list, never implemented.

**Correction to Session 4's "two blocking secrets" framing (item 6 below):** `.env` actually has *four*
empty secrets, not two, and they block two different things. `SUPABASE_SERVICE_ROLE_KEY` +
`GEMINI_API_KEY` block the fixture/logic test (canned data — proves the code paths work).
`APIFY_TOKEN` (+ `APIFY_WEBHOOK_SECRET`) are separately empty and are what actually block a **live**
discovery run against real postings. Passing the fixture test does **not** answer any of the coverage/
freshness/source-quality questions — those need `APIFY_TOKEN` filled in too.

**Deep-dive code findings** (all cited file:line during the session, summarized here):
- No code filters contract/internship/employment-type — filtering happens only incidentally, via the
  Apify actor's exact title whitelist (`apify/task-config.md`, matches D-31 scope).
- Dedup is real but exact-match only: per-source key `(source, external_id)`; cross-source canonical
  grouping by exact `(company_slug, normalized_title)` string match, no fuzzy JD matching. Canonical =
  highest source-reliability rank (D-8), tie-broken by earliest `first_seen_at`. Reworded postings
  across boards will **not** merge; reposts are **not** detected as reposts (get a new `external_id`).
- No JSON/TS search-config object exists — `apify/task-config.md` *is* the query spec.
- No crawl-failure/reliability tracking beyond a bare `StageFailed` event on catch; `IngestSummary`
  counters (duplicate/drop rate) are computed per run but only `console.log`'d, never persisted.

**Discussed additional discovery sources (RemoteOK, Wellfound, Rocket.jobs) — explicitly logged as
analysis, not a decision**, per this project's own `CLAUDE.md` rule that source selection needs a real
decisions.md entry or a call with Sakshi. RemoteOK flagged as the lower-effort/lower-risk candidate
(public JSON API, no scraping/ToS ambiguity) versus Wellfound (login walls, anti-bot). Recommended
sequencing: validate one source live against a small manual benchmark before adding a second, so results
are attributable per-source. Full writeup landed in `backlog.md`'s candidate-improvements section.

**Built out a "cheap vs. expensive metric" framework** across all 8 evaluation themes Sakshi expanded
into (Coverage, Source Evaluation, Freshness, Relevance, Discovery Reliability, Deduplication,
Scalability, Legal/Operational) — splitting each sub-question into: already-answerable-by-inspection
(job boards/companies missing — no measurement needed, just a decision to add them), free-with-the-
first-run (discovery latency, duplicate rate — data already captured as an operational byproduct),
needs-a-new-mechanism-first (staleness/closed-job detection, crawl-failure tracking — currently
unanswerable by construction, not just unmeasured), and needs-external-ground-truth (coverage rate —
recommended an informal personal spot-check list over building formal benchmark infra at this stage,
since nothing has run live yet).

**A plan file was drafted and rejected.** `~/.claude/plans/help-me-answer-this-deep-spindle.md`
proposed answering the questions in chat plus annotating `apify/task-config.md` with the missing
`<!-- UNREVIEWED DEFAULT -->` markers (lines 7-8 actor choice, 9-10 Indeed/Google unconfigured, 12
result-cap ToS language, 42-44 cadence) per D-30's already-flagged items. Sakshi redirected to direct
conversational Q&A instead — **the annotation was never applied and remains a valid open follow-up.**

**Self-correction worth flagging:** recommended "get LinkedIn live first" as sequencing, then under
direct questioning ("is this an engineering or product principle?") admitted the sequencing *logic* was
real (one source at a time, so results are attributable) but the *LinkedIn-specific* default was just
inertia — it's the source that's already half-built, not evidence it's the right one, and it's plausibly
the weakest-fit source given Sakshi's stated remote-coverage priority. Saved as a reinforcement to the
`feedback-distinguish-decisions-from-analysis` memory (separating genuine principle from convenient
default in my own recommendations, not just in historical claims).

### What happened, continued (same session, after the first wrap above)

The session kept going well past the first wrap-up — real decisions got made, correcting the "None"
below from earlier. Grouped by theme:

**LinkedIn ban/legal-risk research → resolved D-30's ToS item.** Researched cookieless vs. cookie-based
Apify actor modes (cookieless removes personal-account ban risk entirely, at the cost of no advanced
features this pipeline doesn't need anyway); the full hiQ Labs v. LinkedIn outcome (LinkedIn actually
*lost* the CFAA/"hacking" claim on public data, but *won* on breach of contract — a different legal
theory that only bites accountholders, not anonymous cookieless visitors); the Proxycurl/Nubela and
ProAPIs lawsuits (both commercial data-resale operations, not personal tools); and a GitHub search
confirming a mature ecosystem of personal LinkedIn job scrapers (487★ top result) operating for years
without apparent legal action. Sakshi confirmed she's comfortable with the researched posture — **D-30's
ToS item is resolved.**

**Actor pricing research → narrowed D-30's actor-choice item.** Found `bebity/linkedin-jobs-scraper`
and `curious_coder/linkedin-jobs-search-scraper` ("Advanced") both charge a flat **$29.99–30/month
rental**, which conflicts with this project's own free-to-run constraint (`plans.md` D-1).
`curious_coder/linkedin-jobs-scraper` (basic) is pay-per-result at **$1/1,000, no flat fee** — the only
free-tier-compatible option of the three. Not yet an explicit "yes, use this one" from Sakshi.

**Apify free-tier quota check → revealed a real problem, then found the fix.** Apify's free plan is
**$5/month credit, doesn't roll over**; polling the same search repeatedly re-bills roughly the same
standing result set each time (not just new jobs), so "every 30–60 min" as literally written in
`apify/task-config.md` could burn the whole month's credit in a day or two. Then checked the chosen
actor's actual input schema: it takes a raw LinkedIn search URL, which supports LinkedIn's own
**`f_TPR`** (Time Posted Range: `r86400`=24h, `r604800`=week, `r2592000`=month) and workplace-type
(`f_WT`/`f_WRA`) filters — meaning a recency-scoped search could make cost scale with actual new-job
volume instead of total standing pool size. **Not yet resolved:** the real numbers (result count, real
$ cost) from an actual test run — recommended running the actor once manually before picking a cadence
number, rather than guessing.

**Sakshi ran real test search URLs herself — found a real, confirmed gap.** Searching
`keywords=associate product manager` on LinkedIn also returned plain "Product Manager" postings.
Traced to LinkedIn's `keywords` field doing broad multi-field matching (title + description + skills),
not a title-only filter — confirmed via LinkedIn's own Boolean-search docs that even quoted exact-phrase
search only restricts the *description* field, not title. True title-only filtering appears to be a
Sales Navigator (paid, different product) feature, unavailable here. **This confirms a real code gap:**
nothing in the pipeline checks a scraped job's actual `title` against the D-31 list before ingesting/
enriching it — the search URL alone can't be trusted to enforce this. (A backlog.md edit documenting
this was drafted but rejected mid-session — not applied; worth re-raising if Sakshi wants it captured.)

**RemoteOK real-world check → D-34.** Sakshi manually searched RemoteOK herself and found zero
India-remote Associate Product Manager listings — the theoretical cost/risk case for RemoteOK (from
earlier in this session) turned out not to matter because the source doesn't carry the target
role/geography at all. **Decision: stay LinkedIn-only for now**, RemoteOK/Wellfound/Rocket.jobs not
added.

**Company-discovery idea → D-35, plus a v1/v2 scope split.** Sakshi proposed running a *broader*
"remote product manager" search (any seniority, not title-restricted) specifically to harvest company
names as watchlist candidates — solving D-32's real bottleneck (the evidence bar was always manual and
hard to satisfy). Raised whether matches should auto-add or need per-company confirmation; **Sakshi
decided: auto-add, no confirmation step** — a real found posting already satisfies D-32's "direct
evidence" bar on its own. Separately, connecting a validated company to an actual monitoring Apify Task
(closing the loop end-to-end) was explicitly **scoped to v2**, not v1 — v1 only auto-populates the
watchlist row.

**ATS/careers-page-direct scraping discussed and explicitly not built yet.** Raised as a way to catch
companies who stop cross-posting to LinkedIn (a real limitation of the LinkedIn-only monitoring
mechanism) — decided not to build this now since it's still hypothetical with an empty watchlist;
revisit once real watchlisted companies exist and manual spot-checks show LinkedIn's copy is actually
missing something, not just theoretically might be.

**D-31 resolved and D-34 amended with a concrete sequencing plan.** Product Owner/Associate Product
Owner: **skip for now**, no new evidence to revisit. Sources: **LinkedIn first, validated one dimension
at a time** (coverage via the manual benchmark list, freshness via posted→discovered latency, relevance
via title-match accuracy) **before Wellfound** is added second — chosen specifically because most
startup remote roles concentrate there, the actual blind spot both LinkedIn and RemoteOK share. Exact
pass/fail bar per dimension still undecided.

**Explained the full project documentation taxonomy at Sakshi's request**, for standardizing across
other ApplicationOS modules: `decisions.md` (sole authority) → `session-summary.md` (continuity) →
`plans.md`/`backlog.md` (built vs. deferred) → `learnings.md` (technical explainability, optional) →
`CLAUDE.md` (governs assistant behavior, not project content) → setup docs (`apify/task-config.md`,
`docs/NOTION_SETUP.md`, execution-only per the D-30 governance rule) → `README.md` (onboarding). No
`tasks.md` exists — confirmed by listing the repo; not yet decided whether one's wanted.

### Decisions / amendments
- **D-30 (partial):** ToS risk posture **resolved** (comfortable as researched). Actor choice
  **narrowed** to `curious_coder/linkedin-jobs-scraper` on free-tier-compatibility grounds, pending
  explicit sign-off. Cadence/staggering **still open**, now blocked on one real test-run's numbers
  rather than a preference call.
- **D-31:** **resolved** — skip Product Owner/Associate Product Owner for now.
- **D-32:** amended — the "known gap" (watchlist row ≠ active monitoring) automation is **sequenced to
  v2**, not ruled out, given D-35.
- **D-34:** discovery source **stays LinkedIn-only** (RemoteOK evaluated and rejected on real-world
  evidence). Amended same session with a **concrete LinkedIn→Wellfound sequencing plan** (validate
  LinkedIn on coverage/freshness/relevance first, gate criteria still undecided).
- **D-35 (new):** broad "remote product manager" discovery search **auto-populates the watchlist**, no
  manual confirmation step; auto-creating the follow-on monitoring Task is **v2 scope**.

### Next steps (ordered, actionable)
1. **Confirm the actor explicitly:** `curious_coder/linkedin-jobs-scraper` is narrowed-to by the
   free-tier constraint but needs Sakshi's explicit "yes, use this one."
2. **Run that actor once, manually**, with a real LinkedIn search URL (built via LinkedIn's own UI —
   keywords, location=India, remote, date-posted range) to get real result-count and real $ cost —
   this single data point unblocks cadence and staggering, which are otherwise just guesses.
3. **Build the code-side title-match filter** — confirmed necessary by Sakshi's own real search test
   (LinkedIn's `keywords` field leaks off-title matches); compare scraped `title` against the D-31 list
   before ingesting/enriching. Not yet built; a docs-only note about this was drafted and rejected
   mid-session, so this needs re-raising before it's captured anywhere durable.
4. **Fill in `APIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`** — still the master blocker
   for any real numbers (unchanged from earlier this session).
5. **Build the manual coverage benchmark list** (10-20 real postings noticed via normal browsing) —
   unchanged, still not started, needs no secrets.
6. **Cheap follow-up, still not built:** persist `IngestSummary` run counters instead of
   `console.log`-only (see `backlog.md`).
7. **Once LinkedIn clears its own validation bar** (coverage/freshness/relevance all checked against
   real runs), begin the Wellfound evaluation pass — actor choice, ToS review, cost check, same rigor
   as LinkedIn got this session, not a quick add.
8. **Carried forward, still fully open, untouched this session:** D-29's `@app-os/contracts` extraction
   sequencing; Session 1/2's Notion new-vs-existing DB, dashboard auth approach, resume-text profile
   seed, and first free-AI-provider-key choice.
9. **Open, not yet decided:** whether a `tasks.md` is wanted for this project (or standardized across
   ApplicationOS modules) — flagged as absent during this session's doc-taxonomy discussion.
10. Files touched this session (full session, both halves): `backlog.md` (multiple edits — additional-
    sources item, tech-debt items, RemoteOK-rejected update; one title-leakage edit was drafted and
    **rejected**, not applied), `decisions.md` (D-30 update, D-31 resolution, D-32 amendment, D-34 new
    + amendment, D-35 new), `session-summary.md` (this entry), one memory file
    (`feedback_distinguish_decisions_from_analysis.md` reinforcement). No functional code changed this
    entire session.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 6 — 2026-08-02 (Supabase project swap + secret rotation)

### What happened this session

**Started from Session 5's handoff, verified against the actual repo before acting.** Re-read
`decisions.md`, `backlog.md`, and `apify/task-config.md` to confirm the prior session's state (D-35 as
newest decision, actor/cadence still open) rather than trusting the memory snapshot alone — matched.

**Identified the true blocking secrets, not just "three missing."** Grepped `.env`: everything except
Supabase/AI-provider/Apify/Telegram/Notion base config was empty. Narrowed to the two that actually
gate anything — `SUPABASE_SERVICE_ROLE_KEY` (blocks all DB writes, including local fixture tests) and
`GEMINI_API_KEY` (blocks the AI enrichment stage) — versus Apify/Telegram/Notion keys, which are scoped
to later phases per the file's own comments.

**Supabase project swapped mid-session (D-36).** Sakshi pasted a new Supabase URL
(`cdjgxrmeoqiogylveagr`); confirmed via question that it was a genuinely new project, not a rename.
Reason turned out to be accidental — Sakshi forgot the original `job-tracker` project
(`gwvrpdkiblozwdwoqsgd`) already existed and created a duplicate. Updated `.env` (`SUPABASE_URL`) and
`README.md`'s live-environment section; logged the swap as **D-36**, with **D-14 marked superseded**
pointing to it, per this project's own `CLAUDE.md` rule that this class of change belongs in
`decisions.md`, not silently in config.

**Secret rotation, with two real mistakes caught mid-session:**
- Confirmed `sb_publishable_...` is Supabase's new-format replacement for the legacy JWT anon key —
  functionally a drop-in for `SUPABASE_ANON_KEY` since `lib/config.ts` reads it as an opaque string.
  Captured as a `learnings.md` entry since the format mismatch is genuinely confusing against `.env`'s
  own comments (still describe the old JWT-style key).
- **Caught a corrupted paste:** after opening `.env` for Sakshi to paste the service-role key, the
  `SUPABASE_ANON_KEY` line came back with the new publishable key and the *old* project's stale JWT
  anon key concatenated with no separator — an invalid value. Found by reading the file back, fixed.
- **Flagged, then accepted, an unfamiliar `GEMINI_API_KEY` format:** the pasted value started `AQ.`
  rather than the expected `AIzaSy...` prefix. Raised the concern; Sakshi confirmed she'd checked it was
  correct. Per standing guidance to trust the user's own empirical checks over prior-knowledge pattern
  matching, accepted without further pushback — Google may have changed the key format since last known.
- `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...`) filled in cleanly, no issue.

**Attempted to apply schema to the new project via the Supabase MCP connector — blocked.**
`list_projects` only returns the old `job-tracker` (`gwvrpdkiblozwdwoqsgd`, now status `INACTIVE`) and
the unrelated `funded-company-v1`, both under org `dnnaykjkbrtwjuzonnal`. The new project isn't visible
at all. Sakshi confirmed mid-wrap-up: **it's under a different Supabase organization.** Reauthorizing
the connector for that org is the next concrete step, not yet done as of this entry.

### Decisions/amendments made
- **D-36 (new):** Supabase project swapped from `gwvrpdkiblozwdwoqsgd` to `cdjgxrmeoqiogylveagr`
  (accidental duplication, not a deliberate migration). D-14 marked superseded. Schema/watchlist not
  yet applied to the new project; old project now confirmed `INACTIVE` and still exists unused (free
  tier, no cost pressure, but a cleanup candidate later).

### Next steps (ordered, actionable)
1. **Reauthorize/reconnect the Supabase MCP connector for the new project's organization** — this is
   the immediate blocker; without it, schema application has to happen manually via the Supabase SQL
   editor instead.
2. **Apply `supabase/migrations/0001_schema.sql` + `0002_lane_ready.sql`** to `cdjgxrmeoqiogylveagr`
   once the connector (or manual SQL editor access) works.
3. **Re-seed `seed/company_watchlist.json`** into the new project (currently empty per D-32, so this is
   just re-confirming the empty-state, not restoring lost data).
4. **Verify core end-to-end** on the new project once schema exists: fixture ingest → enrich, same
   check Session 1 originally specified.
5. **Everything carried over from Session 5, still untouched:** actor confirmation
   (`curious_coder/linkedin-jobs-scraper`), the one real manual Apify test run, the code-side
   title-match filter, the manual coverage benchmark list, persisting `IngestSummary` counters, and the
   eventual Wellfound evaluation pass.
6. Files touched this session: `.env` (URL, anon key, service-role key, Gemini key — corrected once
   mid-session), `README.md`, `decisions.md` (D-36 new, D-14 amended), `learnings.md` (Supabase key
   rename entry), `session-summary.md` (this entry). No functional application code changed.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 7 — 2026-08-03 (major rescope: v1 cut to discovery + tagging; tracking split into its own module)

### What happened this session

**Started from a sequencing question, ended in a full rescope.** Sakshi opened by asking whether she
could stand the project up now and do evals, structured output, and prompt tuning after building the
whole app — and said her build speed felt slow. Answering that against the repo produced three
findings, and then a much larger conversation.

**On the original question — deferring is safe, and two of the three items aren't deferrable tasks
at all.**
- **Structured output is already built**, at three layers: `responseMimeType: 'application/json'`
  (`lib/ai/gemini.ts:18`), a defensive fence-stripping parser (`lib/ai/AIService.ts:31`), and Zod
  schemas with `.catch()` fallbacks + clamping (`AIService.ts:56`). Nothing to sequence; adding
  Gemini's `responseSchema` is purely additive whenever.
- **Prompt tuning was designed to be deferrable.** `PROMPT_VERSION`/`CLASSIFIER_VERSION` are stamped
  on every enrichment row and `writeEnrichment.ts` supersedes rather than overwrites, so v2 prompts
  sit side-by-side with v1 (D-6, D-9 doing exactly their job).
- **Evals cannot come first** — they need labelled ground truth, and nothing has ever run live.
  `raw_output` is already persisted on every row, so run #1 seeds the golden set for free.
- **On build speed (analysis, not a logged decision):** Sessions 3, 4, and 5 each closed with "No
  functional code changed"; last functional code was 2026-07-10. The cause isn't the eval/tuning
  ordering — it's that the pipeline has never run once, and nearly every open question (cadence, real
  $ cost, coverage, title leakage) resolves to a single real run.

**A correction Sakshi made, and it was right.** The plan proposed building a code-side title-match
filter. She pointed out D-33 already decided this — filtering happens at the Apify source, and an
in-code pre-filter was explicitly *considered and rejected* there (PM titles legitimately contain
"Sales"/"Engineering" as scope; code-side filtering doesn't save Apify's own fetch cost). Removed. The
title-leakage question became "count off-title rows in the first real run" instead — clean means D-33
holds, leakage is new evidence that reopens D-33 as a decision rather than something to patch around.

**Documentation archaeology, at her prompting.** She asked in turn who decided the structured output
format, when the LLM is used, when the pipeline stages were decided, and whether the planned service
list was ever approved. Traced each:
- *Structured output:* **what** gets extracted traces to D-3/D-7/D-12 (hers). **How** it's shaped
  (JSON-only suffix, Zod, `.catch()` defaults, the enum vocabularies, the invented `technical_depth`
  1–5 rubric) was never logged — Session 1 implementation choices. Not a D-30-class gap, since
  `CLAUDE.md`'s rule covers cadence/vendor/cost/ToS, not serialization. Flagged separately: the
  `.catch()` fallbacks silently mask model failure — you cannot distinguish "the model said non_ai"
  from "the model returned garbage and Zod defaulted it."
- *LLM usage:* four calls per job, not five — `salary` is pure regex (D-12). `AIService` is imported
  only in `lib/enrich/*`; discovery and notification have zero AI.
- *Stages:* the five-stage list came from the approved plan, never itemised as decisions. **Why**
  stages are separate *is* properly decided (D-10, with "one big `classify()` step" as the rejected
  alternative). Drift found: `plans.md` principle #6 lists Recommendation as a separate *service*;
  the code has it as a stage inside `enrichJob`. Also found: D-10's "event-driven pipeline" is
  currently event-*logged* — nothing subscribes to `job_events`, `run-dispatch.ts` is a sequential
  call and `enrichJob` walks a hardcoded `ORDER`.
- *Service list:* grepped — **never approved as its own decision.** Accepted wholesale as part of the
  2026-07-10 plan, and now stale against `WORKSPACE.md`'s more specific module split.

**Module structure resolved — three modules, not five (`WORKSPACE.md` D-7).** Sakshi worked through
where Qualify/Recommendation, tracking, and outreach belong. Landed on: `recommendation-engine` and
`dashboard` dropped as separate modules; `founder-outreach` reassigned to the existing, separate
funded-company project; `job-tracker` renamed **`job-scout`**; and a new **post-discovery tracker**
module owning everything after a job is found. The rule that settled outreach: **split by what a
message is attached to, not by who receives it** — job-posting-attached (referral asks, recruiter
InMails, cover letters) → tracker; funding-event-attached → funded-company.

**v1 rescoped around where she actually spends time (D-37, D-38).** Pipeline cut from five stages to
three (`classify` → `skills` → `salary`). `recommend` and `qualify`/Lane deferred to v2. `resume_match`
deferred **and redesigned**: on-demand rather than automatic, scored against the *master* résumé
(scoring a tailored résumé against its own JD is a rigged test). Large second-order effect — that
removes the only thing needing full résumé text inside job-scout, which drops `resume_versions` /
`resume_version_id` and postpones D-29's contracts question to when matching is actually built.

**Her Notion board turned out to be better spec than anything in the schema.** Reviewing screenshots
of her real tracker produced several concrete findings:
- Her single "Background Match" field was doing two jobs at once → split into **`domain`** (what the
  company does — verified absent from the schema entirely) and **`background_match[]`** (which parts
  of *her* background connect). The latter is the raw material for outreach messages — every referral
  message she's written opens with a specific overlap, which a numeric score can't give her (D-39).
- Her status list conflates stage with blocker — the Purplle row is simultaneously `Applied: May 1`
  *and* `Status: Referral Pending`. Recommended splitting into Stage + Waiting-on. **Not confirmed.**
- She has **two** follow-up dates and a notification need; the schema has neither (verified: no
  follow-up/reminder/due field exists anywhere). `next_follow_up_at` gets stored; `last_follow_up_at`
  is *derived* from the timeline so it can't drift.
- `notes` becomes an **append-only dated timeline**, not a maintained blob — the same structure as
  captured conversations, so one chronological record per job.

**Code findings that came out of the field-by-field discussion:**
- Only two places in the codebase touch `job_tracking`: `writeEnrichment.ts:32` (reads
  `locked_fields`) and `ingest.ts:92` (auto-creates a row). **The preference flags are read by zero
  code** — which corrected my own earlier reasoning for keeping them in job-scout.
- **A real bug (D-41):** `apify.ts:15` resolves the job URL through a single fallback chain trying the
  LinkedIn URL first, so when the actor returns both, the **company apply URL is silently discarded**.
  Split into `posting_url` + `apply_url`. Trap noted: `externalId`'s fallback must keep using the
  LinkedIn URL or the dedup key changes.
- `dream_company` sits on a per-job table but is conceptually per-company → move to
  `company_watchlist`.

**Apify vs. Gmail (D-40).** Sakshi raised dropping Apify since she already gets LinkedIn alerts by
email. Decided to keep Apify for discovery (alert emails are built for humans to read, so parsing them
is messier than the structured actor output) but **adopt the alerts for coverage checking** — which
supersedes Session 5's plan to hand-build a benchmark list of 10–20 postings.

**Conversation capture (D-43).** Click-to-save on a manual text selection, not passive thread syncing
— the latter requires operating inside her logged-in LinkedIn account, the exact risk profile the
cookieless-actor research was done to avoid.

**Correction to the record:** D-36 and Session 5 both state `SUPABASE_SERVICE_ROLE_KEY` is empty. It
is **set**, as are `SUPABASE_URL` and `GEMINI_API_KEY` — verified directly against `.env`. D-36
amended in place.

### Decisions / amendments
- **D-37 (new)** — v1 rescope: `classify`/`skills`/`salary` only; `recommend` + `qualify`/Lane to v2.
  Confirms JD-text retention, `locked_fields`, and `location`-as-data-only; adds a manual
  chance-of-selection field.
- **D-38 (new)** — `resume_match` deferred *and* redesigned (on-demand, master résumé); drops
  `resume_versions`/`resume_version_id`; postpones D-29.
- **D-39 (new)** — new `classify` outputs `domain` + `background_match[]`.
- **D-40 (new)** — Gmail alerts rejected for discovery, adopted for coverage checking. **Amends D-34.**
- **D-41 (new)** — job URLs split into `posting_url` + `apply_url`; fixes a silent-discard bug.
- **D-42 (new)** — post-discovery tracking splits into its own module; `job_tracking` splits three ways.
- **D-43 (new)** — conversation capture via click-to-save on a manual selection.
- **D-36 (amended)** — stale "service-role key still empty" line corrected.
- **`WORKSPACE.md` D-7 (new)** — three modules not five; `recommendation-engine`/`dashboard` dropped;
  `founder-outreach` reassigned; `job-tracker` → `job-scout`; resume-builder must accept uploaded
  résumés.

### Next steps (ordered, actionable)
1. **Unblock the repo — still the master blocker.** Apply `0001_schema.sql` + `0002_lane_ready.sql` to
   `cdjgxrmeoqiogylveagr` (reauthorize the Supabase MCP connector against the owning org, or paste
   into the SQL editor), and replace `SUPABASE_ANON_KEY`, which still holds the **old** project's key.
2. **Run the fixture end-to-end** (needs no Apify token): `npm run typecheck` → `npm run ingest --
   --file tests/fixtures/sample-linkedin.json --source linkedin` → `npm run dispatch`.
3. **Apply the pipeline rescope** — drop `recommend`/`resume_match` from `ORDER`; repoint
   `enrichPending()` at `salary` (it currently keys off an active `recommend` row and will break); add
   `domain` + `background_match[]` columns and classify outputs; seed a profile blurb; add the manual
   chance-of-selection field; drop `resume_versions`/`resume_version_id`; switch `ingest.ts:92` to lazy
   creation; split the `apify.ts:15` URL chain.
4. **Confirm the actor explicitly** (`curious_coder/linkedin-jobs-scraper` — narrowed to on free-tier
   grounds, still never given an explicit yes), then **run it once manually** scoped by `f_TPR` to get
   real result count + $ cost (unblocks D-30's cadence), the off-title row count (tests D-33), and
   whether it exposes LinkedIn's apply-redirect target (D-41).
5. **Rename to `job-scout`** — after step 2 proves the pipeline runs, not before.
6. **Build the post-discovery tracker**, designed from the Notion structure captured above.
7. **Resume-builder refinement** — own session; one firm requirement already: accept uploaded résumés.
8. **Decide the open items in `backlog.md`** — status model (Stage + Waiting-on), `avoid_company`/
   `domain_interest`, `resume_version_used`'s home, the tracker module's name.
9. **Carried, still open:** D-29 contracts sequencing (now postponed to when matching is built);
   Notion new-vs-existing DB; dashboard auth; whether a `tasks.md` is wanted.
10. Files touched this session: `decisions.md` (D-37–D-43 new, D-36 amended), `WORKSPACE.md` (module
    table, folder layout, D-7 new), `backlog.md` (roadmap rescoped, open-questions section),
    `learnings.md` (three entries), `plans.md` (rescope banner), `session-summary.md` (this entry).
    **No functional application code changed** — this was a decision-and-documentation session.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 8 — 2026-08-04 (schema review table-by-table; ~15 decisions, no code changed)

### What happened this session

**Started by catching up on a parallel session.** This session began before Session 7 existed and ran
alongside it. Re-reading `decisions.md`, `session-summary.md`, `backlog.md`, and `WORKSPACE.md`
mid-session surfaced that Session 7 had already executed a major rescope (D-37→D-43, `WORKSPACE.md`
D-7) — which **overturned advice given earlier in this very session**: I had suggested dropping
`profile` and moving skills into `resume_versions`; Session 7 did the opposite on both counts (dropped
`resume_versions`, kept `profile`). Flagged and corrected in-conversation rather than quietly moving on.

**Correction to the record, again.** Both D-36 and Session 7 state `SUPABASE_ANON_KEY` still holds the
old project's key. Verified directly against `.env`: it holds the **new** project's `sb_publishable_...`
key — replaced during Session 6 itself, which Session 7 (running in parallel) could not see. All four
Supabase/Gemini secrets are correctly set. **The one real blocker that remains: the schema has still
never been applied to `cdjgxrmeoqiogylveagr`.**

**Table-by-table schema review, every claim grep-verified before being stated.** Reviewed
`company_watchlist`, `profile`, `resume_versions`, `jobs`, and (partially) `job_enrichments`. What the
verification turned up:
- **`profile` is completely unwired** — nothing reads or writes it, and `v_skill_gap` (its only
  consumer) is unwired too, so the skill-gap feature has never run. Same for `rollup_skills`.
- **`link_status` is read and written by nothing**; `last_checked_at` is write-only (`ingest.ts:99`).
- **`recruiter_linkedin`** is captured at ingest and surfaced nowhere.
- **`company_watchlist.weight` *is* genuinely used** (`recommend.ts:21`) — I had flagged it as possibly
  vestigial and was wrong; corrected immediately.
- **`active` is a switch wired to nothing** — `recommend.ts` matches on `company_slug` alone and never
  filters on it, so pausing a company would silently do nothing.
- **`recommend` is still fully wired into the live pipeline** despite D-37 deferring it — and
  `lib/telegram.ts` + `lib/notion.ts` read `priority`/`recommend_reasons` to build the alert **itself**,
  which Session 7 did not flag. Removing `recommend` without a replacement would have silently emptied
  the notifications.

**Sakshi separated two concepts that had been conflated.** Asked what "watchlist" actually means,
then split it: watchlist = *companies I am actively pursuing*; a new catalog = *companies confirmed
remote-India-friendly*, recorded without commitment. This revises D-35's destination table.

**Four external research passes**, each feeding a decision rather than sitting as commentary: how
teams collect/store LLM feedback for evals; Langfuse vs. LangSmith; LinkedIn people-search automation
risk; AmbitionBox/Glassdoor salary data; Jobscan/Teal résumé tailoring. Two produced **rejections**
(external salary lookup, LinkedIn people-search automation) — both on the grounds that they would add a
*second* ToS exposure or risk the personal LinkedIn account, for a marginal signal.

**A design idea from Sakshi that resolved an open gap.** Her proposed per-job feedback button turned
out to solve D-42's unspecified home for `locked_fields`: a correction *is* a lock, so one
`job_feedback` table serves both — which also removes job-scout's last dependency on `job_tracking`,
letting that table move to the tracker module whole.

**Her staleness rule made an unschedulable feature tractable.** Rather than drop the two inert columns,
she proposed only checking jobs older than a month. Recommended reusing the same 30-day interval for
re-checks instead of inventing 45/90-day tiers — one number, applied twice.

### Decisions / amendments
**D-44→D-59 (16 new).** Catalog table separate from watchlist (revises D-35) · 30-day staleness rule ·
`profile` keeps structured résumé data (amends D-38) · `background_match` from experience+education
(amends D-39) · `job_feedback` replaces `locked_fields` (resolves D-42 gap) · feedback capture in v1,
passive, per-field · LLM-as-judge rejected · Langfuse/tracing → v2 · no watchlist weighting in v1 ·
v1 `recommend` as a deterministic rule (amends D-37) · unknown salary ignored · external salary lookup
rejected · LinkedIn people-search automation rejected · `institute_requirement` → regex · no
instant/digest split · **Notion dropped entirely (D-59, amends D-2 — closes a Session-1 open question)**.
**`WORKSPACE.md` D-8 (new)** — cross-module constraints get logged at workspace level, plus three
requirements recorded there (tracker's one-to-many contacts table; people-search stays manual;
résumé-tailoring competitive review).
**Corrections:** D-36's `SUPABASE_ANON_KEY` claim; `writeEnrichment.ts`'s mechanism logged as an
implementation note under D-9 (it was never a decision — Session 1 implementation).

### Schema coverage — what has and has not been reviewed

`0001_schema.sql` defines **15 tables + 5 views**. Two more are newly proposed. Status after this
session:

| Table / view | Status | Where |
|---|---|---|
| `profile` | ✅ Decided | D-46 — keeps structured master-résumé data |
| `resume_versions` | ✅ Decided | D-38 — dropped from this module |
| `company_watchlist` | 🟡 Mostly | D-44, D-52 — **`ats_type`/`ats_slug` still open** |
| `jobs` | 🟡 Mostly | D-41, D-45 — **`recruiter_linkedin` still open** |
| `job_enrichments` | 🟡 Partial | `recommend`/`priority` settled (D-53); **the other ~20 columns were never walked** |
| `job_tracking` | ✅ Decided | D-42, D-48 — moves to tracker module whole |
| `decisions` (table) | ❌ **Never reviewed** | — |
| `status_history` | ❌ **Never reviewed** | — |
| `job_events` | ❌ **Never reviewed** | — |
| `ai_usage` | ❌ **Never reviewed** | D-51 noted tokens aren't linked to the enrichment row |
| `processed_runs` | ❌ **Never reviewed** | — |
| `rollup_company` | ❌ **Never reviewed** | — |
| `rollup_skills` | 🟡 Partial | Verified unwired; skill-gap analytics → v2. Columns not reviewed |
| `rollup_funnel` | ❌ **Never reviewed** | — |
| `rollup_ai_cost` | ❌ **Never reviewed** | Only rollup with any live writes (`lib/events.ts:60`) |
| `v_jobs_enriched` | ❌ **Never reviewed** | The main read model — matters most of the five |
| `v_company_rollup` | ❌ **Never reviewed** | — |
| `v_freshness` | ❌ **Never reviewed** | Relevant to D-45's staleness rule |
| `v_skill_gap` | 🟡 Partial | Verified unwired (depends on empty `profile`) |
| `v_ai_cost` | ❌ **Never reviewed** | — |
| **`remote_companies`** (new) | 🟡 Purpose agreed | D-44 — **name and columns not decided** |
| **`job_feedback`** (new) | 🟡 Shape sketched | D-48 — columns proposed, not finalised |

**Short answer: no, not all tables have been discussed.** Six tables and four views have never been
looked at; `job_enrichments` — the widest table in the schema — was only partially covered. **Nothing
should be written into migration `0003` until this is finished**, since a column dropped or added in an
unreviewed table is exactly the kind of change that is expensive to reverse once data exists.

### Next steps (ordered, actionable)
0. **Finish the schema review** — the ❌ and 🟡 rows above. Then finalise the two new tables' columns.
1. **Re-examine the v1/v2 split explicitly, with reasoning per item.** `scope.md` now records *what*
   is in each version, but several v1 items were placed there by momentum rather than by an argument —
   they were already half-built, or felt cheap. Worth asking of every v1 line: *does this need to exist
   before the first real run, or is it in v1 because it already exists?* Specific candidates to
   challenge: the `skills` stage (real value, but nothing consumes its output in v1 — the analytics
   that would use it are v2), `domain` + `background_match` (new AI outputs added to v1 while the
   existing pipeline has still never run once), the feedback UI (the *capture* is unrecoverable and
   must be v1, but the *interface* for it may not need to be), and `confidence`/`needs_review` gating
   (a review queue with no reviewer UI). The reverse question is worth asking too — whether anything
   in v2 is actually load-bearing for v1.
2. **Close the remaining open items** in `scope.md` — `ats_type`/`ats_slug`, `recruiter_linkedin`, and
   what the watchlist should mean for companies with no current opening.
2. **Review the never-examined tables**: `decisions`, `status_history`, `job_events`, `ai_usage`,
   `processed_runs`, the four `rollup_*` tables, and all five views.
3. **Then write migration `0003`** covering D-44→D-59's schema changes, and apply `0001`+`0002`+`0003`
   to `cdjgxrmeoqiogylveagr`. **Still the master blocker — nothing has ever run.**
4. **Code changes** that travel with it: pipeline `ORDER` → 3 stages; `enrichPending()` repointed off
   `recommend`; `apify.ts:15` URL split (D-41); `recommend` rewritten as a deterministic rule (D-53);
   `institute_requirement` → regex (D-57); notification de-tiering (D-58); `writeEnrichment` reading
   `job_feedback` (D-48); **remove the Notion upsert from `notify.ts` (D-59)**.
5. **Run the fixture end-to-end** (needs no Apify token), then confirm the actor and do the one real
   Apify run — still the single thing unblocking cadence, cost, and coverage questions.
6. **Carried, still open:** the folder rename to `job-scout`; D-29 contracts sequencing (partially
   reopened by D-46); tracker module's name; whether a `tasks.md` is wanted.
7. Files touched: `decisions.md` (**D-44→D-59**, five amendment pointers, two corrections),
   **`scope.md` (new)**, **`pm-reasoning-log.md` (new)**, `learnings.md` (regex-vs-AI entry),
   `WORKSPACE.md` (D-8 + cross-module requirements), `backlog.md` (two open questions resolved),
   `session-summary.md` (this entry). **No functional application code changed.**

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided. Note that Sessions 7 and 8 ran in parallel and each contains
stale claims about the other's work.*

## Session 9 — 2026-08-04 (priority rule designed and corrected; `background_match` specified; D-60→D-75)

### How the session was sequenced — and why the original order was wrong

Started on the v1/v2 scope cut that Session 8 had seeded. Sakshi stopped it: *"let us do this once we
have figured out schema and product."* She was right and the recommendation was wrong. Three of the
four scope questions turned out to be **downstream of schema decisions that did not exist yet** —
whether `skills` survives depends on the `job_enrichments` walk, feedback granularity depends on
`job_feedback`'s shape (unfinalised per D-48), and the v1.0/v1.1 framing needs the full table set to
draw a line through. The session then ran schema-first and produced sixteen decisions.

### The correction that mattered most

A priority rule was agreed — `high` = background_match + at least one of AI/technical — and then
Sakshi said, in the same message, that she is **non-technical and looking for non-tech roles**. The
rule just agreed would have promoted technical roles she'd struggle with straight into her
notifications.

Tracing where "technical = good" came from: **nobody decided it.** D-53 listed the rule's inputs as
"background_match + AI focus + technical + IIT/IIM barrier", carried forward from the original
`recommend` prompt in the initial commit. It was never checked against her profile. Fixed in **D-63**:
`is_technical` leaves the rule entirely, `technical_depth >= 4` downgrades, `is_ai` stays positive.

This was the third instance in one session of **inherited-not-decided** material driving design:
1. The five pipeline "stages" were never chosen — they come from the initial commit. D-6 only decided
   the versioned-row storage model, and "stage" is that column's name. Four of the five *describe* a
   job; `recommend` is the **delivery gate**. D-37 trimmed the list as if all five were equivalent,
   which would have left `notify`'s `priority` filter with nothing to match and delivered **zero**
   notifications — caught only by D-53.
2. "Technical is a positive signal" (above).
3. Seven `qualify` columns for a feature whose core concept — what lanes A/B/C/D mean — was never
   defined (D-60).

### `background_match`, specified from real evidence

Sakshi supplied a screenshot of the tags she has been assigning **by hand in Notion for months**:
`Support Company` · `Role Match – Support Work` · `Research Experience` · `HR Tech` · `CPG company`.
Those became the seed vocabulary (D-67) — evidence of what she actually tags, not a guess. Her
background for the matcher: MBA in HR, product support, BSc, fundamental research at TIFR, two HR
internships. Closed vocabulary rather than free-form, because label drift makes tags uncountable and
makes the priority rule **unstable across re-runs**. Novel matches go to a separate suggestion field
that the rule never reads until she promotes them (D-68).

### A question that reversed an earlier answer in the same session

Sakshi asked whether the feedback button could double as `classify` validation. It can — and that
**inverts** the recommendation made an hour earlier. Job-level thumbs had been proposed on build-cost
grounds; but if feedback is the validation instrument, "this job was wrong" cannot say whether `is_ai`,
`technical_depth`, or `background_match` failed. **Per-field is required, not preferred** (D-69,
resolving D-49). The earlier recommendation had optimised cost against the wrong purpose.

### An empirical check that went against the assistant

A "hybrid trap" false-negative risk was raised (JDs saying "hybrid" as company policy while the role is
remote). Sakshi asked for evidence from the web rather than argument. **The evidence contradicted the
claim** — what is documented is the opposite failure, jobs advertised as *remote* that turn out
hybrid/onsite. Her reasoning held: a wrongly-dropped posting must say "hybrid" *and* describe remoteness
using vocabulary outside `/remote|work from home|wfh|distributed|anywhere/`. Claim withdrawn.

### Decisions — D-60 → D-75

| # | Decision | Relationship |
|---|---|---|
| D-60 | Drop the seven `qualify` columns from `0003`; restore the `stage` CHECK | closes D-37/D-24 residue |
| D-61 | No manual "chance of selection" field — priority is always computed | **amends D-37** |
| D-62 | The priority rule stated exactly (high/med/low + downgrades) | completes D-53 |
| D-63 | `is_technical` is a downgrade, not a positive; `technical_depth >= 4` demotes | **amends D-53** |
| D-64 | `iit_iim_required` downgrades, never filters | clarifies D-53 |
| D-65 | Notify `high` + `med` only; `low` stored, never sent | **extends D-58** |
| D-66 | `recommend_reasons` generated deterministically | follows D-53 |
| D-67 | `background_match` = AI over a CLOSED vocabulary from her real Notion tags | implements D-46/D-47 |
| D-68 | `background_match_suggested` is separate and never feeds the rule until promoted | companion to D-67 |
| D-69 | Feedback is **per-field** — it is the classify validation instrument | **resolves D-49** |
| D-70 | No review queue, no review agent; uncertainty marker on the notification | **amends D-7** |
| D-71 | Validate classify by hand-tagging 20–30 JDs; `recommend` by unit tests | new |
| D-72 | Persist dropped postings with a reason; exclude from `enrichPending()` | new |
| D-73 | `geo_explicit` separates "explicitly eligible" from "assumed eligible" | new |
| D-74 | `company_watchlist.weight` has no ranking effect in v1 | confirms D-53/D-52 |
| D-75 | A second targeted AI pass re-checks geo-eligibility on assumed rows | **extends D-73** |

Also confirmed, not newly numbered: **`domain` and `background_match` both stay in v1** — accepted as
stored-now-used-later for `domain`, justified because it rides on a classify call already being made
(a few output tokens), which is materially different from `skills`, a full extra round-trip.

### Principle extracted (see `learnings.md`)

**Distinguish "we know X" from "we defaulted to X".** Surfaced three separate times in one session —
`salary_status` (stated vs. mentioned-but-unparsed), `remote_type` (explicit vs. assumed),
`background_match` (matched vs. suggested). In each case the schema collapses both into a single value,
and that collapse is exactly what makes the failure invisible and the failure *rate* unmeasurable.

### Verified defects found (all in `backlog.md`, all grep-confirmed)

`v_jobs_enriched` never projects `remote_type` → the Remote-India chip can never render and `recommend`
gets `undefined` · `company_watchlist` has no loader · `ai_usage` has no FK to `job_enrichments` so
tokens can't be attributed to an attempt · `est_cost_usd` is permanently 0 · `locked_fields` has never
executed once · three `package.json` scripts point at non-existent files · nine schema objects have zero
readers · only `parseSalary` has a test.

### Next steps (ordered)

0. **Decide the one open question left on the table:** does `remote_type != 'remote_india'` suppress the
   notification? Nothing gates on it today — ingest fails open by design, `notify` filters on `priority`
   only, and D-53 removed remote_type from the rule, so a job correctly tagged `remote_global` is still
   notified. Session 9's read is that the gate belongs at notify: cheap regex at ingest, real judgment
   at delivery, uncertain cases still arriving marked "(assumed)".
1. **Finish the schema walk** — still incomplete. Remaining: the `job_enrichments` classify block,
   `job_events` taxonomy, `remote_companies` columns (D-44), `v_freshness`, `v_company_rollup`, and the
   final shapes of `job_feedback` and `remote_companies`. **`job_tracking` must be re-opened** — Session
   8 marked it ✅ ("moves to tracker module whole", D-42) but `writeEnrichment.ts:31-36` reads its
   `locked_fields` on every enrichment write, so the module boundary does not close.
2. **Close the remaining schema calls** listed in `scope.md`'s "Still open": `job_feedback` attaching to
   `job_id` vs `enrichment_id` · the three salary questions · trace/eval columns in v1 or v2 · rollup
   tables vs views · `locked_fields`' fate · `resume_match` columns after D-38 · `ats_type`/`ats_slug` ·
   `recruiter_linkedin`.
3. **Then resume the scope cut** — the `skills` stage is still parked (cut to v2 / regex / keep), as is
   the v1.0/v1.1 framing question.
4. **Then write migration `0003`** and apply `0001`+`0002`+`0003` to `cdjgxrmeoqiogylveagr`.
   **Still the master blocker — nothing has ever run.**
5. **Code changes that travel with it:** pipeline `ORDER`; `enrichPending()` repointed off `recommend`;
   `apify.ts:15` URL split (D-41); **`recommend` rewritten as the D-62/D-63 rule**; `institute_requirement`
   → regex (D-57); notification de-tiering (D-58) + high/med-only gate (D-65); remove the Notion upsert
   (D-59); **add `c.remote_type` to both view definitions**; dropped-posting persistence (D-72).
6. **Run the fixture end-to-end**, then the one real Apify run — still the single thing unblocking
   cadence, cost, and coverage.
7. Files touched this session: `decisions.md` (**D-60→D-75**, four amendment pointers added to D-7, D-49,
   D-53, D-58), `scope.md`, `learnings.md` (four entries), `backlog.md` (verified-defects section),
   `plans.md`, `session-summary.md`. **No functional application code changed.**

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided. In particular, D-53's stated input list is superseded by D-63 —
reading D-53 alone will give you the wrong priority rule.*

---

## Session 10 — 2026-08-04 (user-research interview: why this exists, and is v1 still aligned)

### What happened this session

**No code touched.** This was a user-research session, not a build session: Claude interviewed Sakshi
one question at a time to reconstruct the project's actual origin story, pain points, and whether v1
scope still matches a real need — something none of the 11 standing docs captured (they're dense with
*what was decided*, thin on *why*). Plan approved via plan mode
(`~/.claude/plans/ask-me-questions-with-snappy-lerdorf.md`, copied into `plans.md` Session 10 entry).
Output landed in a new file, **`user-research.md`**, written incrementally with direct quotes.

**Origin and manual-process findings (Blocks 1–2).** Confirmed in her own words: the core manual loop
was look-at-jobs → analyze match → find referral targets by company/alumni overlap (ex-Infosys,
St. Xavier's, Wellingkar) → hand-draft a different 300-word LinkedIn message per person → track who
was asked and follow-up dates in Notion → miss follow-ups when sick or unmotivated, while jobs fill
fast. Remote-only is a hard preference (she has a small child), and notification fragmentation across
LinkedIn email + the platform itself caused her to lose track of postings — this is the real problem
behind D-40/D-58/D-59 (Gmail-as-benchmark, Telegram-only, Notion dropped), not just tooling preference.

**Two things surfaced that aren't in `scope.md` at all:**
- **JD-to-resume module is built but still broken.** It exists specifically to stop AI from fabricating
  résumé experience (named example: inventing UAT experience because UAT was a JD keyword), but "it is
  not working as it should." Logged in `backlog.md` as **self-reported, not yet grep-verified** —
  distinct from the Session 9 "Verified defects" list.
- **Skill-gap → portfolio action step** — a brand-new idea (came to her during this session): beyond
  detecting a skill gap, act on it (build something to demonstrate the missing skill, feed it back into
  the portfolio/résumé). `scope.md`'s v2 "skill-gap analytics" covers detection only. Logged in
  `backlog.md` under Candidate improvements.

**The $0 constraint (D-5) has a reason now.** Previously recorded as just "Sakshi's hard constraint,"
now confirmed: this is explicitly a **portfolio project** (see below), and the paid JD-to-resume tools
she looked at were "very expensive" — reinforcing the same constraint from two directions. Added as a
non-decision pointer under D-5 in `decisions.md` (no new decision number — nothing changed, only the
reasoning became known).

**Major reframe: this is a portfolio project, not purely a private tool.** No prior doc stated this.
She was unsure at first whether that meant literal artifact review (a hiring manager reading
`decisions.md`) or narrative/talking-point value (being able to explain what she scoped and traded off
in an interview) — she confirmed it's the latter, and plans a separate portfolio page describing how
she used AI, rather than expecting the repo itself to be read cold. This produced the first explicit
**definition of done** anywhere in the docs, in her words: *"it needs a clear story you can tell, and
it needs to have actually helped you land something."* Neither criterion is "the pipeline runs
end-to-end" — worth weighing scope against these two outcomes specifically, not implementation
completeness.

**The verification gap has a named root cause.** Every session since 7 has ended noting "the pipeline
has never run once" as a technical status. This session got the human reason: *"I have designed for
architecture for future but realized I let Claude plan details that I didn't want or need right now.
So I am doing a schema recheck and a product re-check."* She independently named three examples of
over-planned detail — the Lane Engine (already correctly deferred to v2, good confirmation), the
notification design (already partly trimmed), and **"the stages"** — the `classify → skills → salary`
model, which is currently marked **architecture frozen (D-28)**, not deferred. She added: *"initially
there were 5 stages and the modules Claude decided"* — i.e. even the current 3-stage version may still
carry structure she never deliberately chose. **Not resolved in this session on purpose** — designing
the right stage count live here would repeat the exact pattern she just flagged. Logged as an open item
in `backlog.md`, connecting to the same failure mode `CLAUDE.md`'s decisions-vs-setup-docs rule was
written for after D-30 — this is (at least) a fourth instance of it on this project, this time
self-caught by Sakshi before any external flag.

**Confirmed via her real Notion tracker (screenshots).** Field set matches what `decisions.md` assumed
from indirect evidence: `Background Match` tag values (e.g. "HR Tech," "Support Company," "CPG
company") match D-67's vocabulary source exactly; `Chance of Selection` (High/Mid/Low) is the literal
manual field D-37/D-61 reference. Her direct answer when asked which fields the built system already
automates: **"All of them are manual in Notion."** Sharpens the verification-gap finding — the gap
isn't abstract (pipeline untested); zero automation has reached her actual day-to-day routine, and she
is currently running her job search entirely on the old manual process in parallel with building the
tool ("I am doing it manually").

**Session hit a context-window wrap mid-interview, then resumed and finished the same day.** Block 12
(feature-by-feature v1 alignment pass) picked back up after the wrap. Her answer: Discovery, Tagging,
and the Feedback loop (items 1, 2, 5) are solidly grounded, no pushback. She asked for critique on the
rest anyway.

**Claude's critique on Recommend and Notify (Block 12).** Recommend (item 3) is grounded in principle
(she fills "Chance of Selection" by hand today) but never validated in practice — `D-71` validates
`classify` against hand-tagged JDs, nothing backtests the `recommend` rule against her real Notion
history. Notify (item 4) was flagged as an untested assumption, then confirmed as a real problem: **she
checks WhatsApp, not Telegram.** Checked WhatsApp's actual pricing rather than assume it (web search,
2026-08-04): no subscription fee, but business-initiated notifications (what this bot would send) bill
per conversation/category with no monthly free allotment — conflicts with the D-5 $0 constraint, so
it's not a drop-in fix. Logged as an open, undecided item in `backlog.md` (Telegram doesn't match her
attention; WhatsApp doesn't match the budget).

**Bigger structural question, prompted by her own follow-up: should the tracker be a separate module at
all?** Claude's critique: the *conceptual* split (discover vs. track) is sound, but the tracker's
*infrastructural* separation (own Supabase project → lost referential integrity, duplicated Telegram
integration, a from-scratch repo for the module that owns her single biggest named pain point —
referrals) looks like the same "Claude decided structure I didn't ask for" pattern from Block 8, one
level up. **She confirmed the premise doesn't hold:** "I'm really not building one module at a time" —
directly contradicting `WORKSPACE.md` `D-1`'s stated reasoning ("built in parallel isolated Claude
sessions"). Notably, `D-1` **already pre-approved this exact reversal** ("reversible to a monorepo via
subtree-merge if the workflow assumptions change") and named the precise trigger ("one dev routinely
edits many modules at once") — now met. Claude's recommendation: collapse the infrastructure split
(one repo, likely one Supabase project) while keeping the conceptual module boundaries for the
portfolio "clear story" reason. job-scout and the tracker are cheap/free to fold in; resume-builder
(live repo + Vercel deploy) is the real cost and **was not independently inspected this session** —
verify before committing. **Not executed or logged as a settled decision** — flagged against `D-1` in
`WORKSPACE.md` and as an open item in `backlog.md`, explicitly awaiting Sakshi's go-ahead.

**Pattern now confirmed twice in one session, at two different altitudes:** structure assumed rather
than tested against how she actually builds solo — first the stage-count/schema question (Block 8),
now the workspace-level module split (Block 12). Both logged as open items requiring dedicated
sessions, neither resolved inside this research session on purpose.

### Decisions/amendments made
- No new numbered decision anywhere. One non-decision pointer added under **D-5** (`decisions.md`,
  job-scout) recording the now-known reasoning behind the $0 constraint. One **flagged, not-decided**
  reconsideration note added under **D-1** (`WORKSPACE.md`) — explicitly not a decision or amendment,
  a pointer to an open proposal awaiting Sakshi's confirmation.

### Files touched this session
`job-tracker/user-research.md` (new, now complete through Block 12 + a closing synthesis),
`job-tracker/decisions.md` (D-5 pointer only), `job-tracker/backlog.md` (five additions: skill-gap
action step, stage-count/module-boundary open item, JD-to-resume self-reported bug, Notify-channel open
item, workspace module-split open item), `job-tracker/plans.md` (Session 10 plan copied in, outcome
noted), `../WORKSPACE.md` (flagged reconsideration note under D-1, not a decision). **No functional
application code changed anywhere in the workspace.**

### Next steps
1. **Get Sakshi's explicit go-ahead on the workspace module-split question**, then run the actual
   monorepo migration as its own dedicated session — inspect resume-builder's real repo first rather
   than trusting the "low-risk" characterization blind.
2. **Decide the Notify channel** — accept Telegram's attention-fit gap, find another genuinely-free
   channel, or revisit the $0 constraint itself — and log whichever is chosen properly.
3. **Backtest the `recommend` rule** against Sakshi's real historical Chance-of-Selection values in
   Notion before trusting it in v1 — cheap, the data already exists.
4. **Schedule the stage-count/module-boundary recheck as its own session** (not folded into research or
   general building) — re-derive `classify → skills → salary`'s shape from actual v1 need, log the
   outcome in `decisions.md` properly, don't let it stay silently "frozen" (D-28) if it no longer fits.
5. **Investigate the JD-to-resume fabrication bug** — grep/read the relevant module before it graduates
   from "self-reported" to "verified defect" in `backlog.md`.
6. **Decide where the skill-gap → portfolio action step goes** (v2/v3, or explicitly out of scope) —
   currently just a candidate idea in `backlog.md`.
7. **The still-master blocker from Session 9 is unchanged and still applies:** migration `0003` has
   never been written or applied to `cdjgxrmeoqiogylveagr`; nothing has ever run end-to-end. This
   session sharpens *why* that matters — it's not just an engineering gap, it's the entire reason zero
   automation has reached Sakshi's real workflow yet.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided. In particular, the workspace module-split question and the Notify
channel are both **open and unresolved**, not settled — don't build against either as if Sakshi already
chose.*

---

## Session 11 — 2026-08-04 (workspace module-split decided: `WORKSPACE.md` D-9)

### What happened this session

**Picked up directly from Session 10's open item.** Plan-mode session to resolve the workspace
module-split question Session 10 left flagged but not decided. Read `WORKSPACE.md` D-1, `decisions.md`,
`backlog.md`, `plans.md`, and `user-research.md` fresh per that session's own closing instruction,
rather than trusting a memory snapshot.

**Verified D-1's premise directly against git history, not assumed.** resume-builder's 21 commits span
2026-07-01 → 2026-07-02; job-tracker's first (only) commit is 2026-07-31 — a full month later. This
confirms what Session 10 suspected: the modules were built **sequentially, solo**, not "in parallel
isolated Claude sessions" as D-1 stated. D-1 itself had pre-approved reversal on exactly this trigger.

**Asked Sakshi for direction rather than assuming it.** First presented the confirmed-vs-inferred pain
distinction (her own words vs. Claude's downstream inference); she asked for the actual pain named
concretely before choosing. Then asked directly "what do you say" — Claude recommended merging now
(cheapest moment: job-tracker has 1 commit and no remote; waiting means duplicating the not-yet-built
tracker/notify work). She approved.

**Checked resume-builder's real repo for merge risk before finalizing the plan** (her explicit request,
mid-plan-mode, after an initial plan draft) — same discipline as [[feedback-verify-before-recommend-architecture]] now names: don't trust D-1's own "low-risk" label unverified. Found: no code-level
blocker (no `vercel.json`, no hardcoded paths, no CI, env vars all via `process.env`). **One real risk**:
resume-builder's live Vercel URL is quoted in her recruiter-facing case-study docs
(`case-study.md`, `pm-case-study.md`, `case-study-prompt.md`) — the migration must reuse the existing
Vercel project and only change its Root Directory setting, never create a new project, or those links
break. Also found resume-builder's own `docs/PLANS.md` already has a prior, different-shaped move plan
that needs reconciling when the actual migration runs.

**Executed the low-risk half only.** Corrected D-1's false premise in `WORKSPACE.md` (appended, not
rewritten), logged the reversal as a real numbered decision (**D-9**), added cross-reference footnotes
at `decisions.md` D-29/D-38/D-42, marked the `backlog.md` open item resolved, and copied the full Part 2
migration checklist into `plans.md` for durability. **No code moved, no repo merged, no Vercel/Supabase
settings touched** — the actual migration stays a dedicated future session, same discipline as every
other "don't execute inside a decision session" item this project has logged.

### Decisions/amendments made
- **`WORKSPACE.md` D-9** (new): reverse D-1, collapse the polyrepo into a monorepo
  (`packages/resume-builder`, `packages/job-scout`, `packages/tracker`), conceptual module boundaries
  unchanged. Includes the Vercel-URL preservation requirement as a hard constraint on execution.
- **`WORKSPACE.md` D-1**: annotated with a correction (premise was false) and a pointer to D-9 — original
  text preserved, not rewritten.
- **`decisions.md` D-29, D-38, D-42**: footnoted as superseded/affected by D-9 — no content rewritten.

### Files touched this session
`../WORKSPACE.md` (D-1 correction, new D-9, two pointer annotations), `job-tracker/decisions.md` (three
footnotes), `job-tracker/backlog.md` (one item resolved), `job-tracker/plans.md` (Session 11 plan + full
migration checklist copied in), `job-tracker/learnings.md` (one entry marked reversed, one new entry
explaining the reversal in plain language). Memory updated: new feedback note on verifying architecture
recommendations against the real target system before trusting a prior risk label, and giving a direct
recommendation when asked "what do you say." **No application code changed.**

### Next steps
1. **Run the actual monorepo migration as its own dedicated session** — full checklist now in
   `plans.md` Session 11 entry: repo unification (subtree-merge, preserve history), reuse the existing
   `zenarcha/Resume-Builder` GitHub repo and Vercel project (do not create new ones), Supabase
   consolidation (resolve job-tracker's own migration `0003` blocker *first*), `app-os-contracts` fate,
   env-var collision fix (`GEMINI_API_KEY`/`CEREBRAS_API_KEY` are identical names in both apps),
   verification checklist before declaring success.
2. **Decide the Notify channel** — still open from Session 10 (Telegram doesn't match her attention,
   WhatsApp isn't free).
3. **Backtest the `recommend` rule** against Sakshi's real Notion history — still open from Session 10.
4. **Schedule the stage-count/module-boundary recheck** — still open from Session 10, unrelated to this
   session's workspace-level fix.
5. **Investigate the JD-to-resume fabrication bug** — still open, self-reported not yet verified.
6. **Decide where the skill-gap → portfolio action step goes** — still open from Session 10.
7. **Migration `0003` is still the master blocker** — and per this session's finding, it should be
   resolved *before* the Supabase-consolidation step of the monorepo migration, not after.

*Before starting next session: read the decision log and this summary entry fresh — don't rely on a
memory snapshot. The monorepo migration (D-9's execution) is decided in direction but NOT yet run —
don't build against `packages/*` paths as if they already exist.*

---

## Session 12 — 2026-08-05 (schema walk finished; consolidated schema + pipeline built; D-76→D-87)

> Sessions 10 and 11 ran in parallel with this one and landed first. This session's plan was written
> when it still looked like "Session 10" — corrected at wrap time by re-reading the file rather than
> trusting the number. Decision numbering was unaffected: neither parallel session wrote to
> `decisions.md`, so D-76→D-87 continue cleanly from D-75.

### How the session went

Opened as "build D-75's geo-recheck," and the first thing that happened was Sakshi stopping it —
*"do not implement. let us finish the schema run through."* Correct call: the geo work would have been
a standalone migration jumping ahead of the batched one the docs had been planning since Session 8, and
the schema walk had eight tables never reviewed at all.

**The walk then produced twelve decisions and, more usefully, three corrections to things this session
had already asserted.** Those are worth more than the decisions.

### Where Claude was wrong, and what corrected it

1. **Invented a `job_feedback` shape without checking whether one was decided.** It was — D-48 had
   specified `(job_id, stage, field, verdict, corrected_value)` months earlier. The invented version had
   a free-text `note` instead of `corrected_value`, which sounds cosmetic and isn't: a note is something
   a human reads, a corrected value is something the system can *use* — it's what lets a correction
   actually become the lock D-48 designed. **Third instance of the inherited-not-decided pattern
   inverted:** not carrying forward an undecided thing, but failing to look for a decided one.
2. **Recommended storing both `job_id` and `enrichment_id`, then withdrew it.** Sakshi asked whether
   other AI companies do it this way. Checking LangSmith's live feedback schema showed `run_id` +
   `correction` with no redundant parent id — which overturned the recommendation made minutes earlier.
   The check took one search; the design is better for it (D-84).
3. **Claimed "we don't need ATS at all" was settled, when it was too broad.** Sakshi's instinct — that
   configuring N ATS vendors is unnecessary work when AI could just read a careers page — was right
   about the *manual configuration*, not about ATS APIs themselves. Where a company runs on Greenhouse,
   its public JSON API is strictly better than AI-reading HTML. What died is per-company config (D-79),
   not the structured route (D-87).

### The empirical test that decided the careers-page design

Rather than reasoning about whether "AI reads the careers page" works, it was tested against four
companies Sakshi named from her live LinkedIn feed. **Lyzr AI** — clean success. **MakeMyTrip** — plain
fetch timed out twice, worked only under real browser rendering. **Flam** — the listing is indexed by
Instahyre/Naukri/Glassdoor but **404s on Flam's own site** (Sakshi's "maybe they don't list internships"
theory checked and disproved). **Zigsaw** — a staffing consultancy, not a product company; the PM roles
found belonged to an unrelated firm. One clean hit in four, with three distinct failure modes — all now
designed around in D-87, and none of it built, because the watchlist is empty and the pipeline has
never run.

### The longest-standing open question, closed

**Does `remote_type != 'remote_india'` suppress the notification?** Open since Session 9, listed first
in that session's next steps. Answered: yes (D-76). Also settled, deliberately: the geo recheck's own
verdict does **not** additionally gate delivery — an `ineligible` job is still sent, marked. Walked
through with a flow diagram and confirmed on the reasoning that a false positive costs 30 seconds of
reading while a false negative costs a role she'd never know existed, and that this pass's accuracy is
unmeasured until D-71's hand-tagging runs.

### Decisions — D-76 → D-87

| # | Decision | Type |
|---|---|---|
| D-76 | Telegram sends `remote_type = 'remote_india'` only | resolves a Session-9 open item |
| D-77 | Feedback capture built now, geo-scoped, by polling not webhook | reverses an in-session call |
| D-78 | `profile` reshaped to mirror resume-builder's `candidate_profile` | amends D-46 |
| D-79 | `company_watchlist` drops `ats_type`/`ats_slug` | closes a Session-8 open item |
| D-80 | Résumé matching leaves job-scout entirely | completes D-38 |
| D-81 | Salary: `CHECK` on period, three-way status, LPA-only promotion | closes three open items |
| D-82 | `skills` stays v1 with `{skill, required}`; scoring → v3 | resolves a "challenge this" flag |
| D-83 | `background_match` vocabulary lives in `app_config` | extends D-67 |
| D-84 | `job_feedback` attaches to `enrichment_id` only | resolves D-69's open question |
| D-85 | `ai_usage` gains `enrichment_id`; call order flips | closes a D-51 gap |
| D-86 | **Migrations squashed into one `0001`; there is no `0003`** | supersedes D-60's phrasing |
| D-87 | Careers-page checker replaces ATS polling; deferred to v3 | new, evidence-gated |

### What was built, and what was verified

**Built:** one consolidated `0001_schema.sql` (`0002_lane_ready.sql` deleted); new `geoRecheck.ts`,
`instituteRequirement.ts`, `profileBlurb.ts`, `feedback.ts`, `run-feedback-poll.ts`; rewritten
`recommend.ts` (AI call → D-62's rule), `writeEnrichment.ts` (locks from `job_feedback`), `notify.ts`,
`telegram.ts`, `classify.ts`, `salary.ts`, `skills.ts`, `pipeline.ts`, `ingest.ts`, `apify.ts`;
deleted `resumeMatch.ts`.

**Verified:** `npm run typecheck` clean; **27 tests passing, up from 5** — the deterministic
`recommend` rule is now pinned by unit tests exactly as D-71 asked for.

**A real bug the new tests caught:** the first implementation of `unrecognizable_format` fired on
"Competitive salary and great benefits" — a posting with no figure in it at all. That would have
inflated the parser-failure metric with every posting that says "competitive salary," destroying the
one number the three-way split exists to produce. Detection now requires a digit near the pay context.

**NOT verified — nothing has touched a database.** The Supabase MCP connector still cannot see
`cdjgxrmeoqiogylveagr`; `list_projects` returns only the old INACTIVE project and an unrelated one,
exactly as D-36 reported in Session 6. Phase B is written but untestable — `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` are empty.

### Judgment calls made during implementation (not in the approved plan)

Each could reasonably go the other way; all are recorded so they can be revisited rather than
rediscovered:
1. **`corrected_value` is `jsonb`, not `text`** — it must round-trip `false`, `3`, `["HR Tech"]`.
2. **A thumbs-down with no corrected value does not lock the field** — it still counts for D-71's
   accuracy measurement, but there's no known value to pin.
3. **D-62's "downgrade one level when X or Y" is read as one level total** even when both fire.
4. **The salary promotion is applied after the downgrade**, following the order D-62 lists its clauses
   — so a well-paying but deeply-technical role can land back at `high`. Both 3 and 4 are pinned by
   tests, so changing them is one line plus a test update.
5. **The `stage` CHECK has five values, not the six confirmed mid-session** — `resume_match` was
   dropped because D-80 removed its columns, so such a row would have nowhere to write. Flagged in the
   plan before writing, not applied silently.

### Next steps (ordered)

0. **Apply the schema — still the master blocker, and now the only thing between this repo and its
   first-ever real run.** Requires resolving the Supabase access problem first: either reauthorize the
   MCP connector against the account owning `cdjgxrmeoqiogylveagr`, or paste `0001_schema.sql` into the
   Supabase SQL editor by hand. **Per Session 11, this should happen BEFORE the monorepo migration's
   Supabase-consolidation step, not after.**
1. **Run the fixture end-to-end** — `npm run ingest -- --file tests/fixtures/sample-linkedin.json
   --source linkedin`, then `npm run enrich`. Needs no Apify token, and `GEMINI_API_KEY` is set, so
   this is a genuine first validation. Confirm: `geo_explicit` populated; a `geo_recheck` row **only**
   for assumed-eligible jobs; `background_match` drawn only from the seeded vocabulary; dropped
   postings persisted with a reason rather than vanishing.
2. **Fill `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`**, then verify one message per chip state and one
   👍/👎 round-trip through `npm run feedback:poll`.
3. **Then `APIFY_TOKEN` and the one real Apify run** — still the single thing unblocking cadence, cost,
   and coverage, and still blocking the actor confirmation (D-30).
4. **Sign off or replace `remote_companies`' columns** — the only thing in `0001_schema.sql` marked
   `<!-- UNREVIEWED DEFAULT -->`. D-44 decided the table exists but never fixed its shape.
5. **Carried from parallel sessions, untouched here:** the JD-to-resume fabrication bug (self-reported,
   unverified); where the skill-gap → portfolio action step belongs; backtesting `recommend` against
   her real Notion history; the monorepo migration itself (decided in direction, not run).
6. **Cross-module, different repo:** `resume-builder/candidate_profile.skills` is flat and should
   become grouped-by-category to match D-78. Needs its own decision entry and migration there.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided. Two specific traps: **there is no migration `0003`** (D-86 squashed
everything into `0001`, and older entries still say "0003"), and **D-53's input list is superseded by
D-63** — reading D-53 alone gives the wrong priority rule.*

---

## Session 13 — 2026-08-06 (canonical Supabase project changed before applying schema)

### What happened this session

**Opened to execute Session 12's "step 0"** — apply the never-applied `0001_schema.sql` to
`cdjgxrmeoqiogylveagr` — but re-verified the blocker fresh rather than trusting the prior write-up.
Called the Supabase MCP connector directly: it still only sees org "Hello Bump" with the same two
`INACTIVE` projects (the old job-tracker and `funded-company-v1`); `cdjgxrmeoqiogylveagr` remains
invisible to it, unchanged since Session 6.

**Re-opened `WORKSPACE.md` D-9's still-unresolved consolidation question before applying anything.**
D-9 (the polyrepo→monorepo reversal) already flagged "likely also consolidating onto one Supabase
project... Sakshi's call, not yet executed." Applying schema to a project that might get abandoned
during that consolidation would be wasted work, so this got resolved first.

**Inspected both modules directly instead of trusting the prior lean.** Session 11's `plans.md`
write-up had leaned toward `cdjgxrmeoqiogylveagr` as canonical, but that call was made without
inspecting either project. Checking `.env` files and each module's `supabase/migrations/` directly
found they are not symmetric:
- resume-builder's project (`xxfeagpjaxudhbihjruq`) is **live** — 5 migrations already applied
  (`candidate_profile`, `applications`, `tailor_runs`, `review_decisions`, `evidence_bank`), backing a
  real Vercel deploy whose URL is quoted in her recruiter-facing case-study docs.
- job-tracker's project (`cdjgxrmeoqiogylveagr`) has **never had any schema applied** and backs
  nothing live — confirmed empty.

No table-name collisions exist between the two schemas. Sakshi asked for a direct recommendation
rather than options; given the asymmetry, moving the empty side toward the live side is the low-risk
direction — the reverse would mean exporting real data out of a live, recruiter-facing product for no
benefit.

**Executed the database-target swap (not the full D-9 monorepo migration — that stays separate).**
`WORKSPACE.md` D-9 amended with the decision; job-scout `decisions.md` **D-88** logged; `.env`
repointed (`SUPABASE_URL`/`SUPABASE_ANON_KEY` now target `xxfeagpjaxudhbihjruq`, copied from
resume-builder's own `.env.local`; `SUPABASE_SERVICE_ROLE_KEY` cleared since the old value belonged to
the now-superseded project and this project never had one to begin with). `npm run typecheck`
reconfirmed clean after the swap.

### Decisions / amendments
- **`WORKSPACE.md` D-9 (amended)** — canonical Supabase project is resume-builder's
  `xxfeagpjaxudhbihjruq`, reversing the unverified "lean `cdjgxrmeoqiogylveagr`" note from Session 11.
  Scope is the database only; the rest of D-9's checklist (repo unification, Vercel config,
  `app-os-contracts`) stays separate future work.
- **D-88 (new)** — job-scout side of the same decision; `cdjgxrmeoqiogylveagr` (D-36) is superseded as
  job-scout's target, left alone unused (free tier, no cost).

### Next steps (ordered, actionable)
1. **Sakshi:** fetch a service-role key for `xxfeagpjaxudhbihjruq` —
   `https://supabase.com/dashboard/project/xxfeagpjaxudhbihjruq/settings/api-keys` — paste into
   `.env`'s `SUPABASE_SERVICE_ROLE_KEY`. This project never had one before (resume-builder's client
   only used the anon key, RLS disabled), so it doesn't already exist anywhere to copy.
2. **Apply `0001_schema.sql` to `xxfeagpjaxudhbihjruq`** — the connector still can't see it either;
   needs reauthorization for whatever org owns it, or a manual paste into that project's SQL editor.
3. **Run the fixture end-to-end** once 1–2 are done: `npm run ingest -- --file
   tests/fixtures/sample-linkedin.json --source linkedin` → `npm run dispatch` → inspect
   `v_jobs_enriched` + `job_events`. This is job-scout's first-ever real database run.
4. **Still carried, untouched:** confirming the Apify actor explicitly, one manual Apify test run,
   `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (blocks Phase B verification), and the rest of `WORKSPACE.md`
   D-9's monorepo checklist (repo unification, Vercel root-dir change, `app-os-contracts` fate,
   env-var collision cleanup — including the pre-existing `GROK_API_KEY` vs. resume-builder's
   `GROQ_API_KEY` near-identical-name check flagged in Session 11).
5. Files touched this session: `WORKSPACE.md` (D-9 amendment), `decisions.md` (D-88 new), `plans.md`
   (this session's plan appended), `learnings.md` (one entry), `.env` (Supabase URL/anon key swapped,
   service-role key cleared pending a fresh fetch), `session-summary.md` (this entry). No application
   code changed.

### What happened, continued (same session, after the first wrap above)

The session ran well past that wrap and became a design session. Grouped by theme:

**The canonical-project decision collapsed within the hour.** D-88 chose `xxfeagpjaxudhbihjruq`
(resume-builder's live project) as canonical — then Sakshi discovered she **cannot access it at all**;
it does not appear under her current Supabase login. resume-builder's own `docs/DECISION-LOG.md` (#122)
shows her opening that exact project's dashboard on 2026-07-02, so access existed four weeks ago and
has since been lost, most likely a different Google/GitHub identity. **This endangers resume-builder,
not just job-scout:** the app keeps serving (runtime needs only URL + anon key), but migrations, data
inspection, key rotation, and **un-pausing after a free-tier auto-pause** all need the dashboard — and
both "Hello Bump" projects have already auto-paused, so that scenario is demonstrated, not theoretical.
Sakshi chose to sort access out before anything else. D-88's direction stands; its execution is parked.

**A scope gap surfaced: Sakshi expected the tracker to show the job list.** It doesn't — that's
job-scout's data. `WORKSPACE.md` D-7 retired "dashboard" as a *module*, which left it ambiguous where
the surface lived. Resolved as **D-89**: job-scout owns the all-jobs dashboard; the tracker owns only
post-decision state.

**Four rounds of mock iteration, each driven by a correction from Sakshi.** Every one of them caught a
real error:
1. *"I can't see the job details in the side panel."* I first blamed a CSS height chain. Wrong. The
   real cause: the panel was populated **entirely by JavaScript**, and the preview renders with
   `script-src 'none'`. Found only by opening the page and looking. Fix: first job's detail is now
   static HTML; JS only switches between jobs.
2. *"Why permanent?"* — my justification for a permanently-visible list ("you asked for a list") was
   weak; I'd turned an answer about *content* into a *layout* constraint it never was.
3. *"Maybe have a split view like LinkedIn"* (with a screenshot). This showed my **first** instinct
   (split view) was right and my execution was the problem — I had capped the JD at `max-height:300px`,
   which only looked acceptable because the test fixture's JD is two sentences. I had validated a
   reading layout against unrealistically short data.
4. *"Should Apply/Shortlist/Tailor be on top?"* — yes. Tier 1 delivers the decision in three lines, so
   scrolling past summary and skills to reach Apply was backwards.

**Two places I applied a principle without checking its premise, and Sakshi caught both.**
- *"No dead buttons — they erode trust"* assumes a user who doesn't know why a control is inert. She is
  the only user and knows exactly why. Her framing was sharper than mine: it's a fake door, and a
  fake-door test is meaningless when the only visitor already knows what's behind it. Reversed (D-93),
  and researched the right implementation at her request (`aria-disabled`, explanation on click, not a
  hover tooltip).
- *"Tailor résumé needs `@app-os/contracts` first"* was simply false. Contracts is a shared **types**
  package, not a prerequisite for two apps to talk. Checking resume-builder's source took two minutes
  and disproved it: `POST /api/triage` accepts `{ jd_text }` — exactly what job-scout stores as
  `jd_clean`. She rejected copy-paste twice before I checked (**D-95**).

**Her real JD exposed a genuine extraction gap.** She pasted a live A1Apps posting asking for "3–6
years of experience". Verified: **nothing extracts seniority** — zero matches for `seniority`,
`years_exp`, `yoe`. D-31 scoped v1 to entry-level titles, but that's enforced on the **title only**, so
a posting titled "Associate Product Manager" demanding 3–6 years passes the filter looking eligible
(**D-94** — extract and show it, but don't let it change the verdict until D-71's validation runs).

**The requirement itself got reframed by Sakshi.** "Look like LinkedIn / all the details" turned out to
mean *"better visual hierarchy and having things I find important on top"* — the opposite of
completeness, and a much better problem. She is separately **interviewing recruiters** about what
determines outcomes, so the tiers were designed to be cheap to reorder once that research lands.

### Decisions / amendments (continued)
- **D-89** — job-scout owns the all-jobs dashboard; the tracker does not.
- **D-90** — UI labels written for Sakshi, not lifted from column names. "Fit" rejected (collides with
  `background_match`); `background_match` deliberately unchanged because it is her own Notion word.
- **D-91** — 7 visible filters; `source` dropped entirely (LinkedIn is the only source, so it has one
  value); `remote_type` reframed as location *confidence*.
- **D-92 (OPEN)** — where the one-line role summary comes from. Recommended: add `role_summary` to the
  existing `classify` call. Needs Sakshi's yes — it's a cost implication per `CLAUDE.md`.
- **D-93** — open-job pane tiered; actions above the reading material; contact as signal-in-tier-1 +
  details-with-actions; not-yet-built controls shown, not hidden.
- **D-94** — years of experience extracted and shown as a blocker, but does not feed the verdict.
- **D-95** — "Tailor résumé" is a direct API call to resume-builder, not copy-paste. Amends D-38's
  direction (send the JD *to* resume-builder rather than pulling the résumé *into* job-scout).
- **`WORKSPACE.md` D-10** — `app-os-contracts` stays empty; fails the future-proofing gate, zero
  consumers.
- **`WORKSPACE.md` D-11** — modules may call each other over HTTP; that is a network boundary, not code
  coupling. Makes resume-builder's `/api/triage` and `/api/tailor` a public contract.

### Next steps (ordered, actionable)
1. **Sakshi: recover Supabase access.** Everything else is downstream. Check which login owns
   `xxfeagpjaxudhbihjruq`; if unrecoverable, decide between falling back to `cdjgxrmeoqiogylveagr`
   (accessible, empty) or creating a fresh project as canonical for both modules.
2. **One-minute check that needs no decision:** open
   `https://resume-builder-zenarchas-projects.vercel.app/api/resume/status` in a browser. It reports
   `{"uploaded": true/false}` straight from the database — the first real information about that
   project since access was lost, and it tells us whether the résumé data survived.
3. **Answer D-92** — `role_summary` from the classify call (recommended) or a `jd_clean` snippet.
4. **Answer D-95's open security question** — accept the unauthenticated endpoints and log the posture,
   add a login to resume-builder, or defer.
5. **Bring back the recruiter research** — it reorders the D-93 tiers rather than rebuilding them.
6. **Then build:** apply `0001_schema.sql`, run the fixture end-to-end, and only then the dashboard.
   Note Session 9's verified defect first: `v_jobs_enriched` never projects `remote_type`, so the geo
   chip cannot render until both view definitions are fixed.
7. **Carried, untouched:** Apify actor confirmation, one manual Apify run, Telegram tokens, and the
   rest of `WORKSPACE.md` D-9's monorepo checklist.
8. Files touched in this half: `decisions.md` (D-89→D-95), `WORKSPACE.md` (D-10, D-11),
   `learnings.md` (two entries), `dashboard-mock.html` (new, throwaway — delete once the real dashboard
   exists), `session-summary.md` (this section). **No application code changed all session.**

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided. One trap specific to this session: `.env` currently points at
`xxfeagpjaxudhbihjruq`, which Sakshi cannot access, and `SUPABASE_SERVICE_ROLE_KEY` is deliberately
empty — do not assume the repo is pointed anywhere usable.*

### What happened, continued again (same session, access blocker resolved)

Sakshi confirmed directly she cannot recover access to `xxfeagpjaxudhbihjruq` — next step 1 above is
closed, not pending. Rather than defaulting to "create a new project," re-ran the Supabase MCP
connector's `list_projects`/`list_organizations` live instead of trusting the memory file's claim that
it "has never seen either active project." That claim was stale: the connector reaches org "Hello Bump"
with two `ACTIVE_HEALTHY` projects, one of which is job-tracker's *original* project from D-14,
`gwvrpdkiblozwdwoqsgd` — already carrying a full 16-table schema (0 rows, RLS disabled). Sakshi confirmed
via the dashboard link that she still has access to it (a "did I delete this?" worry was a false alarm).

Checked whether a brand-new project would be cheaper or safer before recommending reuse: `get_cost` on
org "Hello Bump" quoted **$0/month** for a new project, so reuse wasn't the only zero-cost option — it
was chosen because it avoids a fourth project ref, not because a new one would have cost anything.
Sakshi's call: reuse `gwvrpdkiblozwdwoqsgd`, but treat it as a genuine fresh start — comparing its live
table list against the current `0001_schema.sql` confirmed her instinct that "schema has changed
drastically" (that project still has `resume_versions`/`job_tracking`/`decisions`/`status_history`, all
four deliberately removed since; the current schema adds `remote_companies`/`job_feedback`, absent
there). Decision: drop all 16 existing tables and reapply the current migration fresh, rather than
reconcile incrementally.

Also confirmed while re-reading the schema file that Session 9's verified `v_jobs_enriched` defect
(never projected `remote_type`) is **already fixed** in the current working-tree migration — no separate
action needed for it.

**Decisions:** `decisions.md` **D-96** (canonical project reversal + drop/reapply rationale);
`WORKSPACE.md` D-9 gets a second amendment recording the same reversal cross-module.

**Executed this half:** `.env` repointed to `gwvrpdkiblozwdwoqsgd` (URL + anon key via
`get_publishable_keys`; service-role key still needs Sakshi to fetch manually from
`https://supabase.com/dashboard/project/gwvrpdkiblozwdwoqsgd/settings/api-keys` — the MCP connector
doesn't expose secret keys). Schema drop/reapply and the fixture run follow once that key is in place.

**Schema applied — and a near-miss worth recording.** The drop was approved on my statement that all 16
tables held 0 rows. That statement was wrong. `list_tables` reports Postgres's cached `n_live_tup`
estimate, which sits at 0 for any table written to since the last ANALYZE — so it can be permanently,
confidently wrong, not merely stale. An exact `count(*)` run immediately before the drop found
`company_watchlist` = **11 rows** and `app_config` = **3 rows**. Stopped and inspected rather than
proceeding on the approval, because the approval had been given for facts that no longer held.

Both turned out discardable, and specifically so: the 11 companies are exactly the seed set **D-32
already ordered deleted** on 2026-08-01 (every row `created_at` 2026-07-09 21:40:49 — 21 seconds after
the original 0001 migration, i.e. the July seed run, untouched since), and the 3 config keys are
`0002_lane_ready` leftovers from the migration this consolidated 0001 replaces (D-86). So the drop went
ahead — but on verified grounds. `active_goal`="ai_pm" was the only value carrying any content and was
deliberately not carried forward; it belongs to the retired lane-ready design.

**Verified post-apply:** 14 tables + 4 views; `app_config` seeded with its 2 keys;
`job_tracking`/`decisions`/`status_history`/`resume_versions` confirmed gone (correct per D-42,
D-38/D-46); **`v_jobs_enriched` confirmed to project `remote_type`** — Session 9's long-standing defect
is now fixed in the live database, not just in the file. `npm run typecheck` clean.

**Next steps (ordered, actionable):**
1. **Sakshi: fetch the service-role key** from
   `https://supabase.com/dashboard/project/gwvrpdkiblozwdwoqsgd/settings/api-keys` → paste into `.env`.
   This is the only thing blocking the fixture run: `lib/db.ts:9` requires `SUPABASE_SERVICE_ROLE_KEY`
   via `req()` and the anon key is optional/unused by the client. Deliberately not routed around by
   switching the client to the anon key — server-only + service-role is a design choice, not an
   accident.
2. **Run the fixture end-to-end** (CLI flags verified against `scripts/run-ingest.ts`):
   `npm run ingest -- --file tests/fixtures/sample-linkedin.json --source linkedin` → `npm run dispatch`
   → inspect `v_jobs_enriched` + `job_events`. Job-scout's first-ever real database run.
3. **Settle RLS before real data lands.** All 14 tables have RLS disabled — Supabase's advisor rates
   this critical (anyone with the anon key can read/write every row). This is consistent with the schema
   file's own "RLS deferred to the dashboard build (Phase 7)" note, so it is not a new defect, but it is
   now a live database rather than a plan. Related to D-95's unresolved security question.
4. Everything else carried from the prior next-steps list (D-92, D-95's security question, recruiter
   research, Apify/Telegram, `WORKSPACE.md` D-9's monorepo checklist) is unchanged and still open.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

### The pipeline ran end to end for the first time (same session)

Sakshi pasted the secret key into `SUPABASE_ANON_KEY` rather than `SUPABASE_SERVICE_ROLE_KEY` — caught
before running anything. In Supabase's current key format `sb_secret_…` *is* the service-role key, so it
was moved to the right variable and the publishable key restored. Left as-is it would have failed anyway
(`lib/db.ts:9` reads the service-role var) while parking a secret in a variable named "anon".

**`npm run ingest` — job-scout's first-ever real database write.** 3 received, 2 inserted, 1 correctly
dropped (`ingest_filter:obviously_non_remote`). **`npm run dispatch`** then ran all stages.

**`gemini-2.5-flash` is dead** — Google returns a hard 404, *"no longer available to new users"*. The
non-AI stages (salary regex, recommend rule) succeeded exactly as designed while `classify`/`skills`
failed, which is the architecture working. Four candidate models were tested with real
`generateContent` calls rather than trusting the model listing (2.5-flash still *appears* in the listing
but 404s on use). Sakshi chose `gemini-3.6-flash` — **D-97**, pinned rather than a `-latest` alias so
classifier behaviour can't drift underneath D-71's validation. Re-run after the swap: all five stages
green on both jobs, real classification data landed.

**Two genuine defects surfaced by running it, neither findable by reading code:**
- **D-98 (open)** — cross-source dedup *works* (the fixture's deliberate near-duplicate pair was grouped
  correctly via `canonical_job_id`), but `v_jobs_enriched` never filters `canonical_job_id is null` the
  way `v_company_rollup` does. The dashboard would list one job twice. Worse: each duplicate is enriched
  separately and returns a **different verdict** — measured on this pair, `technical_depth` 3 vs 4,
  `institute_requirement` preferred vs none, and **`priority` med vs low**. An unprompted live
  measurement of exactly the classifier instability D-71 exists to quantify.
- **D-99 (open)** — `enrichPending` calls a job done if it has a `recommend` row, but `recommend` is a
  deterministic rule that succeeds even when every AI stage failed. Both jobs looked complete while
  holding no classification; `--all` reported `processed: 0` and retries were silent no-ops. Recovery
  needed each job id by hand.

**Decisions:** **D-97** (Gemini model) · **D-98** (open — duplicate rows in the enriched view) ·
**D-99** (open — completion check keys off the wrong stage).

**Next steps (ordered):**
1. **Answer D-98 and D-99** — both are correctness issues in the read path the dashboard is about to be
   built on, so they land before the dashboard, not after.
2. **Settle RLS** — still disabled on all 14 tables (Supabase advisor: critical). Fine while this is
   fixture data; not fine once real postings land. Ties into D-95's open security question.
3. **D-92** (role summary source) — still unanswered, still blocks the dashboard's tier-4 content.
4. **Then the dashboard** (D-89/D-93), with the recruiter research reordering the tiers.
5. **Carried, untouched:** Apify actor confirmation and a manual run, Telegram tokens, the rest of
   `WORKSPACE.md` D-9's monorepo checklist.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided. The pipeline now genuinely runs end to end against a live database
— that is new as of this session and invalidates every earlier note saying "nothing has ever run".*

---

## Session 14 — 2026-08-06 (both live-run defects fixed and verified; Apify actor finally decided; D-98→D-100)

Started by re-reading the decision log and this file fresh rather than trusting the handoff — which was
right, because the handoff's framing needed sharpening before anything could be built. Session 13 left
D-98 and D-99 as "fix these next," but both were logged OPEN precisely because the fix was a design
call, not a patch. So the first move was reading the actual code and the live database, then putting
the choices to Sakshi in plain language. She asked for both to be re-explained without jargon before
deciding — worth noting, because the plain-language versions were what exposed that one of the two
"obvious" fixes was wrong.

**The read path (D-98).** Verified against the live database before recommending anything: the
duplicate Acme AI row carried its own full set of 4 active enrichment rows, so the copy had burned a
complete second analysis. Reading the code changed the recommendation the decision log had recorded —
D-98 originally called "duplicates inherit the canonical verdict" the likely fix, but once the view is
filtered, *nothing reads a duplicate's enrichment*, so the plumbing buys nothing. Sakshi chose filter +
skip-enrichment together. The telling detail: `v_company_rollup` and `notify.ts` already excluded
duplicates correctly. Only the main read model — the one the dashboard sits on — had been missed.

**Completion (D-99).** The "obvious" fix (require all five stages) was confirmed wrong by looking at
real data first: both jobs held exactly 4 of 5 stages, *correctly*, because `geo_recheck` is
conditional by design (D-75). Sakshi chose recording the run outcome instead — which `enrichJob`
already computed and discarded. A deliberate skip lands in `ok_stages`, so it can never look like a
failure.

**Verified by reproduction, not inspection.** Both defects had survived weeks of code review; their
nature was looking fine. So the original outage was recreated on purpose — `GEMINI_MODEL` pointed back
at the retired model — producing `ok: [geo_recheck, salary, recommend]`, `failed: [classify, skills]`:
`recommend` succeeding on a failed run, the exact D-99 shape. The job reappeared in `v_enrich_pending`
naming both failed stages and healed on the next plain `--all` with no manual job id. **That test found
a new bug in the fix**: the retry budget counted total runs, not consecutive failures, so a healthy job
re-analysed a few times would exhaust its allowance and then refuse to retry the first time it actually
broke. Corrected to reset on any clean run.

**The Apify actor (D-100)** came out of Sakshi asking for the LinkedIn scraper link. `task-config.md`
named two actors and said "pick one" — never a decision, and one of the exact gaps `CLAUDE.md` was
written to catch after D-30. Checked live rather than repeated: the one listed *first* is **$29.99/month
rental** with free-plan access limited to trial — it breaks D-5's $0 constraint, with no cost noted
anywhere in the doc. `curious_coder` is $1/1,000 results pay-per-event, so the free $5/month covers
~5,000 results at $0. Sakshi picked it. The consequence was larger than a name swap: it is **URL-driven**
and accepts none of `title`/`location`/`companyName`/`rows`, so the doc's entire §2 described the
*rejected* actor and would have silently configured nothing.

**One thing deliberately left unfinished.** An attempt to verify LinkedIn's filter parameters by loading
a hand-built search URL redirected to an authwall — meaning a wrong parameter reads as "no results
today", not as an error. Rather than write plausible-looking parameters into the repo, the doc now
carries the actor's own instruction (copy the URL from the address bar after filtering) and is marked
unreviewed until Sakshi pastes real captured URLs.

**Three fixes beyond scope, all the same shape — silent success:** `enrichPending` swallowed its own
query error and returned `processed: 0`, indistinguishable from "nothing to do"; the skip guard was
extended to `dropped_reason` jobs, which fail identically through `recommend`'s `.single()`; and
`lib/config.ts:23` defaulted `GEMINI_MODEL` to the model D-97 recorded as **retired**, so an unset env
var would have silently reinstated this session's own test outage.

**Decisions:** D-98 (resolved) · D-99 (resolved) · D-100 (Apify actor). New migration
`0002_canonical_read_path.sql` — the project's first incremental migration, 0001's squash window having
closed when it was applied live.

**Next steps:**

1. **Capture the five LinkedIn search URLs** (D-31 titles, filtered to India + Remote in LinkedIn's UI,
   copied from the address bar). Blocks the first real Apify run; ~2 minutes of Sakshi's time. The
   whole discovery path is stalled on this and nothing else.
2. **Sign off the enrichment retry cap** (3 consecutive failures, marked UNREVIEWED in the migration).
   A provider outage hits every job at once, so too low a cap could silence the entire feed after three
   failed cycles.
3. **Decide the Apify schedule cadence** — the remaining half of D-30, still undecided, and now with
   direct cost implications since this actor bills per result (cadence x cap sets monthly spend against
   the free $5).
4. **Settle RLS** before real postings land — still disabled on all tables, Supabase advisor rates it
   critical. Ties to D-95's open security question.
5. **D-92** (role-summary source) — still blocks the dashboard's tier-4 content.
6. **Then the dashboard** (D-89/D-93). No longer blocked by D-98/D-99.
7. Carried: Telegram tokens, verify the field mapping against real `curious_coder` output (a
   silently-null `externalId` drops a posting outright), rest of `WORKSPACE.md` D-9's monorepo checklist.

Docs updated: `decisions.md` (D-98/D-99 resolved, D-100 added), `learnings.md` (3 entries),
`plans.md` (Session 14 plan + execution record), `backlog.md` (both Session 13 boxes ticked, 2 new
open items), `apify/task-config.md` (rewritten), and one memory file.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.* One thing genuinely new since the last handoff: the pipeline now
recovers from a provider outage on its own, and the duplicate-enrichment waste is gone — so any note
saying D-98/D-99 block the dashboard is stale.

---

## Session 15 — 2026-08-06 (four decisions taken one at a time after a bundled plan was rejected; D-101, D-102)

### What happened this session

**Opened by reading the docs fresh, which changed the handoff's own ordering.** Session 14 left a
seven-item queue with the LinkedIn URL capture first, on the stated basis that it costs ~2 minutes.
Checking `.env` found **`APIFY_TOKEN` empty** — so a real discovery run needs an Apify account, a token,
*and* the five URLs, all Sakshi's manual steps. Three other facts came out of the same pass: no
dashboard code exists (`package.json` has no Next.js, `dashboard-mock.html` is a static file);
`v_jobs_enriched` returns **exactly 1 row**; and the longest stored `jd_clean` is **208 characters**.
That last number matters — D-89 records that the rejected sticky-panel mock looked fine *precisely
because* it was validated against the two-sentence fixture, so building the real dashboard against
today's data would repeat that mistake. The real A1Apps JD sits at `dashboard-mock.html:328` and can
become a proper fixture with no Apify needed.

**A plan was written and rejected — correctly.** It bundled four decisions into one approval, two of
which Sakshi had never been asked (D-94's implementation, the dashboard stack) and one she had asked a
*question* about rather than decided (the retry cap). Her response: *"I did not confirm, ask me one by
one."* Everything after that was taken individually.

**The retry cap turned into the session's real finding.** Asked what production systems do, the answer
distinguished three patterns — small caps with backoff (AWS SDKs, Celery: 3), dead-letter queues
(SQS 3–5, Sidekiq ~25 over 21 days), and retry budgets/circuit breakers (Google SRE). The
recommendation drawn from that ("the number barely matters; visibility is the protection") was then
**disproved by Sakshi's follow-up**: *"how would retry happen if AI is down and 5 is done?"* It
wouldn't. A job at the cap drops out of `v_enrich_pending` permanently, and the counter only resets on a
clean run that can never happen because the job is no longer selected — a closed loop, exitable only by
the manual `--job <id>` that D-99 existed to eliminate. Visibility reports a failure; it does not
recover from one. Resolved as **D-101**: cap 5, `v_enrich_parked`, 24h cooling-off, plus a manual retry
button ("why not both?").

**Two classify gaps closed.** D-92 resolved (`role_summary` rides the existing call) and D-94's open
regex-vs-AI question resolved to AI — because "IIT/IIM" is two literal strings while years-of-experience
has a dozen phrasings, and a missed regex reads as *no requirement*, the permissive direction, which is
the wrong way to fail for a signal that exists to warn her off ineligible roles.

**The five-title list was challenged and narrowed for search (D-102).** Sakshi's stated reason for
wanting the broad "Product Manager" search turned out to be **D-35, already decided 2026-08-02** —
harvesting remote-friendly *company names*, not jobs to apply to, destined for D-44's separate
remote-companies catalog. That catalog's columns are the last `UNREVIEWED DEFAULT` in the schema and its
auto-add path is unbuilt, so the search has nowhere to put its answer today. First run uses four titles.
D-31 is not narrowed — only which searches this run issues.

**Explaining rather than asserting became the mode.** Cadence-vs-date-posted and the `count` cap were
both re-explained in plain language after "not understood still" — the standing-grocery-delivery framing
(how often the van comes vs. what you ask for when it arrives) is what landed.

### Decisions / amendments
- **D-101 (new)** — retry cap 5; parked jobs visible; 24h cooling-off; on-demand retry. **Resolves
  D-99's UNREVIEWED retry budget** (pointer added there). Outage-aware counting rejected on *scale*,
  not complexity — at 1–2 jobs/day the detection is least reliable exactly where it would run.
- **D-102 (new)** — first Apify run searches four titles; the broad PM search waits for the catalog.
  Amends D-31 for search scope only.
- **D-92 (resolved)** — `role_summary` from the existing `classify` call.
- **D-94 (amended)** — years-of-experience AI-extracted on that same call, not regex.

### Next steps (ordered, actionable)
1. **Sakshi — `APIFY_TOKEN`.** Apify Console → the **API** button on the Integrations page → Personal
   API tokens → paste into `.env`. (`.env` was opened in TextEdit this session; check it lands on the
   right line — a mispaste has happened twice before, Sessions 6 and 13.)
2. **Sakshi — four LinkedIn URLs**, copied from the address bar after filtering to India + Remote +
   Past week. Never hand-built: a wrong parameter redirects to an authwall and reads as "no results".
3. **Run the actor once**, `count = 50` (~5 cents). Then `npm run ingest -- --run <runId> --source
   linkedin`. Verifies field mappings (`externalId`, `postingUrl`, `applyUrl`, `jdRaw` — a null
   `externalId` drops a posting silently), gives real cost numbers for D-30's cadence, and counts
   off-title rows to test D-33.
4. **Build D-101** — migration for the cap change, `v_enrich_parked`, cooling-off, retry action.
5. **Build D-92 + D-94** — `role_summary`, `years_experience_min`/`max` (nullable; "not stated" must
   stay distinguishable from zero), prompt + Zod + `PROMPT_VERSION` bump, extend `v_jobs_enriched`
   (append-only — `create or replace view` cannot reorder columns, and `remote_type` must keep
   projecting).
6. **Decide the dashboard's technical shape** — asked and dismissed this session, still open. The RLS
   posture rides on it.
7. **Then the dashboard** (D-89/D-91/D-93), against the A1Apps fixture, not the 208-character one.
8. **Carried:** D-30 cadence (needs step 3's numbers) · `remote_companies` columns · Telegram tokens ·
   the rest of `WORKSPACE.md` D-9's monorepo checklist.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 16 — 2026-08-06 (D-101 and D-92/D-94 built, applied and verified live; D-103 opened)

### What happened this session

**The handoff's first item was already done.** Session 15 left `APIFY_TOKEN` as step 1. Checking `.env`
found it populated (47 chars). Reading state fresh before starting keeps paying for itself — this is the
second consecutive session where the handoff's own ordering changed on contact with reality.

**Both build items shipped, applied to the live project, and verified — not just typechecked.**
Migration `0003_parking_and_classify_fields.sql` carries all three decisions. `v_enrich_pending` moved to
cap 5 with a 24-hour cooling-off disjunct; `v_enrich_parked` is new; `job_enrichments` gained
`role_summary` and `years_experience_min`/`max`; `v_jobs_enriched` went 47 → 50 columns append-only with
`remote_type` still projecting. `enrichParked()` and `npm run enrich -- --parked` are the on-demand
retry, callable now and ready for the dashboard button to call rather than reimplement.

**The cooling-off was exercised rather than reasoned about — and the plan's method for doing it was
wrong.** The plan said to backdate synthetic `enrich_runs` rows past 24h. That fails: backdating puts
them *before* the real clean run of 13:37, so they stop counting as consecutive failures and the job
leaves the parked set for the wrong reason — a green result that proves nothing. Used an isolated
throwaway job instead, touching no real row. Three cases, all correct: 5 failures / 3.4h ago → parked,
**not** pending; 5 failures / 26h ago → parked **and** pending, taking its one daily attempt; then one
clean run → out of both views. That last case is D-101's closed loop provably breaking. Database restored
exactly afterwards — 3 jobs, 3 `enrich_runs`, same three original ids.

**The riskiest line of the whole change was verified by running it.** D-94 turns on "not stated" never
becoming zero, and the validation library's coercion mode is exactly the kind of thing that classically
turns nothing into `0`. Ran it against six inputs rather than trusting recall: `null` passes through
untouched, `"not stated"` falls back to `null`, numeric strings coerce. A related judgment call went the
other way on purpose — an implausible figure (a year like 2024 leaking into the field) is **discarded**
back to "not stated" rather than clamped to 50, because clamping would turn an obvious parsing accident
into a plausible-looking requirement nobody would question.

**`role_summary` works on the real posting.** Output: *"Own the AI platform by writing SQL, integrating
APIs, running experiments, and conducting LLM evaluations."* That is the work, not the company blurb —
which is the specific failure D-92 warned would make option (a) collapse into option (b). **But that JD
is 208 characters.** This proves the plumbing, not the quality. Judging quality needs a full-length
posting, which is what the Apify run is for.

**Three rounds of LinkedIn URL capture, still not runnable.** Attempt 1: "remote" and "past week" typed
into the *keyword* box as words — LinkedIn matches those as text against the JD body, so "remote" would
have matched "no remote work available". Attempts 2 and 3 fixed the keywords and carry the date filter,
but the **Remote filter is absent from all four** and **location is on only one**. The Remote one is the
expensive miss: without it the search returns onsite roles, the actor bills per result, and the ingest
pre-filter throws them away at the door — money spent on rows that never reach her.

### Decisions
- **D-103 (new, OPEN)** — all four captured URLs carry LinkedIn's salary-band filter. It appeared on two
  in the first batch and all four in the second without being re-applied, which points at LinkedIn
  carrying filters across searches rather than a deliberate choice. Flagged rather than silently
  stripped, because it is a scope change to what discovery sees. Recommendation: clear it — LinkedIn
  fills in its **own estimate** when a posting states no pay, and D-12 made this project's salary stage
  parse-only precisely so invented numbers never drive anything. The counter-argument is real (fewer
  results = less spend against the free $5), which is why it is a decision and not a bug.
- No other new decisions. D-101, D-92 and D-94 were already settled in Session 15; this session was
  implementation.

### Next steps (ordered, actionable)
1. **Sakshi — re-capture the four URLs with the Remote filter on.** LinkedIn's "On-site/Remote" dropdown
   in the filter bar (hidden inside "All filters" on a narrow window). Also set **Location = India** on
   the three that lack it. Check the address bar actually changes after applying each filter — if it
   looks identical, the filter didn't take.
2. **Sakshi — answer D-103** (clear the salary filter, or keep it and log the reasoning).
3. **Run the actor once**, `count = 50` (~5 cents), then `npm run ingest -- --run <runId> --source
   linkedin`. Verifies the never-tested field mappings in `lib/discovery/apify.ts:14-47` (a silently-null
   `externalId` drops a posting outright) and produces the real cost numbers D-30's cadence decision
   needs.
4. **Judge `role_summary` against a full-length JD** once real postings land. Today's verdict covers
   plumbing only.
5. **Decide the dashboard's technical shape** — asked in Session 15, dismissed, still open. The RLS
   posture rides on it.
6. **Then the dashboard** (D-89/D-91/D-93), against the A1Apps fixture at `dashboard-mock.html:328`,
   not the 208-character one.
7. **Carried:** D-30 cadence (needs step 3's numbers) · `remote_companies` columns · RLS (real trigger
   is seeding `profile` or deploying a browser-reading dashboard, not "before postings land") ·
   Telegram tokens · the dead `test:golden` npm script · the rest of `WORKSPACE.md` D-9's monorepo
   checklist.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 17 — 2026-08-06 (built a global SessionStart hook — no job-tracker product work this session)

### What happened this session

**Built and shipped a global Claude Code hook that auto-injects the last wrapped session at
startup, replacing manual copy-paste.** This lives entirely outside this repo —
`~/.claude/hooks/session-pointer.sh` + `session_pointer.py`, registered as a new `SessionStart`
entry in `~/.claude/settings.json` — and applies to every project on the machine, not just
job-tracker. It fires on a fresh session start, finds the project's most recent `/wrap-session`
entry via its actual git root (not a guessed parent-directory walk), and injects a short pointer
(Next steps, raw Decisions, closing note, and a `file:line` reference to the full entry) rather
than the whole write-up — a progressive-disclosure design, the same principle behind this memory
system's index-plus-linked-files pattern.

**The design went through several real rounds of pushback before landing:**
- Dropped a decision-condensing regex (rewriting `- **D-89** — text` into `D-89 (label)`) after
  recognizing it was the single most fragile piece of parsing for a saving of a few hundred
  characters, with a fallback that already covered the common case.
- Replaced an italic-specific closing-reminder detector with a format-agnostic "last paragraph"
  match, after actually reading 3 other real projects' summary docs (Habit Tracker,
  linkedin-post-analyzer, AI Evals Game) and finding the italic-wrapping assumption didn't hold
  everywhere — linkedin-post-analyzer uses the same wording with no italics; AI Evals Game
  doesn't use this convention's headings at all.
- Switched folder detection from an arbitrary capped parent-directory walk to
  `git rev-parse --show-toplevel`, after the user flagged the walk could land on an unrelated
  ancestor folder's file.
- Added a self-describing fallback for projects with no matching Next-steps/Decisions headings
  (confirmed real case: AI Evals Game), and a lightweight outcome log at
  `~/.claude/hooks/state/session-pointer.log` so a silent failure is checkable, not invisible.

**Ran an actual test of the core risk — does a short pointer lose context compared to today's
full copy-paste?** Gave one fresh agent only the injected pointer text, another the full pasted
handoff, and asked both five questions answerable only from the session's narrative (not the
Next-steps/Decisions bullets). The pointer-only agent answered all five correctly, explicitly
because it read the referenced file when the short version wasn't enough — validating the
"read on demand" design, with the honest caveat that this depends on the agent actually noticing
and following the nudge, which a task-focused real session might not always do.

**Found and fixed one real bug during live cross-project testing, not in isolation:** a stray
`---` markdown divider was gluing onto the start of the closing note whenever there was no blank
line separating it from the reminder paragraph above (Habit Tracker's actual file). Fixed by
excluding markdown thematic-break lines from the "last paragraph" match.

**job-tracker's own `session-summary.md` was the primary test fixture throughout, and — used
live — confirmed at least one other session was actively wrapping into this same file during
this session:** it moved from Session 13 to Session 16 while this work was in progress, which the
hook picked up correctly on each re-run without needing any adjustment.

### Decisions / amendments

None for job-tracker specifically — no product, vendor, cost, or scope decision covered by this
repo's `decisions.md` was made this session. The design choices above are Claude Code tooling
decisions for a global hook; the full plan is copied into `plans.md` below (original path
`~/.claude/plans/create-a-global-hook-refactored-anchor.md`).

### Next steps (ordered, actionable)

1. This session didn't touch job-tracker's product backlog — Session 16's open items (D-103's
   LinkedIn salary-band filter, the still-blocked first Apify run, the dashboard's technical
   shape) are unchanged; see Session 16 for those, not this entry.
2. If a future session's injected startup pointer ever looks wrong, missing, or stale, check
   `~/.claude/hooks/state/session-pointer.log` first — it logs an outcome tag for every session
   start (`injected` / `injected_degraded` / `no_file` / `no_header_match` / `error`).
3. Not yet cross-checked: resume-builder and the ApplicationOS workspace-root summary doc (only
   Habit Tracker, linkedin-post-analyzer, and AI Evals Game were validated this session).

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 18 — 2026-08-07 (first real end-to-end run: discovery → ingest → enrich, against live LinkedIn data)

### What happened this session

**The four LinkedIn URLs were captured by driving Sakshi's Chrome, after she chose that over a fifth
manual round.** All four now carry Location=India (`geoId=102713980`), Remote (`f_WT=2`) and past-week
(`f_TPR=r604800`), and none carries the salary band. The Remote filter — absent from all four URLs in
every prior attempt — only writes itself into the URL after **Show results** is clicked *inside* the
dropdown; ticking the box does nothing visible. The method that worked was reading the address bar
after every individual filter and refusing to proceed if it hadn't grown. Recorded in
`apify/task-config.md` with what each parameter means.

**D-103 resolved — salary filter cleared, Sakshi's call.** Worth noting the cost argument for keeping
it turned out to be aimed at the wrong target: the actual spend concentration is the *Product
Associate* search returning 500+ results against ~55 for the other three, dragged in by LinkedIn's
keyword leak (its top hits were Consultant, Market Research Analyst, Project Coordinator).

**The run: 50 postings, $0.05, 55.6 seconds.** Also settled that `count` is a total across all URLs,
not per-URL. The result split is lopsided — Product Associate 28, Product Manager I 16, Junior PM 4,
**Associate PM 2**. The cap is eaten by the broadest search, starving the most on-target title.

**Ingest: `received: 50` exactly matched the dataset**, so `mapApifyItem` dropped nothing silently —
the specific failure mode that was worth checking, since a null `externalId` discards a posting with
no counter anywhere. 44 inserted, 6 dropped by the remote pre-filter, 0 duplicates.

**Two mapping bugs found, both invisible to typecheck, review and fixtures.** `recruiterName` was
looking for `recruiterName`/`posterName`/`hiringPerson`; the actor emits **`jobPosterName`** — that
field had been `undefined` for every posting ever ingested. Fixed, and 4 recruiters populated on
re-ingest where there had been 0. Separately, `applyUrl` comes back `''` on **all 50** items, which
invalidates the code comment claiming a null `apply_url` means "Easy Apply"; it means "we didn't ask".
Both documented in `lib/discovery/apify.ts`.

**`role_summary` passes the D-92 test on full-length JDs — the thing Session 16 could not prove.**
The decisive case is Copeland (6,394-char JD opening with two paragraphs of company marketing:
*"we are a global climate technologies company engineered for sustainability…"*). Summary:
*"Manage the product lifecycle, roadmaps, and P&L for climate and HVACR technology solutions."*
The work, not the blurb. Four others in the same shape (PepsiCo, TravClan, Lumos, Esther Adorned).

**D-94 verified on real messy input.** Copeland's JD contains both *"5-year product roadmaps"* and
*"Minimum **five** years of experience"* — the extraction took the spelled-out requirement and ignored
the roadmap horizon. TravClan/Lumos "3+ years" → `3, null`; PepsiCo "2-3 years" → `2, 3`; postings
that state nothing → `null`, never `0`, across all of them.

### Decisions

- **D-103 — RESOLVED.** Salary-band filter cleared. Its absence is *not* self-sustaining: a fresh
  session simply didn't inherit it, so future re-captures must check for `f_SAL` explicitly.
- **D-104 (new, OPEN) — the ingest pre-filter's false-positive rate is 50% on its first real sample.**
  Of 6 postings dropped as non-remote, 3 are wrong: Merck ("skills in **Office** 365"), Franklin
  Templeton ("**Onsite** fitness center"), American Express (a benefits sentence that lists remote as
  an option). Three different causes, so no one-line fix — and a word boundary does not rescue the
  Merck case. Not tuned this session on purpose: it changes what reaches the now-scarce AI stages.
  **This is D-72 paying out** — the rate is measurable only because dropped rows are persisted with a
  reason instead of discarded.
- **D-105 (new, OPEN) — the real ceiling is the AI free-tier daily quota, not Apify cost.** The
  single most consequential finding. `dispatch` processed all 44 jobs; `classify` failed on 39 and
  `skills` on 40, all `gemini 429: exceeded your current quota` — **19 successful calls in a day,
  then a wall**. At ~2 calls/job that is ~10 jobs enriched/day, while one 5-cent run delivers 44.
  Cadence has always been framed as "how often can we afford to scrape"; that question had a
  comfortable answer and was never the constraint. Reframes D-30.
- **D-106 (new, RESOLVED defect) — notify wrote a permanent "sent" guard for messages it never sent.**
  `sendTelegram` returns `false` rather than throwing when unconfigured; `notifyNew` ignored the
  return, counted `sent: 2`, and wrote `NotificationSent` — D-16's *permanent* idempotency guard. Two
  jobs burned (Esther Adorned, real; Acme AI, fixture): once Telegram is configured they would never
  arrive and nothing would say why. **This is D-99's mistake living in a second code path.** Fixed.

### What went right and is worth not forgetting

**D-99's fix held under real load, and this was a much better test than the one it was built against.**
All 39 quota-failed jobs recorded `failed_stages: {classify,skills}`, stayed out of "complete", and
went straight back to `v_enrich_pending` (40 pending, 0 parked). Pre-D-99 they would have been marked
complete holding no classification, and `--all` would have reported `processed: 0` forever.

### Next steps (ordered, actionable)

1. **Answer D-105** — the blocking one. Everything downstream (cadence, dashboard volume, whether a
   scheduled run makes sense at all) sits on it. Recommendation: configure a fallback provider
   (`CEREBRAS_API_KEY` / `GROK_API_KEY` are scaffolded in `.env` and both empty, and
   `AI_PROVIDER_CLASSIFY`/`AI_PROVIDER_SKILLS` exist to route per-stage), then consider merging
   `skills` into the `classify` call to halve consumption. Both keep D-5's $0.
2. **Answer D-104** — how aggressive the remote pre-filter should be. Recommendation: require the
   marker to sit near a work-arrangement word, or hand the judgement to `geo_recheck` and reduce the
   regex to unambiguous cases only.
3. **Clear the two stale `NotificationSent` events** — needs Sakshi's go-ahead, it deletes real rows:
   `delete from job_events where type='NotificationSent' and created_at < '2026-08-07';`
   Without it, Esther Adorned stays permanently suppressed.
4. **Re-run `npm run enrich` once quota resets** to drain the 40 pending, and confirm the backlog
   clears rather than re-failing.
5. **Decide the result-split problem** — Associate PM got 2 of 50. Separate runs per URL, or drop the
   broad *Product Associate* search (that would amend D-102).
6. **Then the dashboard** — its technical shape is still undecided and RLS rides on it. Note it would
   currently display 45 jobs of which ~39 have no classification at all, so D-105 lands first.
7. **Carried:** D-30 cadence (now has its numbers, and a different framing) · `remote_companies`
   columns · RLS · Telegram tokens · the dead `test:golden` script.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 19 — 2026-08-07 (the quota diagnosis was wrong; the filter handed its judgement to the AI)

### What happened this session

**Started as an explanation, became a re-diagnosis.** The session opened with Sakshi asking for
Session 18's write-up in plain language. Working through it surfaced that its headline finding was
wrong. D-105 recorded "19 successful calls, then hard 429s" as the free tier's *daily* ceiling, and
recommended a second account or a fallback provider. Sakshi asked whether spacing the calls would
help — a question that only matters if the limit is per-minute — and then produced her Google AI
Studio dashboard, which settled it: ~400 requests in one burst, success collapsing to ~0%, then
**recovering to 100% later the same day**. A daily cap does not recover until midnight. See **D-107**.

**The ~400 was the tell.** 44 jobs x 2 calls = 88 requests needed. `callGemini` wrapped every call in
`pRetry { retries: 3, minTimeout: 800 }` and treated a 429 exactly like a transient 5xx, so each
rate-limit rejection was re-fired within a second — 88 x 4 attempts ≈ 352. The retry logic was
amplifying the limit it hit. Fixed with a process-wide call gate (`lib/ai/throttle.ts`, one choke
point in `AIService.callProvider` so a future stage can't reintroduce the burst) and a real 429
backoff honouring `Retry-After`, kept separate from the 5xx path.

**D-104 resolved, and the first implementation was thrown away.** Sakshi chose option (d) — hand the
remote/on-site judgement to the AI. The first build kept a JD scan but required the marker to sit near
a work-arrangement noun; it passed all three known false positives, then failed on the real American
Express row (*"flexible working model with hybrid, onsite or virtual arrangements"* — "working" sits
four words from "onsite"). Her correction — *"we decided no regex but use AI"* — was right: the
proximity version was option (3) creep wearing option (4)'s label. `INGEST_REMOTE_FILTER` now
defaults to **off**; `classify.remote_type` is the verdict. Every original false positive came from
prose, so prose is out of scope for the filter entirely rather than parsed more cleverly.
Also found: **`"virtual"` was missing from the remote-signal vocabulary** — ordinary JD language for
remote, and its absence is what left Amex's on-site mention unopposed.

**`remote_companies` went from an unreviewed placeholder to a populated catalog.** D-44 left its
columns undecided in Session 8 and they had carried an `UNREVIEWED DEFAULT` marker ever since.
Reviewed column by column with Sakshi: `last_confirmed_at` added (a timestamp, not a boolean, so it
cannot go stale silently), evidence stays single-valued, population automatic from ingest.
Backfilled rather than left for the next scrape — **50 companies** from postings already held.

**A logged-out browser nearly drove a decision on numbers that were 15–20x wrong.** Checking whether
senior titles were worth a broader search returned 1,000+/1,000+/740/870 while signed out. Signed in,
the same URLs return **72/53/57/64** — LinkedIn's public search silently ignores `f_WT=2` and returns
every matching title regardless of work arrangement. Sakshi offering her signed-in session caught it.
The real numbers are modest and comparable to the existing searches, which is a yes on different
grounds than the inflated ones suggested.

**Discovery search config is not in code.** Worth recording, because two sessions have now assumed
otherwise: there is no code that triggers Apify runs. `apify/task-config.md` documents a manual Task
setup, so D-108's split into separate runs is a doc change plus something Sakshi applies in Apify's UI.

### Decisions

- **D-107 (new)** — amends D-105. The 429s were a burst-rate (RPM/TPM) throttle, not a daily quota;
  fix is spacing + a real 429 backoff. Second account and fallback provider both deliberately *not*
  spent — kept available if throttling proves insufficient. ToS position on multiple free-tier
  accounts checked against Gemini/Groq/Cerebras terms: genuinely ambiguous, no clear permission or
  prohibition; Sakshi accepted the gray area as reasonable for an MVP, but it turned out unnecessary.
- **D-108 (new)** — amends D-102. Product Associate dropped (few companies use it as a real title);
  every search URL gets its own run with its own `count`, since `count` is a shared total.
- **D-109 (new)** — resolves D-44's open columns, revisits D-35. `last_confirmed_at`, auto-population
  from ingest, backfill, and **one** broad catalog-only "Product Manager" search (not four
  senior-title searches — LinkedIn matches the phrase inside longer titles).
- **D-110 (new)** — dashboard is Next.js on Vercel querying Supabase directly with tightly-scoped
  RLS. The company-standard server layer was the honest recommendation and was *not* chosen; the
  reasoning, including Sakshi's fair challenge that build effort doesn't transfer to her, is recorded
  in the entry. Unblocks the RLS item.
- **D-104 — RESOLVED.** Pre-filter off by default, AI owns the verdict, all 7 historical drops
  cleared with `JobUndropped` audit events.

### What shipped

`lib/ai/throttle.ts`, `lib/discovery/remoteCompanies.ts`,
`scripts/run-backfill-remote-companies.ts`, `supabase/migrations/0004_remote_companies_catalog.sql`
(applied) — all new. Modified: `lib/ai/{provider,gemini,AIService}.ts`, `lib/config.ts`,
`lib/discovery/normalize.ts`, `lib/events.ts` (`JobUndropped`), `services/discovery/ingest.ts`,
`tests/enrich.test.ts`, `apify/task-config.md`, `.env`/`.env.example`, `0001_schema.sql`.

Typecheck clean. `tests/enrich.test.ts` passing, extended with 6 D-104 regression cases naming the
three real postings. Backfill run for real: 7/7 drops cleared, 50 companies catalogued, pending
enrichment 40 → 47.

### Next steps (ordered, actionable)

1. **Verify D-107 against a real run** — the one thing built and *not* proven. Quota had not reset.
   Run `npm run enrich -- --all` (47 pending) and check the AI Studio dashboard afterwards: request
   volume should track ~2x the job count, not ~4x, and success should hold instead of cratering
   mid-run. If it still walls, the diagnosis is wrong and D-105's other options are next.
2. **Start the 3-run watch D-104 is conditional on** — `geo_recheck` call volume per run before vs.
   after, per Sakshi's explicit condition. With the pre-filter off, all 53 postings now reach
   `classify` rather than 46, so this run is the first data point.
3. **Clear the two stale `NotificationSent` events** — still needs a go-ahead, still deletes real
   rows: `delete from job_events where type='NotificationSent' and created_at < '2026-08-07';`
   Without it Esther Adorned stays permanently suppressed.
4. **Apply D-108 in Apify's UI** — split into separate runs per URL, drop Product Associate, add the
   broad catalog search. The doc is updated; the Task config itself is manual.
5. **Configure Telegram tokens** — never done, so every enriched job currently reaches nobody. This
   is a setup task, not a decision.
6. **Then the dashboard** — shape is decided (D-110) and RLS is unblocked. Note it would now show
   53 jobs, most still unclassified until step 1 succeeds.
7. **Carried:** D-30 cadence (reframed by D-107 — size to per-minute pacing, not daily quota) ·
   RLS policies · the dead `test:golden` script · resume-builder and job-tracker share one Gemini key
   (downgraded to low-risk: resume-builder is used on demand, not on a schedule).

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 20 — 2026-08-07 (D-107 was wrong: it's a 20/day quota — and `recommend` was inventing verdicts)

### What happened this session

**D-107 was tested and it failed.** Session 19's first next-step was "verify D-107 against a real
run." The run produced zero successful enrichments in ten minutes — 429 on the *first* attempt of
every call, backoff climbing 1→4 and never getting through. A burst throttle clears after a 65s wait;
this didn't. A single direct probe settled it: `quotaId:
GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`. A **daily** cap of 20 requests.
**D-105's original reading was correct all along.** See **D-111**.

**The trap was in the same response we'd been reading.** Google's 429 body carries
`"Please retry in 46.855s"` alongside the quota name. Timing alone is ambiguous between per-minute
and per-day; only `quotaId` distinguishes them. And `provider.ts` logged `rate limited (attempt N)`
while discarding `error.message` — so the decisive evidence was present in every 429 for two sessions
and thrown away on the way to the log. No escape within the free tier either: `gemini-2.0-flash`
returns `limit: 0`, `gemini-2.5-flash`/`-lite` return 404 (retired).

**Sakshi's pushback found the real bug.** Told the quota story, she said: *"but yesterday we had
populated all 47."* That was true and the quota theory couldn't explain it — 47 jobs is ~94 requests
against a 20/day cap. Checking the data: `ai_usage` showed 19 calls on each of two days, not 94. The
resolution is that `salary` and `recommend` are **deterministic stages that always succeed**, so 48
jobs looked populated while `classify` and `skills` had only ever covered **15**. Following that
through: `recommend` reads `v_jobs_enriched`, sees `background_match=[]` and `is_ai=null` — identical
to a genuine "no matching signals" result — and emits `priority='low'`. **33 of 48 jobs were silently
ranked `low` because the AI never ran on them**, all with `needs_review=false`. Of the 15 actually
classified, 5 came out `med`, so the false-lows were burying real candidates. `enrich_runs` had
recorded `failed_stages={classify,skills}` on **42 runs** and run `recommend` anyway. See **D-112**.

**Third instance of the same shape.** D-73 (`remote_type`), then `salary_status`, now scoring — a
value meaning "absent" quietly doubling as a value meaning "we know it's nothing." Checked against
industry practice: credit bureaus never score a thin file as *low*; they emit a distinct
**unscorable** outcome. Sakshi rejected the first fix (skip the row) on the grounds that it renders
as a *blank*, which is ambiguous all over again — and chose both a row-level `classify_status` label
**and** an explicit `unknown` priority. Placement was decided by a schema fact: `CHECK (priority IN
('high','med','low'))` means `unknown` lives in the read model and is never stored.

**Two things turned out already correct, and one of them is the reason this hid for so long.**
`v_enrich_pending` reports 38 pending / 0 parked, so every unclassified job was already queued and
self-heals — D-99 had removed the "does a recommend row exist?" check for exactly this reason, so no
data repair is needed. And `notify.ts` filters `low` out (D-65), so no bad notifications went out —
but that filter is *why* nothing surfaced. The system was quiet because it was broken, and quiet is
also what healthy looks like.

**Two "new" questions turned out to be already-logged decisions.** The rename question was answered
by **D-7** (`WORKSPACE.md:16`: *"to be renamed `job-scout/` (D-7)"*), never executed. The dashboard
architecture was answered by **D-110** (Next.js/Vercel + Supabase-direct + tight RLS). And Sakshi's
concern about a future job-tracker module citing job-scout decisions is already solved by an in-use
convention: qualify by module (*"job-scout `decisions.md` D-37"*, *"WORKSPACE D-11"*). Logged as
**D-114**.

**Caught at wrap time by re-reading D-110 rather than trusting the plan built from it:** granting
`anon` SELECT on `v_jobs_enriched` would publish `recruiter_email`, `recruiter_linkedin` and
`hiring_manager` — violating D-110's own condition that referral contacts stay unreachable by the
anon key. A narrower `v_jobs_public` is required. Logged **OPEN** as **D-115**.

**Also established:** there is no UI at all today — `dashboard-mock.html` is fully static (zero data
calls) and is a *design mock containing fields the pipeline doesn't produce*; no `job-scout` directory
exists; Telegram has sent 2 notifications ever. Field coverage on 52 visible jobs means **~73% of any
dashboard built today renders "not yet evaluated"** (skills/background_match 14, role_summary/domain
13, years_experience 8). And RLS is disabled on all 15 tables — the anon key can currently read *and
write* every row.

### Decisions and amendments

- **D-111 (new)** — amends D-107. Per-day quota of 20, not a burst throttle; D-105 was right. Stay on
  the free tier and drain the backlog over ~5 days rather than pay or switch, because
  `processed_runs` has 1 row and steady-state arrival rate is unknown — the draining days produce
  that measurement.
- **D-112 (new)** — `recommend` gains a precondition; `classify_status` + read-model-only `unknown`.
- **D-113 (new)** — corrects D-107's fallback premise: Cerebras needs a verified payment method for
  expiring $5 credits and its configured model isn't free-tier eligible (the D-97 trap again);
  `grok.ts` points at xAI (paid), not Groq; both keys empty. No working fallback exists today.
- **D-114 (new)** — executes D-7's rename. Memory directory and git worktree store absolute paths;
  copy-verify-delete, never `mv`. History in the logs deliberately not rewritten.
- **D-115 (new, OPEN)** — D-110's RLS condition is violated by `v_jobs_enriched`'s recruiter columns.
- **D-107, D-110** — pointer notes added in place.

### Next steps

1. **Nothing from the approved plan was implemented** — the session ended at doc-wrapping. The plan is
   in `plans.md` (Session 20) and `~/.claude/plans/rippling-foraging-volcano.md`.
2. **Revise the plan for D-115 first** — add `v_jobs_public` (no recruiter/hiring-manager columns) and
   reconcile the dashboard shape with D-110's Next.js/Vercel decision before building anything.
3. **Apply the correctness fixes** — `recommend` precondition, `0005` read-model migration, supersede
   the 33 false `low` rows, `provider.ts` log line. These are independent of the quota and of the
   dashboard.
4. **Then RLS (`0006`)** — grant anon SELECT on `v_jobs_public` only.
5. **~~Execute the D-7/D-114 rename~~ — DONE at end of Session 20.** Folder is `ApplicationOS/
   job-scout`, `package.json` is `remote-pm-job-scout`, memory copied to the `-job-scout` key, repo
   and both worktrees healthy. Two residuals: **(a)** verify memory actually loads in a fresh session
   (ask it what it remembers about how Sakshi likes decisions handled) and only then
   `rm -rf ~/.claude/projects/-Users-...-job-tracker`; **(b)** update the docs describing the system
   as it is now — `WORKSPACE.md` (its line 16 both predicts this rename and wrongly says "no commits
   yet"), `architecture.html`, `README.md`, `../dashboard/`, `resume-builder/docs/*`.
   *Gotcha worth remembering:* bare `git worktree repair` fixed only the main worktree; the nested one
   stayed on the old path marked `prunable` until repaired with an explicit path argument.
6. **Drain the backlog** — `npm run enrich -- --pending` daily (~8 jobs/day, ~5 days), recording
   new-jobs-per-day. That measurement is what the provider decision is waiting on.
7. **Carried:** the two stale `NotificationSent` rows · D-104's 3-run `geo_recheck` volume watch ·
   D-30 cadence · the dead `test:golden` script · `WORKSPACE.md:16` says "no commits yet" but commit
   `828da9d` exists.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 21 — 2026-08-07 (D-112 shipped; the quota lever is requests, not keys; Batch API ruled out by probe)

### Shipped and verified — D-112's correctness fixes
`recommend` no longer invents verdicts. `runRecommend` now reads the active `classify` row first and,
finding none, emits `StageSkipped` and writes nothing (`lib/enrich/recommend.ts`). A *query error*
throws rather than being read as "no row", so the absent-becomes-negative collapse cannot return
through the error path. `computeRecommendation` is untouched and pure, so `tests/enrich.test.ts`
passes unchanged. `StageSkipped` added to `lib/events.ts`, commented against `EnrichmentSkipped`
(whole job, D-98) and `StageFailed` (the stage broke). `pipeline.ts` deliberately unchanged — a skip
lands in `ok_stages`, the D-75 reading.

Migration `0005_not_evaluated_read_model.sql` applied: superseded the 33 fabricated `low` rows
(`is_active = false`, never deleted; 0 `job_feedback` rows referenced them), and recreated
`v_jobs_enriched` with `coalesce(rec.priority,'unknown')` and an appended `classify_status`. Select
list stayed append-only; `priority` kept name, position and text type so `create or replace` accepted
it. `lib/types.ts` split `Priority` (computed and stored) from `PriorityView` (read model).
`lib/ai/provider.ts` now logs `error.message` — the line whose silence caused D-107's misdiagnosis.

**Post-migration, verified live:** 0 recommend rows without a classify row (was 33) · 38 `unknown` =
38 `not_evaluated`, 0 disagreeing · 5 notifiable · 9 genuine `low` · `remote_type` still projecting on
14 · `v_enrich_pending` unchanged at 38 · 52 rows total. Live skip path confirmed on a real job with
the key unset: `ok: [geo_recheck, salary, recommend]`, `failed: [classify, skills]`, event
`StageSkipped / recommend / {"reason":"no_classify"}`, no row written, view reads
`unknown / not_evaluated`. **Not verified:** the `provider.ts` log line needs a real 429; the forced
run failed on a missing key instead.

### The quota question got a real answer — and it was not more keys
Google's docs settle two things. Limits are per *project*, not per key, so extra keys inside one
project buy nothing. And the cap counts *requests*, not tokens — which makes fewer calls per job the
actual lever, not shorter prompts. Merging `classify` + `skills` therefore doubles throughput for
free (D-117a, agreed).

The proper solution was checked first and is closed: the async **Batch API** would have given the
throughput with zero accuracy risk, but a one-request probe returned `400 FAILED_PRECONDITION`, which
Google's error reference defines as a missing prerequisite such as disabled billing. **Batch requires
a paid account** (D-120). The free-tier row missing from the batch limits table was the answer.

Two things surfaced alongside: extra Google projects are an unresolved ToS call that belongs to
Sakshi, not to Claude; and the free tier is explicitly **not private** — Google's terms say human
reviewers may read API input and output, and "do not submit sensitive, confidential, or personal
information." The pipeline sends full JDs, which carry recruiter names. Same problem as D-115, on a
front nobody had looked at (D-118, OPEN).

### Design: unjudged jobs get a `Pending` chip
An unjudged job keeps its normal card and newest-first position, with `Pending` where the verdict
goes — not hidden, not a separate section, not blank (D-116). This matters more than it sounds: at
~8 judged jobs/day there is permanently an unjudged tail at the *top* of the list, so 73% of the
board is the state the mock never drew. And a blank card reproduces D-112's bug on the screen.
Decided to build against real data rather than refine the mock further (D-119), since the mock's
remaining fields describe outputs the pipeline does not produce.

### Corrections worth keeping
Claude re-proposed D-110's explicitly-rejected server-layer option as a fresh recommendation without
flagging it as a reversal; Sakshi caught it. D-110 stands — browser reads Supabase directly, with
`v_jobs_public` as a prerequisite from D-115. Claude also declined one request: engineering request
timing specifically to evade Google's abuse detection.

### Decisions
D-116 (Pending chip) · D-117 (merge `classify`+`skills`; multi-item batching gets an eval with the
rule pre-registered) · D-118 (OPEN — quota workarounds + free-tier privacy) · D-119 (build before
refining the mock) · D-120 (Batch API closed by probe). Pointer added under D-110. D-114 already
recorded as executed.

### Next steps
1. **Merge `classify` + `skills` into one call** (D-117a) — `AIService.classify` and
   `AIService.extractSkills` (`lib/ai/AIService.ts:109,153`) become one call with one combined
   prompt; `runClassify` and `runSkills` still write their own rows so the stage model and
   `v_jobs_enriched` are unchanged. Regression-test against the 14 already-classified jobs.
2. **Then the multi-item eval** (D-117b) if more throughput is still needed — 5 per call, 3 requests,
   per-field disagreement counts, kill on any eligibility-field disagreement.
3. **Migration `0006`** — `v_jobs_public` as an explicit column allowlist (never `j.*` minus), plus
   RLS on all 15 tables, anon SELECT on the public view only. Closes D-115.
4. **Build `web/`** — Next.js on Vercel per D-110, browser reading `v_jobs_public`, mock CSS ported,
   `contact-box` deleted rather than left empty.
5. **Answer D-118** — the extra-projects ToS call, and whether full JDs should keep going to a tier
   whose terms say not to send personal information.
6. **The golden set** — nobody has labelled a correct verdict for any job, so the only eval available
   is a regression check against outputs of unknown quality. Ten hand-labelled JDs would be ~20
   minutes and the most valuable missing artifact in the project.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 22 — 2026-08-07 (guardrail audit + input/output guard plan, ran mostly parallel to Sessions 18–21's real pipeline run — plan NOT approved)

**What happened, by theme:**

- **Job application drafting.** Helped Sakshi draft and iteratively sharpen an answer to a job
  application question ("describe a complex product you owned end-to-end") for an AI PM role, using
  job-scout as the example. Reworked several times to hit specific evaluation criteria (why AI, cost,
  tradeoffs, failure modes, guardrails, evals) — each pass grounded in real project decisions rather
  than invented claims, with one important correction: an early draft used the word "guardrails,"
  which never actually appears anywhere in this project's docs or code — relabelled to the project's
  own language before it went further. Not a project artifact; lives only in this conversation.

- **Guardrail/input-guard audit and plan.** A three-agent audit of the real codebase (independent of
  a generic guardrail checklist Sakshi had been handed, which described a product job-scout
  deliberately isn't) produced a genuine plan: 7 concrete changes (reject unusable JDs, explicitly
  reject a length cap with reasoning, verify extracted recruiter contacts against source text, fence
  the JD as untrusted data, build the D-71 golden eval, add outbound-call timeouts, validate Apify's
  response shape), plus a full appendix of real bugs and gaps found by reading the code directly. **The
  plan was never approved** — `ExitPlanMode` was presented twice and rejected both times, so nothing
  in it has been built. Copied in full into `plans.md`, with a reconciliation note at the top (see
  below) since real project work happened in parallel and overlaps with parts of it.

- **Extensive research/education pass**, all sourced and mostly verified against primary documents
  rather than trusted from search summaries (one citation was found wrong mid-conversation — a
  YouTube link attributed to the wrong content — and corrected in place rather than left standing).
  Covered: input guards vs. output guards as concepts, what OpenAI/Anthropic-scale companies do vs.
  what a typical AI-feature company does vs. what's actually proportionate for a single-user MVP;
  structured output validation, grounding/hallucination checks, cost levers (model routing, caching,
  batching) and their actual (in)applicability to a $0 solo project; observability/tracing tooling and
  why it's correctly deferred; AI-PM portfolio differentiators. Educational — no project decisions
  came directly out of this pass, though the reasoning may feed the job-application answer.

- **Read forward into real project state and reported it back to Sakshi.** Discovered mid-session that
  `decisions.md` had grown from D-88 (this session's starting context) to **D-120** — a parallel
  session (Sessions 18–21) had run the pipeline end-to-end for the first time, hit Gemini's real
  free-tier daily quota (20 requests/day), diagnosed it wrong once then correctly, and made a real
  sequence of cost decisions against measured numbers. Summarized that sequence back to Sakshi
  (D-100, D-101, D-105, D-107→D-111, D-113, D-117, D-118, D-120) as her strongest, most evidence-based
  material — notably stronger than the hypothetical guardrail-plan reasoning from earlier in this same
  session, since these decisions were tested against reality rather than argued from principle.

**Decisions/amendments made this session:** none. Everything above is either an unapproved plan (see
`plans.md`) or educational discussion. All real decisions referenced (D-89 through D-120) were made by
a different, parallel session — not this one. Do not attribute them here.

**Reconciliation flag for whoever picks up the guardrail plan next:** it was designed partly blind to
the parallel session's real progress. Confirmed overlaps: Appendix A's #1 gap (a `classify` failure
silently producing a real-looking `priority:'low'` row) **is D-112, already found independently and
already fixed**, so don't re-implement it. Change 6 (timeouts) needs composing with D-107's
`lib/ai/throttle.ts`, not built blind to it. The "spending/call ceiling" open question is largely
superseded by D-111/D-117/D-118/D-120's real measurements. The "skills vs. tools split" open question
is now actually checkable — its blocking condition (real postings existing) is satisfied. Full detail
in `plans.md`'s reconciliation note.

**Next steps:**
1. Re-read `plans.md`'s guardrail-plan entry and its reconciliation note before doing anything with it
   — two more real sessions of code changes sit between when it was written and now.
2. Decide whether to approve/revise/discard the plan given what's since changed, rather than assuming
   it's still accurate as written.
3. Change 5 (the golden eval) is confirmed still genuinely needed by D-117 itself — likely the
   highest-value item to actually build, and now has real postings already in the database to draw
   from rather than needing fresh collection.
4. Re-verify Appendix A's remaining bug list and gaps 2–7 against current code — some may already be
   fixed by Sessions 18–21's work, not confirmed either way here.

Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.

---

## Session 23 — 2026-08-08 (job-application answer, rebuilt and reframed to ApplicationOS level — no product work)

**No product work, no code, no decisions.** This session drafted an answer to a job-application
question ("Describe a complex product you owned end-to-end where you both set the strategy and stayed
hands-on in the details"). It is recorded here — including the final text — specifically because
**Session 22 drafted the same answer and it was lost**, having lived only in that conversation.

**What happened, by theme:**

- **Rebuilt the answer from the decision log rather than from memory.** Session 22's draft was gone,
  so every claim was re-sourced: D-50/D-53/D-12 (AI only where judgement is needed), D-105/D-107/D-111
  (the 20-requests/day ceiling and the wrong-then-corrected diagnosis), D-112 (33 of 48 jobs silently
  ranked low), D-117/D-120 (the pre-registered batching eval; Batch API closed by probe), D-121 (the
  silently-dropped LinkedIn filter). No invented claims.

- **Four rounds of correction from Sakshi, each one substantive:**
  1. *"how are these product bets?"* — and they weren't. The first draft's three "bets" were an
     architecture principle, a cost constraint and a **defect fix**. None were bets about what to build
     or for whom; all three could only be wrong about implementation. Rewritten from `user-research.md`
     (the hour-a-day manual process, fragmented notification channels, the UAT fabrication incident) —
     which had not been consulted for the first draft at all, and is where the actual user problem is
     stated.
  2. *"this is an onsite job…don't mention remote."* Removed the word throughout. The D-121 story
     survives without naming which filter was dropped.
  3. *"very vague and too long."* Correct on both counts, and the vagueness was **caused by** the
     de-remoting — abstracting the filter left phrases like "a tight set of eligibility criteria."
     Fixed by naming the filters that aren't remote (India, entry-level, non-technical) and restoring
     the numbers. 560 → 290 words.
  4. *"I want you to talk about app os as a whole."* Reframed from job-scout alone to the whole
     workspace, read from `../WORKSPACE.md`. An intermediate draft used D-7's five→three module cut
     and D-9's polyrepo→monorepo reversal as the bets — superseded by round 5.
  5. *"Don't talk about architecture. Also talk about calls I made about AI."* Both module-boundary
     bets cut. The AI-placement calls replaced them, and are stronger evidence for an AI PM role
     anyway: D-53/D-12/D-50/D-57 (AI extracts facts, never issues the verdict), D-104 (the reverse —
     retiring her own 50%-false-positive regex in the model's favour, then catching a cleverer regex
     smuggled back in wearing the AI label), D-67/D-68 (closed vocabulary; model-invented tags cannot
     reach ranking), D-117 (pre-registered kill criterion before adopting batching), D-120 (Batch API
     settled by one throwaway request, not by reading docs).

- **Observation worth acting on: the summary doc is behind the decision log.** `decisions.md` carries
  D-121 → D-125 (2026-08-07 night: the actor swap, Groq added, the four-keys correction) and
  `session-summary.md` has no session entry covering them — the last entry before this one is Session
  22. Whatever session logged those never wrapped. Not fixed here; flagged so it isn't mistaken for
  work that didn't happen.

**Decisions/amendments made this session:** none. Nothing in the codebase, schema or scope changed.
D-121 through D-125 were logged by a different session — do not attribute them here.

**The final answer, preserved so it survives this conversation** (~400 words; plan-file copy at
`~/.claude/plans/help-me-answer-this-serialized-wilkinson.md`, which may be cleared):

> **The product.** ApplicationOS — a personal system covering the whole job hunt: a résumé builder
> that tailors against a job description (live on Vercel), job-scout (pulls entry-level PM postings in
> India off LinkedIn, has an LLM read each JD, ranks them against my background, and Telegrams me only
> the ones worth acting on), and a tracker for referrals and follow-ups. Most of what I actually
> decided was where AI belonged and where it didn't.
>
> **Bet 1 — the AI extracts facts; it never issues the verdict.** Reading a messy job description is
> what a model is genuinely good at, so that's its job. But the final priority is a deterministic rule
> I wrote, salary is parsed and never estimated, the IIT/IIM check came back out of the prompt into
> plain code, and I rejected an LLM-as-judge pass — a model of the same class grading its own output
> isn't evidence. The verdict has to be something I can read, argue with, and unit-test.
>
> **Bet 2 — and when my own rule was measurably worse than the model, I retired it.** My hand-written
> eligibility filter ran at a 50% false-positive rate on its first real sample, so I switched it off
> and gave the judgement to the AI. Then I caught myself writing a cleverer version of the same regex
> and calling it the AI approach — it passed all three known failures and would have been wrong on the
> fourth. Deleted it.
>
> **Bet 3 — never let the AI invent a fact about me.** This started when an assistant tailoring my
> résumé claimed UAT experience I don't have. So the match tags come from a closed vocabulary seeded
> from tags I'd been using by hand, anything the model invents goes to a suggestions field that can't
> affect ranking until I promote it, and "not evaluated" is a visible state rather than a quiet low
> score — which caught a real bug where 33 of 48 jobs were ranked low only because the AI had never run
> on them.
>
> **Where I stayed in the details.** Cost was the binding constraint: the real ceiling turned out to be
> 20 model calls a day, not scraping, so I halved the calls per job. Where a cheaper option carried
> accuracy risk — packing several jobs into one prompt — I refused to adopt it on reasoning and
> pre-registered the kill criterion first: any disagreement on an eligibility-affecting field ends it.
> And I settled whether the batch API was available by sending one throwaway request rather than
> reading the docs; it requires billing, which closed the option in a minute.
>
> **Outcome.** The résumé builder is live and is the link I send recruiters. job-scout runs end to end
> at $0. The sharpest catch came last and wasn't an AI problem at all: LinkedIn's logged-out pages
> silently discard search filters, so a run returned 50 results, reported success, and 0 of 51 postings
> matched what I'd asked for. I swapped sources and verified with a capped 10-job run instead of
> trusting the docs: 10 of 10 clean. Still pre-outcome on the only metric that counts.

**Caveats flagged to Sakshi and left as her call, not resolved:**
- **Authorship claims.** An intermediate draft said "I wrote the code," which overstates it — Claude
  wrote most of it under her direction. The final version avoids the claim, but if an earlier phrasing
  is reused, "I own the architecture and drove the build" is the defensible form.
- **The obvious follow-up question** on the outcome paragraph is *"what was the filter?"*, and the
  honest answer names remote. Geography and seniority band are also real filters, so a truthful
  narrower answer exists.
- **Bet 1's stated risk** (an over-tight filter silently buries a good role) is real and currently
  unmeasured — D-72 makes drops auditable, but the miss rate has never been computed.

**Next steps:**
1. **Product work is unchanged and still the priority** — Session 22's next steps stand: reconcile the
   unapproved guardrail plan in `plans.md` against Sessions 18–21, and D-71's golden eval is still the
   highest-value item.
2. **Three open decisions are live and blocking real behaviour**: D-122 (how much of the enrichment
   pipeline the new source replaces), D-123 (`remote_type` is produced and ignored — an on-site job is
   currently ranked `high` on the dashboard), D-118 (the free tier is not private; JDs carry recruiter
   names).
3. **Write the missing summary entry for the session that logged D-121–D-125**, or accept the gap
   explicitly — right now the decision log and the summary doc disagree about what has happened.

Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.

---

## Session 24 — 2026-08-08 (root cause found: the scraper never asked for remote jobs; source switched, pipeline rebuilt around it)

### The thread Sakshi pulled
She looked at the populated dashboard and said *"the populated jobs are not remote."* That one
observation unwound four layers.

**Layer 1 — the AI was not the problem.** Of 27 evaluated jobs, 20 were classified `other` (on-site).
The AI had read them correctly. Nothing downstream acted on its answer.

**Layer 2 — two sound decisions had collided.** `recommend` ignores `remote_type` because D-53's
premise was *"everything reaching here is already remote-India eligible"* — true while the ingest
filter dropped non-remote postings. **D-104 removed that filter** and moved the judgement to the AI.
Nothing downstream was updated, so both "Yes" jobs on the board were on-site roles (D-123).

**Layer 3 — `location` was never shown to the AI.** Captured at ingest, stored, rendered on the
dashboard, passed to **no prompt**. `geoRecheckPrompt` even asked the model to weigh *"phrasing that
presumes a location"* while withholding it. Paired with a rubric saying mark it remote if the posting
*"mentions India"* — which every Bengaluru posting does — that explains the mislabels (D-129).

**Layer 4, the actual root cause — the scraper could not ask for remote jobs.** The Apify run input
was correct: all four URLs carried `f_WT=2`. But `curious_coder/linkedin-jobs-scraper` reads
LinkedIn's **logged-out** page, which silently ignores that filter, and its entire input schema is six
fields with **no cookie or credential of any kind** — unfixable by configuration. Of 51 real postings,
**not one was remote**; the only `Remote (India)` row was a hand-written test fixture. `apify/task-config.md:95`
had warned that a logged-out LinkedIn ignores `f_WT=2`, but the warning was written about reading
*counts by hand* and nobody saw it applied to the scrape (D-121).

### What was rebuilt
**Source switched** to `fantastic-jobs/advanced-linkedin-job-search-api`, chosen because its remote
filter is **its own, applied server-side** — there is no LinkedIn parameter left to be silently
dropped. Verified by a capped test before adoption: 10 of 10 remote, 10 of 10 India. Its
`ai_remote_location` caught a job listed as India whose description says *"candidates must be based in
China"* — LinkedIn's own metadata was wrong and the field caught it. 71 fields, only 23 AI-derived;
the full raw description survives, so Sakshi's own classification stays authoritative (D-121).

**Provider switched** to Groq after Gemini's daily quota was exhausted. GitHub Models was recommended
first, an adapter written, and the first live call returned 404 — **the service was retired eight days
earlier** (D-124, corrected in place).

**53 legacy jobs retired**, marked not deleted, so the evidence D-121 rests on survives.

**Discovery reshaped** (D-126): one broad PM-family search including internships, because measured
supply is brutal — 34 remote India PM roles in 7 days versus **3 Associate/Junior PM roles in six
months**. Seniority is judged by Sakshi's own `years_experience_min` after ingest, never filtered at
source. Her question *"who is assessing the drop?"* killed the pre-filter: the answer was a third
party's model plus a title regex.

### Corrections recorded, not buried
Four claims made confidently this session turned out wrong: staggered key exhaustion "proving" four
separate Gemini projects (D-125); "retries burned 60 requests" when the key pool was already failing
fast (D-125); GitHub Models being available (D-124); and a 20-minute stall diagnosed as a hung socket
when it was a legitimate 9-minute backoff (D-128). Every one was settled by counting something rather
than reasoning further.

### State at wrap
31 jobs on the board · 30 classified, 1 queued · 21 remote-India, 9 on-site · 18 junior-or-unstated ·
`remote_companies` catalog at 77 · 65 Groq calls · Apify spend **$0.08** of the $5 monthly credit ·
Gemini untouched since its quota ran out.

### Decisions
D-126 (broad search, own-AI seniority) · D-127 (Groq's real limit is 100k tokens/day, ~43 jobs) ·
D-128 (hang misdiagnosed; timeout kept and labelled honestly) · D-129 (`location` reaches the
classifier; rubric rewritten). Earlier tonight: D-121, D-122, D-123, D-124, D-125.

### Next steps
1. **Finish the last queued job** — the 70B daily token budget is spent; either wait for it to roll
   over or run on `llama-3.1-8b-instant`, which has a separate budget and weaker instruction-following.
2. **Verify the prompt v5 fix worked** — re-classify the Kira/China role and confirm it now returns
   `remote_global` rather than `other`. Nothing has been re-run since the prompt changed.
3. **Check the experience filter against reality** — list what the "Too senior" chip hides and confirm
   no null-experience job landed there.
4. **D-122**: decide which enrichment stages the source's `ai_key_skills` / `ai_salary_*` /
   `ai_requirements_summary` should replace. Sample is on disk at `samples/`.
5. **D-115 / D-110**: `v_jobs_public` + RLS, then the Next.js dashboard. Still the only path to a
   shareable board.
6. **The golden set** — still nothing anywhere records what a *correct* verdict looks like. Ten
   hand-labelled JDs remains the highest-value missing artifact.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 25 — 2026-08-08 (last job finished, prompt v5 verified, dashboard filters exercised — one silently broken and fixed)

### Enrichment closed out
`npm run enrich -- --all` finished cleanly — Groq's daily token budget had reset since Session 24, no
8B fallback needed. **All 31 jobs now `classify_status = 'evaluated'`.** The Kira/BJAK job was
re-classified directly rather than assumed fixed: `remote_type` went from `other` to `remote_global`,
confirming D-129's prompt v5 rubric rewrite works on the exact case it targeted (D-130).

### Dashboard filters verified by hand, one bug found
Regenerated `dashboard-live.html` (`npm run dashboard`) and clicked through every filter group in the
browser rather than trusting the code. Should-I-apply, location, experience, technical, IIT/IIM, and
industry chips all matched independent DB counts; detail pane open/close (click, ×, Escape) and the
empty state all work.

**"AI roles only" always returned zero jobs, silently, since the dashboard script was first written.**
Root cause: `build-dashboard.ts`'s `.select()` call never listed the `is_ai` column, so it arrived
`undefined` on every job and the render ternary defaulted to "no" every time — no error anywhere,
just a confident wrong zero. Same class of bug as `remote_type`/`salary_status`/`priority` before it,
one layer earlier this time (a missing selector, not a missing default). Fixed by adding `is_ai` to
the select list; verified against a direct DB count (20 of 31) before and after (D-131).

### "Too senior" filter checked against reality — no bug found
Carried-over item from Session 24, closed out. Code inspection (`build-dashboard.ts:98-99` and
`:206-207`) shows `years_experience_min == null` is explicitly routed to the `'fit'` bucket, never
`'senior'` — documented at three places (inline comment, D-126, `lib/enrich/experience.ts:6-9`'s
null-preservation rule). Empirical check against the live DB (`v_jobs_enriched`, all 31 jobs) confirmed
it in practice: 7 jobs have `years_experience_min = null` (all `classify_status = 'evaluated'`), 7 jobs
are in the "senior" (7+) bucket, zero overlap between the two sets. The dashboard's "Too senior · 7+
(7)" chip count matches the DB exactly. Conclusion: the filter does not have the "absent is not
negative" bug (D-73/D-112/D-131's class) — it was written to specifically avoid it.

### D-122 closed: Apify's ai_* fields do not replace any enrichment stage (for now)
Checked the 10-job sample (`samples/fantastic-jobs-remote-india.json`) against what each candidate
stage actually costs today. `skills` already rides `classify`'s single AI call (D-117a, 0 marginal
cost) and `salary` is already a free deterministic regex parser (D-12) whose coverage beats Apify's
(`ai_salary_min/max` null in 10/10 sample jobs) — handing either over saves no quota and only adds
risk. `classify` is the one stage that costs a real AI call, but `ai_experience_level`'s coarse
bucket strings risk the exact precision the "Too senior" filter (verified clean above) depends on,
and `ai_requirements_summary` quality is unverified beyond this one sample. Sakshi's call, in chat:
keep all three stages as-is; revisit with a bigger sample or a real quota crunch. Full writeup in
`decisions.md` D-122 (now CLOSED).

### Decisions
D-130 (queue finished, Kira/China verdict confirmed `remote_global`) · D-131 (bug fix: `is_ai` missing
from dashboard query, "AI roles only" filter fixed) · D-122 (closed: no enrichment stage handed over
to Apify's ai_* fields).

### Dashboard redesign conversation started, then D-121 discovered never actually run
Sakshi walked through `dashboard-live.html` in the browser and gave 8 pieces of concrete feedback
(location filter on a "remote" board, on-site jobs after a "fresh call," pending as a first-class
verdict, experience/title as hidden-by-default filters, industry chip explosion). Investigating
"why are there still on-site jobs" surfaced that **D-121's actor switch had never actually been
executed** — `processed_runs` had exactly one row, belonging to the *old* actor. Everything in the
dashboard until tonight, including everything Session 25 verified above, was old-actor data.

### D-121 executed for real, with two bugs found and fixed along the way (D-132)
- **Old data soft-excluded, not deleted.** All 88 old-actor jobs got `dropped_reason` set (not a hard
  delete — Claude does not execute permanent deletes regardless of instruction; this preserves the
  476 enrichment rows and 190 AI calls' worth of already-paid-for classification, fully reversible).
- **New bug: canonical-linking to a dropped parent.** New jobs matching a dropped old job's
  `(company, title)` silently inherited its `canonical_job_id`, making them invisible to enrichment
  (D-98's check only looks at the job's own value, not the parent's). Hit twice (9 jobs on the first
  ingest, 25 on the second) and fixed both times by clearing the stale link.
- **The real "coverage gap" was a missed input parameter, not an actor limitation.** Apify's `limit`
  field defaults to 10 if omitted — every run this session omitted it, which is why results looked
  capped and inconsistent between runs. Confirmed by eyeballing LinkedIn logged-in directly (89 real
  matches; the "10 vs 89" gap looked like a real actor problem until the schema check found the
  missing parameter). Fixed: `limit: 150`. Final run found **45 real jobs** — a plausible number, no
  longer suspicious.
- **Real Apify pricing confirmed live**: $0.005/job ($5/1,000), not the store page's $1.50/1,000.

### Three more standing decisions made in the same conversation
- **D-133**: `v_enrich_pending` now only auto-selects junior-titled roles (APM, Product
  Intern/Product Manager Intern, Product Associate, Junior PM) for AI enrichment. Explicitly not a
  repeat of D-126's rejected mechanism — jobs still get ingested and stay visible as "not yet
  evaluated," reversible via manual `--job <id>`, unlike D-126's permanent ingest-time drop. One real
  regex bug caught and fixed before shipping ("Product Manager Intern" didn't match the first
  pattern).
- **D-134**: recurring cadence will be Apify's own Schedule, `timeRange: "24h"`, daily — avoids
  re-paying for the same overlapping jobs a naive `7d`-every-day schedule would cause.
- **D-135**: `populateAiRemoteLocation`/`populateAiRemoteLocationDerived` added (free quality
  improvement). LinkedIn's own fixed `org_linkedin_industry` taxonomy confirmed as the right fix for
  the 26-unique-values `domain` filter problem — not yet implemented, flagged as its own task.

### New known issue, not yet fixed
The dashboard's "Pending" count (33 of 44 jobs) now conflates two different states: "not yet
classified, will get to it" and "will never be auto-classified because the title filter excludes it
by design" (D-133's consequence). Same badge, two meanings — ties directly into Sakshi's original
feedback item #6 ("pending shouldn't be a first-class verdict"). Not resolved this session.

### Decisions
D-130, D-131, D-122 (see above) · D-132 (D-121 executed for real; `limit` default bug found and
fixed; canonical-linking-to-dropped-parent bug found and fixed twice) · D-133 (junior-title-only
enrichment filter) · D-134 (recurring cadence: Apify Schedule, 24h, daily) · D-135
(populateAiRemoteLocation flags; LinkedIn industry taxonomy direction confirmed, not yet built).

### Next steps
1. **Fix the "Pending" conflation** on the dashboard — distinguish "not yet classified" from
   "excluded by the junior-title filter by design" (D-133). Directly requested by Sakshi (feedback
   item #6), surfaced but not resolved tonight.
2. **LinkedIn's fixed `org_linkedin_industry` taxonomy** (D-135) — replace or supplement the AI's
   free-text `domain` field, which produces near-one-value-per-job. Direction confirmed, no code yet.
3. **Set up the recurring Apify Schedule** (D-134: `timeRange: "24h"`, daily) — decided but not
   built; still choose Apify's own Schedule vs. an external cron trigger.
4. **D-115 / D-110** — build `v_jobs_public` and enable RLS, then the real Next.js dashboard. Still
   the only path to a shareable board; RLS is currently disabled on all 15 public tables.
5. **The golden set** — still nothing records what a correct verdict looks like. Ten hand-labelled
   JDs remains the highest-value missing artifact.
6. Consider whether the industry filter chips' semantics (all-shown-by-default, click to *exclude*)
   match what Sakshi actually wants — superseded in part by item 2 above, but still open if the
   LinkedIn taxonomy switch doesn't fully resolve it.
7. **Canonical-linking-to-dropped-parent** (D-132) — fixed manually twice this session; worth a real
   schema-level fix (e.g. `linkCanonical` skipping dropped candidates) if old-data retirement ever
   happens again while new data keeps arriving.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 26 — 2026-08-09 (Priority-2 remote-only check for senior-titled jobs, built and verified live)

### Dashboard investigation → real feature, not just a UI fix
Started as "explain the Pending badge in plain language" (carried over from Session 25's open item),
but talking through it live surfaced something more concrete: Sakshi pulled up the actual dashboard,
found on-site jobs (CodeRound AI, Pocket FM, Danaher) that made it through Apify's own remote filter
anyway, and then asked directly — every ingested job, regardless of title, should get *her own*
remote assessment, not just the source's. That's not possible today: `remote_type` only comes out of
`classify`, and D-133 excludes senior titles from `classify` entirely.

Her actual ask, refined over a few exchanges: junior titles keep the full pipeline exactly as-is;
senior titles get *only* a cheap remote-only check, queued to run after the junior pipeline, using
whatever AI quota is left for the day — no new "how much is left" predictor needed, just stop
cleanly when quota runs out.

### Built and shipped: D-136
A new, fully separate stage (`remote_check`) and orchestration path (`enrichRemoteCheckPending`),
deliberately kept out of the existing junior pipeline's `ORDER` array so D-133's title-gated function
stays provably unchanged. Full file list and design in `plans.md`'s Session 26 entry; full reasoning
in `decisions.md` D-136.

**Real gap found and closed along the way:** Groq (sole AI provider since D-132) had *zero* daily-
quota detection — only Gemini's old key-pool module had it. Without fixing this, the new Priority-2
queue would have burned a full retry-and-backoff cycle on every remaining senior job once the day's
Groq budget was spent, instead of stopping. Fixed with a small Groq-specific tracker
(`lib/ai/groqQuota.ts`), deliberately separate from Gemini's `keyPool.ts` — the two providers'
quota shapes are structurally different (multi-key/requests-per-day vs. single-key/tokens-per-day),
so one module can't correctly serve both.

**Verified against live data, not just typechecked:**
- Applied the migration to the real Supabase project. Immediately after: `v_enrich_pending` = 0,
  `v_remote_check_pending` = 33 — exactly matches the dashboard's "Pending 33" figure, confirming
  this was the whole conflation behind the original "Pending" question.
- Ran `remote_check` on a real job (Flexiple, "Product Manager") end to end — real verdict via Groq,
  usage recorded, dropped out of the queue immediately after.
- Ran the batch loop on 2 more real jobs to verify the orchestration path itself, not just the
  single-job function — queue moved 33 → 30 as expected.
- `npm run typecheck` clean; all 34 tests pass (4 new: Groq TPD-detection positive/negative cases,
  and a regression check that `remote_check` never rejoins the junior pipeline's `ORDER`).
- 30 senior-titled jobs remain queued for the next `npm run enrich -- --all` or `--remote-check` run.

### Explicitly declined / deferred this session
- **Narrowing the Apify remote filter to "Remote Solely" only** (dropping "Remote OK") — raised,
  tradeoffs explained (real volume drop per D-126's own prior evidence), user dismissed without
  proceeding. Filter stays as `["Remote OK","Remote Solely"]`, unchanged.
- **"Remote company job tracker" as a routing destination** for excluded jobs — investigated and
  clarified: this is not a separate system, it resolves to the existing `remote_companies` catalog
  (D-44/D-109) inside job-scout's own DB, whose scope Sakshi confirmed is still undecided. Not built
  into anything this session, per this project's own decisions-vs-setup-docs process rule.
- **Dashboard search** and the **"Pending" badge UI fix itself** (splitting the label into "not yet
  classified" vs. "excluded by design") — both raised, explicitly scoped OUT of this session's plan
  when asked directly. D-136 fixes the underlying data gap the Pending conflation was pointing at,
  but the dashboard still shows one undifferentiated "Pending" badge — that UI work is still open.

### Decisions
D-136 — Senior-titled jobs get a new, cheap remote-only check; D-133's skip stays in force for the
full pipeline. Full text in `decisions.md`.

### Next steps
1. **Run the remaining Priority-2 queue** — 30 senior-titled jobs still need their first remote
   check; happens automatically on the next `npm run enrich -- --all`.
2. **Fix the "Pending" badge UI itself** — now that D-136 gives senior-titled jobs a real
   `remote_type` once checked, the dashboard should distinguish "not yet classified" (junior, still
   queued) from "excluded from full triage by design, remote-checked separately" (senior) — still
   not built, carried over from Session 25.
3. **Dashboard search** — raised this session, explicitly deferred, no design work done.
4. **LinkedIn's fixed `org_linkedin_industry` taxonomy** (D-135) — still not built, direction
   confirmed only.
5. **Set up the recurring Apify Schedule** (D-134: `timeRange: "24h"`, daily) — still not built.
6. **D-115 / D-110** — `v_jobs_public` + RLS + real Next.js dashboard — still not built.
7. **Canonical-linking-to-dropped-parent bug** (D-132) — still only fixed manually when it recurs;
   no schema-level fix yet.
8. If Sakshi wants to revisit the "remote company job tracker" idea, it needs its scope actually
   decided first (per CLAUDE.md's process rule) — right now it's just the existing
   `remote_companies` catalog with an undefined dashboard presence.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 27 — 2026-08-09 (curious_coder removed completely; the removal exposed a dead-wired webhook)

### How the session actually went
Opened on "did we fix remote solely?" — answered from the record: no, it was raised and explicitly
declined in Session 26, filter unchanged at `["Remote OK","Remote Solely"]`. Then a schema question
about job expiry, which turned up something worth keeping (below). Then Sakshi's actual instruction:
**"remove curious coder completely"**, with the constraint that shaped everything —
**"Don't delete anything until you confirm the new code works."**

### Job-expiration signal — found, deliberately NOT acted on
Investigating whether the actor can tell us a posting has expired turned up `date_valid_through`
(schema.org `validThrough`) sitting unused in the actor's own payload — a real LinkedIn-supplied
expiry date, present on roughly half the records (19/35, 19/34, 3/10 across the saved samples), null
on the rest. Mapped nowhere today.

This matters because `jobs.link_status` and `last_checked_at` have been inert since `0001` — D-45
scoped a staleness rule for them but deliberately never built it, since the mechanism (re-fetching
posting URLs on a schedule) is its own scraping-adjacent subsystem with its own ToS exposure (D-30).
`date_valid_through` is a cheaper, ToS-free partial alternative. **That's a real decision** (partial
coverage now vs. D-45's full-coverage-but-unbuilt mechanism), so per `CLAUDE.md`'s process rule it
was surfaced and left for its own conversation, not folded into the cleanup. No code touched.

### Built and shipped: D-137 — curious_coder removed
Executed in the order Sakshi asked for: **add and prove first, delete last.**

**The finding that made this more than cleanup.** `services/discovery/webhook.ts` — the live endpoint
Apify POSTs to when a scheduled run finishes — was **still calling `mapApifyItem`**, the retired
curious_coder mapper. D-121 switched actors two days ago and never updated this file. The two
payloads share no field names, and `mapApifyItem` returns null when it finds no id, so a real
fantastic-jobs delivery would have mapped **every item to null, ingested zero jobs, and returned HTTP
200**. It never fired only because D-134's schedule was never switched on. This is the same
silent-success shape D-121 exists to record, reproduced one layer down in the code written to consume
that fix.

**What changed:**
- `tests/fixtures/sample-fantastic-jobs.json` (new) — field names copied from the real captured run,
  per D-121's own verify-against-a-run rule.
- `tests/discovery.test.ts` — 4 tests ported off `mapApifyItem`; **net +2**, since the epoch-ms check
  became an ISO check *plus* a `date_posted`→`date_created` fallback case the mapper implemented but
  nothing tested, and a new no-id→null guard for D-8's dedup precondition.
- `services/discovery/webhook.ts` — repointed to `mapFantasticJobsItem`, with a comment recording that
  this is a bug fix and not a cosmetic rename.
- `lib/discovery/apify.ts` — `mapApifyItem` deleted. `pick()` **kept** (see below).
- `scripts/run-ingest.ts` — `'curious-coder'` removed from `MAPPERS`; the map and `--actor` flag kept
  deliberately, since D-121's design point is that the mapper is chosen explicitly, never sniffed.
- `apify/task-config.md` — fully rewritten. It had described curious_coder as the current actor for
  two days after D-121 replaced it, including an input schema this actor doesn't accept. Now written
  against D-121/D-126/D-132/D-134/D-135, each cited. Caught while writing it: the plan carried
  `removeAgency: true` from D-126, but **D-132 amended that to `false`** — corrected to the live value.

**The ordering constraint earned its keep immediately.** During deletion, `pick()` was removed as
"used only by `mapApifyItem`" — wrong; `mapFantasticJobsItem` calls it as `pick<string>(...)`, which
the earlier grep had missed. Typecheck caught it in seconds, and the error was unambiguous *because*
everything else was already known green. Restored with a comment explaining its reduced role.

**Verified:** typecheck clean · discovery 9/9 · enrich unchanged and green · grep for
`mapApifyItem`/`curious` in live source returns only explanatory comments. And proven against real
data, not just types: `npm run ingest -- --file samples/fantastic-jobs-remote-india.json` returned
`received: 10, duplicates: 10` — all 10 real records mapped, none lost to null (under the old mapper
`received` would have been 0). Nothing was written to the DB; all 10 were already-seen duplicates,
which is ingest's idempotency (D-8) working as designed.

### Decisions
D-137 — curious_coder removed completely; the removal exposed a dead-wired webhook. Full text in
`decisions.md`. Two learnings entries added (replacing isn't finished until the old thing is gone;
prove the new thing before deleting the old).

### Next steps
1. **DO NOT build the recurring Apify Schedule** — Sakshi said explicitly at the end of this session:
   *"don't do a schedule yet."* D-134 decided the cadence (`timeRange: "24h"`, daily) but building it
   is **not** authorized. Do not treat D-134, or `apify/task-config.md` §3, as a go-ahead.
   *When it is eventually built:* confirm the first real run ingests a non-zero count before trusting
   it — the webhook fixed this session has still never fired for real, and its failure mode is a
   silent success (zero jobs, HTTP 200).
2. **Decide the `date_valid_through` / job-expiration question** — whether it feeds `link_status`, and
   how it relates to D-45's unbuilt re-fetch mechanism. Needs a real call, not an inline wire-in.
3. **Run the remaining Priority-2 queue** — 30 senior-titled jobs still need their first remote check
   (automatic on the next `npm run enrich -- --all`). Carried over untouched from Session 26.
4. **Fix the "Pending" badge UI** — distinguish "not yet classified" from "excluded by design,
   remote-checked separately". Carried over from Sessions 25–26.
5. **Dashboard search** — still raised-but-undesigned.
6. **LinkedIn's fixed `org_linkedin_industry` taxonomy** (D-135) — direction confirmed, not built.
7. **D-115 / D-110** — `v_jobs_public` + RLS + real Next.js dashboard — not built.
8. **Canonical-linking-to-dropped-parent** (D-132) — still only fixed manually when it recurs.
9. Optional tidy-ups this session deliberately left: `tests/fixtures/sample-linkedin.json` (now
   unused, harmless) and `.claude/worktrees/sad-booth-957bb2/` (stale worktree copy still containing
   the old curious_coder code — not live, but it will keep showing up in greps).

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 28 — 2026-08-09 (schedule locked out; clean-slate + Remote Solely plan designed; remote-company tracker redesigned twice; catalog found 91% unverified)

Direct continuation of Session 27, same calendar day — the curious_coder removal (D-137) was already
executed and recorded before this stretch began. Four threads: locking in a standing instruction,
designing a reset plan, iterating a new feature's design through two wrong drafts, and a real
correctness finding that changes both.

### 1. "Don't do a schedule yet" — locked in explicitly
After the D-137 wrap-up listed the recurring Apify Schedule as a next step, Sakshi cut that off
directly. Both `session-summary.md` (Session 27's next-steps #1) and `apify/task-config.md` §3 were
rewritten from "not built, a live next-step" to **"not built, and NOT to be built yet"** — a decided
cadence (D-134) sitting next to a next-steps list reads like a green light otherwise, and that gap was
closed on both sides.

### 2. Clean-slate + Remote Solely run — designed and refined, NOT executed
Sakshi: *"delete everything, let us start from scratch."* Investigated before agreeing: 133 jobs (45
live, 88 soft-dropped), only 14 of the 45 with any enrichment, a 30-job remote-check queue mid-flight.
Landed on **hard delete over D-132's soft-exclusion precedent** — soft-delete is the actual mechanism
behind an unfixed bug (canonical-linking never filters `dropped_reason`; 93 real company+title pairs
would be landmines for a re-ingest). Sakshi later added `remote_companies` to the delete list too
(see thread 4 for why that turned out to be well-founded, not just preference). Refined through the
session: `timeRange` widened from a first draft of `"7d"` to Sakshi's requested `"6m"`, after checking
and setting aside a stale `plans.md` claim that `"6m"` has its own quirk (it doesn't — the real cause
of every "only 10 jobs" symptom was always the missing `limit` parameter, per D-132). The Remote
Solely narrowing itself was explicitly logged as **temporary** — Sakshi's own sequencing (*"for now
let us use actors… once we've proved the system works… we can take in all pm jobs"*) — with Phase 2
(widen back to everything, D-126's original design) constrained by AI quota, not Apify cost.
**Status: fully designed, nothing executed** — no truncate has run, no Apify run triggered.

### 3. Remote-company tracker — a new tab, redesigned twice before the real shape emerged
Sakshi's ask: track companies confirmed to hire remote, so she can reach out for internships/portfolio
even when nothing is currently listed. Two drafts, both corrected by her own follow-up questions:
- **Draft 1:** live-joined to `jobs`, split by "has an opening now" vs. not, with a seniority-fit
  column. Wrong on both counts — the seniority column was Claude reusing the main dashboard's existing
  bucket logic without it tracing to anything she'd asked for (conceded when she asked "why do I need
  this?"); and a company with an open *junior* role would just duplicate what the main dashboard
  already shows.
- **Draft 2:** restrict to companies with no current opening — still organizes around live job state,
  just inverted.
- **The actual shape, from her own words:** *"this is going to be a permanent database... an APM role
  which is active now may not be active later... but I will lose that data that this company was
  remote."* **The tab is a durable archive, not a live view** — no join to current job state in the
  main display; junior/senior becomes an optional, off-by-default filter, not the organizing
  principle. Real gap found: `remote_companies` never captures recruiter contact info at all, even
  though `jobs` has it — for a record meant to support outreach, that needs to be snapshotted onto the
  permanent record, not fetched live. **Status: design only, D-140, nothing built.**

### 4. The finding that ties 2 and 3 together: the catalog itself is 91% unverified
Sakshi's actual reason for the delete, stated directly: *"most of the jobs that I'm seeing there are
not remote jobs."* Checked live rather than assumed: **30 of 82 companies (37%) confirmed only via the
retired curious_coder actor** (proven to return 0/51 genuinely remote postings, D-121); **75 of 82
(91%) have never had a job actually AI-confirmed as remote** by `classify`/`remote_check` at all.

**Root cause, verified structurally, not just old data:** `confirmRemoteCompany`
(`lib/discovery/remoteCompanies.ts:26`) fires on any job that survives ingest — it cannot check
`remote_type`, because `remote_type` doesn't exist yet at that point in the pipeline (`npm run ingest`
and `npm run enrich` are separate scripts; confirmed by checking both files directly, zero
cross-references). "Confirmed" in this table has only ever meant "survived a weak ingest-time
check," never "AI-verified remote." This directly threatens both other threads: the fresh Remote
Solely run (thread 2) would repopulate the catalog the same unverified way unless this is fixed
first, and the tracker tab (thread 3) would be a nicely-designed home for still-wrong data if built
before this is fixed.

### Decisions
D-138 (clean-slate scope: hard delete, temporary Remote Solely narrowing, `timeRange: "6m"`),
D-139 (catalog found 91% unverified; root cause is `confirmRemoteCompany`'s ingest-time-only gating),
D-140 (remote-company tracker redesigned as a permanent archive). Full text in `decisions.md`. One new
learnings.md entry (confirmation-before-verification bug shape). Full plan content for both D-137
(executed) and D-138 (pending) copied into `plans.md`, since neither had been archived there before.

### Next steps
1. **Answer the two questions the session was wrapped before resolving:**
   - Fix `confirmRemoteCompany`'s gating (D-139) before or after the clean-slate run (D-138)? Fixing
     first means the fresh catalog is trustworthy from day one; fixing after means the run happens
     sooner but recreates the same 91%-unverified problem.
   - Build the remote-company tracker (D-140) now, or later, once fresh + trustworthy data exists?
2. **Execute D-138** once the above is settled: Sakshi runs the truncate (backup queries included in
   the plan) and the Apify actor with `aiWorkArrangementFilter: ["Remote Solely"]`, hands off the run
   ID, Claude ingests/enriches/rebuilds.
3. **`date_valid_through` / job-expiry** — raised three times now across Sessions 27–28, still
   unresolved. Found this session to be weaker than it first looked: ~84% of the field is just
   "posted date + 30 days" (LinkedIn's default listing lifespan), not real evidence a job closed.
   Needs a real decision, not an inline wire-in.
4. **The `dedup.ts` canonical-linking bug** — moot for the D-138 run specifically (hard delete removes
   every collision candidate) but still unfixed at the code level; will resurface the next time
   anything is soft-dropped.
5. Carried over, untouched this session: the 30-job Priority-2 remote-check queue, the "Pending" badge
   UI split, dashboard search, D-135's LinkedIn industry taxonomy, D-115/D-110's real dashboard.
6. If the tracker (D-140) proceeds: still needs a decision on single-snapshot vs. full evidence
   history for `remote_companies` — flagged, not asked directly yet.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 29 — 2026-08-09 (`confirmRemoteCompany` gating fixed; remote-company tracker built and verified; D-138's reset still not run)

Direct continuation of Session 28: both questions it wrapped without answering got resolved and
executed in one pass — fix the gating first, then build the tracker, in that order.

### 1. The two open questions from Session 28, both answered directly
Sakshi: fix `confirmRemoteCompany`'s gating **before** running D-138's reset (not after — the reset
doesn't depend on the catalog, and fixing after would just repopulate it the same unverified way);
build the remote-company tracker **now**, not later. Also asked and resolved along the way: the
evidence model stays a single snapshot (not a full history, D-141), and the tracker lives as a tab
inside `dashboard-live.html` rather than a separate file — Sakshi's explicit call after being shown
the real conflict this creates with D-115 (which kept recruiter PII out of that exact file because it
"might get shared"). Both captured as D-141/D-142.

### 2. `confirmRemoteCompany`'s gating fixed
`services/discovery/ingest.ts` no longer touches `remote_companies` at all. `lib/enrich/classify.ts`
and `lib/enrich/remoteCheck.ts` now call it after `writeEnrichment`, only when
`remote_type === 'remote_india'` is actually known — closing the exact gap D-139 found. Recruiter
contact is now snapshotted onto the catalog too (D-140's outreach requirement), **coalesced** rather
than overwritten so a later job with no contact info can't erase one a previous job supplied.

### 3. Loose end found mid-implementation, flagged rather than silently handled
`scripts/run-backfill-remote-companies.ts` called the old, broken confirmation logic directly and
would not have compiled against the new signature. Explained the tradeoff (delete vs. rework) to
Sakshi rather than picking one; she chose delete. Removed, along with its `package.json` entry.

### 4. Remote-company tracker built
New tab in `dashboard-live.html` (via `scripts/build-dashboard.ts`): permanent archive view (no live
join to `jobs`, per D-140), PII warning banner, off-by-default junior/senior filter driven by a new
`evidence_seniority` snapshot column (bucketed at confirmation time — via `classify`'s
`years_experience_min`, or always `'senior'` via `remote_check`, since D-133/D-136 already gate that
path to senior titles). Extracted a shared `bucketExperience()` helper (`lib/enrich/experience.ts`) so
the Jobs tab and the tracker's seniority logic can't quietly drift apart.

### 5. Verified, not just built
`npm run typecheck` and both test files pass (new `bucketExperience` unit tests added — the only part
of this fix that's genuinely testable offline; the DB-touching gating logic itself has no automated
coverage, since this repo's test suite is deliberately no-DB with no mocking infra). Migration
`0008_remote_companies_recruiter_gating_fix.sql` applied to the live project and columns confirmed.
`npm run dashboard` run against real data and the tab exercised interactively in-browser: tab switch,
PII banner, and the seniority filter's "never hide an unset row" behavior all confirmed working (the
filter narrowing itself was verified by injecting a tagged test row, since none of the 82 existing
companies have gone through the fixed pipeline yet).

### A real technical gotcha hit and fixed along the way
Splitting a Supabase `.select()` column list across lines with string concatenation silently breaks
its type inference (`GenericStringError` instead of real column names) — reverted to single-line
literals in both edited files. Recorded in `learnings.md`.

### Decisions
D-141 (evidence model: single snapshot) and D-142 (gating-fix timing before the reset; tracker built
as a tab inside `dashboard-live.html`, reversing D-115 for that file; backfill script deleted). Full
text in `decisions.md`. One new `learnings.md` entry (the `.select()` concatenation gotcha). This
session's plan copied in full into `plans.md`, referencing the original
`~/.claude/plans/what-happened-this-session-streamed-pelican.md`.

### Next steps
1. **Run D-138's clean-slate reset** — the actual next step, now that both of its prerequisites
   (gating fix, tracker) are done. Backup queries and the Apify config are in the Session 28 plan
   entry in `plans.md`; Sakshi runs the truncate and the Apify actor, hands off the run ID.
2. Once the reset runs: `remote_companies` will finally repopulate correctly — watch that
   `evidence_seniority` starts getting set on new confirmations (all 82 current rows predate the fix
   and carry no seniority snapshot).
3. `date_valid_through` — raised four times now across Sessions 27–29, still unresolved.
4. `dedup.ts`'s canonical-linking bug — still unfixed at the code level; moot for D-138's run
   specifically (hard delete), will resurface the next time anything is soft-dropped.
5. Carried over, untouched again this session: the 30-job Priority-2 remote-check queue, the
   "Pending" badge UI split, dashboard search, D-135's LinkedIn industry taxonomy, D-115/D-110's real
   (Next.js/Vercel) dashboard — now a slightly bigger question, since `dashboard-live.html` carries
   recruiter PII and the real dashboard's RLS design will need to account for that.
6. Pre-existing, surfaced but not acted on: Supabase advisor flags RLS disabled on all 15 tables in
   the live project (not new this session, not caused by this change) — worth a real decision, not a
   blanket enable, before the D-115/D-110 browser-facing dashboard gets built.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 30 — 2026-08-10 (D-138's reset finally executed and verified end-to-end; a live "Remote OK" audit found real AI errors; a reasoning-quality fix designed but not built)

Direct continuation of Session 29's UI feedback thread, which grew into the actual D-138 execution
and a genuine data-quality investigation.

### 1. UI cleanup, RLS, and its own follow-up — all executed
Sakshi's UI feedback (Sessions 29-30) landed as: the "Location" filter chip mislabeled a
`remote_type` filter as geography — fixed by dropping the interactive toggle entirely (on-site jobs
were already excluded by default; only the ability to reveal them is gone), keeping the existing
banner disclaimer as the only signal. "Change RLS now" landed as D-143 (enable, no policies, safe
since only the service-role key is used anywhere) and its own follow-up D-145 (7 `SECURITY DEFINER`
views, not D-143's undercounted 6, plus one mutable-search-path function — both fixed).

### 2. D-138's reset actually ran, end to end, for the first time
Truncate executed with backups verified intact. The Apify run itself had to go through the browser
(Claude in Chrome, Sakshi's logged-in console) — clarified this session that there has never been an
API/MCP path for *starting* a run, only for reading one that already happened; a real gap in what was
previously assumed about "how jobs get ingested." Run `zsQWxBqXxwHc5e6ge`: 52 results, $0.27,
confirming Sakshi's own prediction about real volume. Ingested, enriched, dashboard rebuilt: **the
first live proof the whole confirmation-gating fix chain from Session 29 actually works** — 100% of
the 29 fresh `remote_companies` rows carry `evidence_seniority`, versus 0% on the 82 pre-fix rows.

### 3. `titleSearch` expanded, researched properly first
Confirmed 2 genuine coverage gaps by checking against Sakshi's own real LinkedIn search rather than
guessing: bare "APM" (checked, not needed — real postings always spell out the full form too) and
senior full-form titles (Director of Product Management, VP of Product, Head of Product, Chief
Product Officer — added, justified by tracker/outreach value even though Sakshi wouldn't personally
apply to them, since D-133 already excludes senior titles from her own funnel).

### 4. The Jobs tab was showing permanently-unresolvable "Pending" jobs as if they were just unprocessed
Senior-titled jobs can never get a verdict (D-133), so they sat as "Pending" indistinguishable from a
junior job not yet enriched — directly caused by this session's own `titleSearch` expansion (47 of 52
jobs in the reset batch were senior). Fixed by exposing `is_junior_title()` on `v_jobs_enriched` and
filtering the Jobs tab to it; Remote Companies tab keeps the unfiltered set (still needs senior jobs
for its own signals). Verified: 52 → 5 real jobs, 0 Pending.

### 5. A real, live audit of AI accuracy — the most substantive thread this session
Sakshi's own LinkedIn search surfaced 3 real postings missing from the ingest despite matching title.
Traced via targeted, non-ingesting Apify probes to two distinct causes: 2 are genuine "Remote OK"
exclusions (a real cost of the deliberate "Remote Solely" narrowing), 1 is a genuine on-site mismatch
our AI correctly caught. Widened into a full audit: 18 "Remote OK" postings run through the real
`remote_check` AI, then **manually verified every flagged case against actual JD text** rather than
trusting the AI's own disagreement count. Result: the AI's real noise rate is closer to 1-in-18, not
the naive 6-in-18 — but 2 confirmed cases (Danaher, Equinix) are the AI flatly getting it wrong
despite explicit "remote" language sitting right in the text. Delivered as an Excel file with full JD
text per row, not just a chat summary.

### 6. Root cause found, and a fix designed (not built)
The two confirmed AI misses share a mechanism: `classifyPrompt`'s `reasoning` field is ordered LAST
in the JSON schema, after every verdict — since generation is left-to-right, the model commits before
it explains, so the "reasoning" is closer to post-hoc justification than real reasoning. Design:
reorder to reasoning-before-verdict across all 7 fields Sakshi named, each getting its own
quote-citing reasoning key. A first cost estimate ("roughly doubles the tokens") was wrong and was
corrected under direct pushback rather than defended — real cost is ~5-6% more tokens per call. **Zero
code written this session** — new migration, prompt rewrite, and `writeEnrichment` wiring are all
still needed, and can't even be verified once built until tomorrow's Groq quota resets (today's was
spent by this session's own investigation).

### Decisions
D-142 through D-149 — nav relabel, RLS enablement, Industry/Hiring-status filters, salary snapshot,
RLS follow-up fixes, D-138's `limit`/`titleSearch` amendments, the Jobs-tab junior-only filter, and
the reason-before-classify redesign (scoped, not built). Full text in `decisions.md`. One new
`learnings.md` entry (reasoning-field ordering affects whether an AI's explanation is real or
invented after the fact). This session's plan copied into `plans.md`.

### Next steps
1. **Build the reason-before-classify redesign (D-149)** once Groq quota resets — this is fully
   scoped, nothing about it is still an open question, it just hasn't been coded yet.
2. Re-run the 2 confirmed-wrong probes (Danaher, Equinix) through the rebuilt prompt once it exists,
   to confirm the fix actually changes the verdict, not just adds reasoning text around the same
   wrong answer.
3. The 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi) were never fully resolved —
   revisit if the pattern matters for a future decision.
4. Phase 2 (widening past "Remote Solely") is now better-informed than before — real evidence exists
   on both the false-positive and false-negative sides — but still not decided or scheduled.
5. `tests/golden/` (D-71) is still unbuilt; this session's investigation produced exactly the kind of
   labeled real-failure data that eval was designed to use, but it went into a one-off Excel file
   instead. Worth reconsidering whether to finally build the real thing next.

## Session 31 — 2026-08-11 (Golden dataset template built; classification-error history explained; a stale code comment caught mid-session)

Pure research/explanation session — no pipeline code changed. Direct continuation of Session 30's
"Remote OK" audit thread, moving toward D-71's still-unbuilt golden eval.

### 1. Golden dataset template built
`samples/golden-dataset/golden-dataset-template.xlsx` — a 16-column Excel template for hand-labeled
test cases, structured as: Identity (`case_id`, `company`) · Input (`role_title`, `location`,
`jd_text` — exactly what `classifyPrompt` receives) · Test target (`field_under_test`,
`expected_value`) · Grading (`grading_rationale`, quoting the JD line that proves the answer) · Tags
(`failure_category`, `source`, `severity`) · Documentation (`why_this_test_exists`) · Results
(`actual_v{N}`/`pass_fail_v{N}` per prompt version tested). One worked example row (yellow fill,
`GC-001`, the D-121 city-name-trap case) plus a Legend tab. **This is a human-review spreadsheet, not
D-71/plans.md's designed `tests/golden/fixtures.ts` + `tests/golden/run.ts`** — those are still
unbuilt and remain the actual automated-eval gap; the xlsx is a complementary artifact for manually
grading model output against known-correct answers, not a replacement for the automated harness.

### 2. D-104 (ingest pre-filter's 50% false-positive rate) explained in full, with external research
Walked through why `isObviouslyNonRemote` failed (Merck/"Office 365" token collision, Franklin
Templeton's perks-list match, Amex's benefits-boilerplate match), why the first proximity-based patch
attempt still failed on a 4th real case, and why the fix was to remove JD-prose reading entirely
rather than tune the regex further. Cross-checked against outside research: the same "keyword filters
are high-recall/low-precision, LLMs correct it" pattern shows up broadly in content-moderation
literature and specifically in academic job-posting classification work (a fine-tuned LLM reached 99%
accuracy vs. a dictionary baseline for remote-work detection). This project's tiered design — regex
only for unambiguous structured fields, LLM for anything requiring reading a full sentence — matches
what practitioners converge on elsewhere, independently arrived at rather than researched first.

### 3. Caught and corrected: told Sakshi D-122 was still OPEN when it is actually CLOSED
While answering "do we have a LinkedIn-style structured location/work-arrangement field," traced
`ai_work_arrangement`/`ai_remote_location` to `fantasticJobsSignals()` (`lib/discovery/apify.ts`) —
confirmed it's dead code, never called from the live ingest path. Initially reported D-122 (whether to
wire those fields into the pipeline) as "still OPEN," going only off a stale code comment
(`lib/discovery/apify.ts:65` literally says "D-122, still OPEN"). Checking `decisions.md` directly
showed **D-122 was resolved and CLOSED on 2026-08-08**: explicit decision to keep `classify`/`salary`/
`skills` exactly as-is and never wire `fantasticJobsSignals()` in, because on the 10-job sample tested
the actor's own fields were mostly empty (`ai_salary_min/max` null in 10/10) or too coarse
(`ai_experience_level`'s bucket strings vs. the integer range the dashboard filter needs). The code
comment is simply stale documentation that never got updated after the decision landed — a live
instance of the exact "check the decision log, not inherited code/comments" pattern already logged in
memory (`learning_inherited_not_decided`). Corrected in-conversation before this wrap.

### Decisions
None new this session — purely explanatory. No `decisions.md` or `learnings.md` entries added.

### Next steps
1. `lib/discovery/apify.ts:65`'s comment claiming "D-122, still OPEN" should be corrected to point at
   the actual CLOSED resolution, so a future session doesn't repeat this session's mistake.
2. D-71/D-149's real golden eval (`tests/golden/fixtures.ts` + `run.ts`, per `plans.md`'s Change 5)
   is still the substantive gap — this session's xlsx template is a human-grading aid, not that
   harness. Danaher/Equinix (and any cases populated into the new xlsx) are good first fixtures once
   it's built.
3. D-149 (reason-before-classify prompt redesign) is still fully scoped, zero code written — remains
   the top implementation item once Groq quota allows testing it.
4. The 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi) from Session 30 are still
   unresolved, carried forward again.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*
6. Carried over, untouched again: `date_valid_through` mapping (still just scoped, not built),
   `dedup.ts`'s canonical-linking bug, the 30-job Priority-2 queue, dashboard search, D-135's
   taxonomy, D-115/D-110's real dashboard.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 32 — 2026-08-12 (Architecture/guardrails/cost diagram built, then corrected against source)

Short, single-request session: build a visual artifact, not a code or decision session.

### 1. Built an "Architecture + Guardrails + Cost" diagram for the AI pipeline
First pass (via the `mcp__visualize` widget tool) drew the pipeline spine — job discovery → pre-filter
→ AI enrichment → write/notify — with five guardrail callouts: structured outputs, runtime limits,
fewer AI calls, fallback logic, observability. Written from memory/plausible-architecture assumptions,
**not** checked against the actual code first.

### 2. User caught it: "guardrails are not included" — read as a request to verify, not just re-lay-out
Read the real source before redrawing: `lib/ai/AIService.ts`, `lib/ai/provider.ts`, `lib/ai/groq.ts`,
`lib/ai/throttle.ts`, `lib/ai/groqQuota.ts`, `lib/events.ts`. Found the first diagram had gotten two
guardrails wrong:
- **Runtime limits**: real mechanism is `provider.ts`'s 90s `AbortSignal.timeout()` per HTTP call
  (`REQUEST_TIMEOUT_MS`), not a token cap as originally drawn.
- **Fallback logic**: there is no cross-provider fallback — Groq is the sole provider (D-132,
  confirmed still true). Real behavior on Groq's daily token-quota (TPD) exhaustion is
  `groqQuota.ts`/`provider.ts`'s abort-immediately-no-retry, leaving the job pending for D-101's
  parking to pick up on the next run — not "retry once, then skip" as first drawn.
Redrew the diagram with all five guardrails as equal-weight callouts, each one tied to the specific
code that implements it (D-117a's combined classify+skills call for "fewer AI calls"; the zod
fail-open schemas for "structured outputs"; `job_events` + `ai_usage`/`rollup_ai_cost` for
"observability," which also grounds the "cost" part of the ask).

### Decisions
None new this session — no `decisions.md` entries. This was documentation/visualization work, not a
project decision, and it didn't surface a new standing rule (the underlying lesson — verify
architecture claims against real code before presenting them — is already the recorded pattern in
memory as `feedback_verify_before_recommend_architecture` / `learning_inherited_not_decided`; this
session is another confirmed instance of it, not a new one). No `learnings.md` entry either: nothing
technical was chosen or built, just corrected.

### Next steps
1. Carried over from Session 31, still untouched: `lib/discovery/apify.ts:65`'s stale "D-122, still
   OPEN" comment should be corrected to point at the actual CLOSED resolution.
2. Carried over: D-71/D-149's real golden eval (`tests/golden/fixtures.ts` + `run.ts`) is still the
   substantive gap — this session did nothing toward it.
3. Carried over: D-149 (reason-before-classify prompt redesign) remains fully scoped, zero code
   written.
4. Carried over: the 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi) from Session 30.
5. If the corrected diagram is useful as a durable reference (not just a one-off chat visual), consider
   turning it into a checked-in artifact/doc rather than something that only exists in a past chat
   response.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 33 — 2026-08-13 (Golden dataset explained end-to-end; `remote_type` naming gap found and approved for fix; rename not yet done)

Mostly a teaching/explanation session about the golden-dataset Excel and how `remote_type`
classification actually works, which surfaced one real, previously-undecided naming problem along
the way.

### 1. Explained the golden-dataset Excel and eval methodology, checked against real practice
Walked through every column in `samples/golden-dataset/golden-dataset-template.xlsx` (Identity,
Input, Test target, Grading, Tags, Results groups — all already documented in its own `Legend`
sheet), what "slug" means, why the input is split into 3 fields (`role_title`/`location`/`jd_text`)
rather than one blob, why testing one prompt version at a time matters, why per-field testing
matters, and when splitting a field into its own AI call is/isn't standard (checked against
production LLM-eval literature — Langfuse, Confident AI, Promptfoo, LangChain — each time, not
answered from assumption). Confirmed the two dated result columns already in the sheet
(`2026-08-08`/`2026-08-11`) are a pre-built example pair per the Legend's own note, not two real
completed runs — resolves the ambiguity raised earlier in the session.

Also surveyed which of Sakshi's past decisions (pinned model version, prompt-version-per-row
logging, real-prod-case-sourced test cases, quota-as-hard-constraint, explicit "not evaluated"
state, junior-only AI triage, one-variable-at-a-time verification) already match documented
industry practice — confirmed via search, not asserted.

### 2. Added a plain-language column to the Legend sheet
`Legend` sheet now has a 4th column, "In Plain Language," sitting next to the existing technical
`Notes` column (same Arial/gray-header/wrap-text style as the rest of the file) — a real edit,
delivered to Sakshi as a file.

### 3. `remote_type`'s `'other'` value found to be an inherited, undecided, misleading name — D-150
Sakshi asked why the not-remote bucket is called `'other'` rather than something that names what it
is. Checked `decisions.md` first per this project's own CLAUDE.md rule — found no entry that ever
chose that name; every existing reference either classifies things *into* `'other'` correctly or
paraphrases it as "on-site" in prose (D-132), never uses the literal value name as if it were
self-explanatory. Concluded: inherited, not decided. Recommended `'not_remote'` over `'on_site'`
(the bucket also covers hybrid roles, so `on_site` would misdescribe those). Sakshi approved and
asked to log the decision and rename everywhere. **See D-150** — approved, but implementation not
done this session.

### 4. Full reference-site inventory built for the rename (implementation still pending)
An Explore agent enumerated every real place `remote_type`'s `'other'` literal appears, so next
session can execute the rename directly instead of re-searching:
- **Type def:** `lib/types.ts:10` (`RemoteType` union — do NOT touch `BusinessModel`'s separate
  `'other'` at line 13, different field).
- **Prompt rubric text:** `lib/ai/prompts.ts` lines 54-55 (`classifyPrompt`) and 129-130
  (`remoteCheckPrompt`, verbatim-copied per its own comment — both need editing together).
- **DB schema:** `supabase/migrations/0001_schema.sql:154` — a `text` column with a CHECK constraint
  (`remote_type in ('remote_india','remote_global','other')`), NOT a Postgres enum type, so no
  `ALTER TYPE` needed, just a CHECK-constraint migration. No `DEFAULT 'other'` exists anywhere
  (column defaults to `NULL`).
- **Runtime code:** `lib/ai/AIService.ts` lines 68 and 107 — zod `.enum([...]).catch('other')`
  fail-open defaults for both `classifySchema` and `remoteCheckSchema` (again, do not touch line 76's
  `business_model` `.catch('other')`). `scripts/build-dashboard.ts` lines 91, 289, and a literal
  `remote_type=other` string rendered into the dashboard HTML at line 380.
- **Tests/seed:** no `remote_type` references at all in `tests/*.test.ts` or `seed/*.json` — nothing
  to change there.
- **Docs:** `decisions.md:2717,2825,2980-2981` and `session-summary.md:2563` cite the literal value in
  prose (historical record — these describe past events and arguably should stay as `'other'` since
  that's what the system actually returned at the time; needs a call on whether to leave historical
  citations alone or normalize them too).
- **Golden dataset xlsx:** not yet inspected for the literal value — still needs a scripted pass.
- **New finding: a stray git worktree** at `.claude/worktrees/sad-booth-957bb2/` holds its own copies
  of `types.ts`, `prompts.ts`, `AIService.ts`, `classify.ts`, `recommend.ts`, `telegram.ts`,
  `notion.ts`, `normalize.ts`, `seed/company_watchlist.json`, and `0001_schema.sql` with the same
  `'other'` pattern. Unclear if this worktree is live/in-progress or abandoned — needs a decision
  before the rename touches it, since editing the main tree without it (or vice versa) would leave
  the two trees inconsistent.

### Decisions
- **D-150** — `RemoteType`'s `'other'` renamed to `'not_remote'`. Approved, not yet implemented.

### Next steps
1. **Implement D-150's rename** using the reference-site inventory above — this is the concrete,
   ready-to-execute next task, no more searching needed except the xlsx pass and the worktree call.
2. Decide whether `decisions.md`/`session-summary.md`'s historical prose citations of `remote_type =
   'other'` should stay as-is (accurate history) or get a footnote pointing to the rename.
3. Figure out what `.claude/worktrees/sad-booth-957bb2/` actually is before the rename touches it —
   live branch work or stale leftover.
4. Carried over, still untouched: `lib/discovery/apify.ts:65`'s stale "D-122, still OPEN" comment.
5. Carried over: D-71/D-149's real golden eval (`tests/golden/fixtures.ts` + `run.ts`) — still the
   substantive gap, nothing built toward it this session either.
6. Carried over: D-149 (reason-before-classify prompt redesign) — fully scoped, zero code written.
7. Carried over: the 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi) from Session 30.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 34 — 2026-08-13 (Golden-eval metrics taught end-to-end; Summary sheet automation built, verification pending)

**Note found while wrapping up:** `decisions.md` already contained **D-151** (export real AI-failure
evidence before any DB reset), dated 2026-08-13, but it isn't mentioned anywhere in the Session 33
write-up above — it was made outside this session's own conversation, likely by a parallel/unwrapped
session. Flagging rather than fixing; the decision log itself is the authoritative record either way.

### 1. Taught what metrics apply to the golden-dataset eval, grounded against real practice, not assumed
Walked through, in increasing detail across several follow-ups: which metric fits which field type
(exact-match accuracy for categorical fields like `remote_type`; MAE/tolerance for ordinal
`technical_depth` and numeric `years_experience`; set-based precision/recall for list fields like
`skills`/`background_match`; rubric pass/fail for free text like `reasoning`), why blended accuracy
hides the exact failure mode a hand-picked golden case was built to catch (per-`failure_category`/
`severity` breakdown instead), and — when asked specifically what other product companies do — pulled
current (2026) industry practice via web search: golden sets built in four buckets (stratified
production sample, adversarial library, edge cases, replayed failures — this project's 3 rows are all
bucket 4), eval gates wired into the merge/PR workflow rather than run manually, ongoing production
drift sampling separate from the static golden set, and golden-set maintenance itself tracked
(coverage, reviewer agreement, fail-rate-by-cohort). Confirmed this project's current setup (3
hand-picked real-failure rows, graded offline, not yet wired to CI) is a reasonable v1 seed of that
four-bucket structure, not the finished thing.

Also answered a direct sequencing question — run the golden eval baseline on the current prompt
(`v4`, no reasoning-before-verdict) before implementing D-149's redesign, versus building D-149 first.
**Recommended baseline-first** (the xlsx's paired `actual_prompt-{version}` columns are already
designed for a before/after diff; D-149 is an unproven hypothesis about *why* classify fails, and
skipping straight to the fix means never knowing if it worked or just moved the error) — **not
logged as a decision**, since Sakshi didn't explicitly confirm it before moving on to the automation
question; still open for her sign-off next session.

### 2. Built automated pass-rate metrics into the golden-dataset xlsx — D-152
Sakshi asked to automate the metric aggregation in the spreadsheet itself. Inspected the real current
file structure directly (it had evolved since the template was first described — no unified
`failure_category` column; split into `input_pattern` + `root_cause` tag pairs instead, 3 real rows
now, all testing `remote_type`). Planned and built, via the `xlsx` skill:
- `PASS`/`FAIL` data-validation dropdowns added to the `pass_fail_prompt-{version}` columns (Q, S),
  rows 2–500.
- A new **"Summary"** sheet with live `COUNTIFS`/`COUNTIF` formulas (no `UNIQUE()`/`XLOOKUP` — this
  environment's LibreOffice can't reliably evaluate spilling functions, so unique tag lists were
  built once in Python at write-time): overall pass rate + graded-case count per prompt version,
  false-negative rate and false-positive rate split by `severity`, pass rate broken out by
  `field_under_test`/`input_pattern`/`root_cause`, and a before/after comparison row.
- Explicitly deferred (no rows exist yet to anchor them to): MAE formulas for `technical_depth`/
  `years_experience`, set-based precision/recall for `skills`/`background_match`. A full categorical
  confusion matrix (using the already-stored `actual_prompt-*` predicted values, not just pass/fail)
  was identified as buildable and offered as a follow-up, not built this pass.
- Full plan copied into `plans.md` (originally written to
  `~/.claude/plans/golden-data-set-for-robust-waffle.md`).

### 3. Verification completed (after the initial wrap-up)
LibreOffice installed via `brew install --cask libreoffice` — first attempt silently failed on a
partial download despite the shell reporting exit 0 (worth remembering: exit code alone isn't proof
here), retried and succeeded. Ran the `xlsx` skill's `recalc.py`, which caught a real bug: the
per-`field_under_test`/`input_pattern`/`root_cause` `COUNTIFS` formulas had range/criteria arguments
paired in the wrong order, producing 8 `#VALUE!` errors. Fixed, reran — clean, `total_errors: 0`
across 20 formulas. Did the planned smoke test (`Q2=PASS`, `Q3`/`Q4=FAIL`) and hand-verified every
number the Summary sheet produced (1/3 pass rate, 2/3 false-negative rate, correct per-tag
breakdowns, zero-denominator cells reading `0` not erroring), then reverted `Q2:Q4` back to blank.
Final state confirmed clean.

### Decisions
- **D-152** — Summary sheet added to `golden-dataset-template.xlsx`, computing pass-rate/false-negative-
  rate/false-positive-rate/per-tag breakdowns via live formulas. Implemented and verified
  (recalc clean, smoke-tested by hand).

### Next steps
1. Get Sakshi's explicit sign-off on baseline-before-D-149 sequencing (§1 above) before logging it as
   a decision — currently just a stated recommendation, not confirmed.
2. Offer/build the confusion-matrix follow-up on the Summary sheet if she wants it (uses `P`/`R`
   columns already present).
3. Carried over from Session 33: D-150's rename implementation, the `.claude/worktrees/sad-booth-957bb2/`
   question, `lib/discovery/apify.ts:65`'s stale comment, D-149's actual implementation, the 3
   inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi).
4. Carried over: D-71/D-149's real golden eval (`tests/golden/fixtures.ts` + `run.ts`) — still not
   built; the Summary sheet automates aggregation but there's still no code that runs classify against
   the golden set and writes the pass/fail values in the first place.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 35 — 2026-08-13/14 (Repo published private; D-115 closed at last; recruiter PII found in a second place)

### What happened this session

**A question about committing the dashboards turned into three decisions.** Sakshi asked whether the
two static dashboards could go to GitHub "or are they still static pages." Both are static (the live
one is a regenerated snapshot from `scripts/build-dashboard.ts`, not a running app), and no git remote
existed at all. The real blocker was recruiter PII in `dashboard-live.html` (D-142). Checking where
that data actually comes from settled it: `recruiter_name`/`recruiter_email`/`hiring_manager` are
extracted from the job description text itself (`lib/ai/prompts.ts:76`), and `recruiter_linkedin`
comes from LinkedIn's own public job-poster field (`lib/discovery/apify.ts:57`) — published contact
info, not scraped private profiles. Sakshi's Lusha/Apollo comparison holds: data brokers run entire
businesses on exactly this. → **D-155**.

**Repo created and pushed.** `github.com/zenarcha/job-scout`, **private** — chosen on aggregation
grounds, not legality (a Google-indexable page listing every recruiter in one place is a different act
from the same facts scattered across individual job ads), and it costs nothing since Vercel deploys
private and public repos identically on the free tier. Committed **only** the two dashboard HTML files;
the other ~70 in-flight working-tree changes were deliberately left uncommitted.

**Real RLS gap found and fixed while doing it.** `get_advisors` surfaced three leftover D-138 reset
backup tables (`jobs_backup_20260809` and two siblings) with RLS **fully disabled** — ERROR level,
anon-readable and writable. Migration `0014` enabled it; advisor confirms clear.

**Then Sakshi said "I want the app up" — and chose the real build over the fast one.** Three paths were
offered; she picked building the actual D-110 Next.js app rather than deploying the throwaway snapshot.
A follow-up question resolved the one genuinely new call: **both tabs ship in v1 with recruiter PII
publicly reachable at the live URL** — not covered by D-155, which only decided the *repo* could be
private. → **D-156**.

**D-115 closed after a week open, and the design got better under pressure.** Built `v_jobs_public`
(migration `0015`): same joins/filters/coalescing as `v_jobs_enriched`, recruiter columns removed,
**column list enumerated explicitly rather than `j.*`** — that implicit widening is exactly how D-115
happened in the first place. Then three things escalated it:
1. **Supabase grants anon full write access to everything by default.** Verified against the live DB:
   anon held all 7 privileges on every table and view, including the brand-new one the moment it
   existed. RLS default-deny was the only thing neutralising it — one switch doing all the work.
   Writes explicitly revoked on both new surfaces.
2. **The advisor flagged the first attempt** as `security_definer_view` (ERROR) — correctly. D-145
   exists precisely because a prior session had to harden 7 views out of definer mode; this was an
   8th.
3. **A second, undocumented copy of recruiter PII was found.** `job_enrichments.raw_output` stores the
   verbatim AI response, and the classify prompt's output contract includes recruiter fields — so
   they live in that jsonb blob too. **D-115, D-142 and D-155 all reason about one copy. There are
   two.** Nothing was exposed (anon couldn't read the table at all), but the failure mode is silent.
→ **D-157**.

**The hardening migration was blocked by the permission classifier**, and was not sliced into smaller
pieces to get around it — put to Sakshi in plain language instead. She approved ("do way 2"), it was
applied, and verified: zero PII columns in anon's column privileges, `security_definer_view` ERROR
gone, `jobs`/`job_enrichments` off the no-policy list. Live shape is now invoker-mode view + row
policies + column-level grants excluding both PII copies.

### Decisions this session
- **D-155** — recruiter contact data is fine to commit (public-posting-sourced, personal scale); repo
  private regardless, on aggregation grounds.
- **D-156** — the real Next.js app is what gets hosted, not the static snapshot; both tabs ship in v1
  with recruiter PII publicly reachable at the live URL (Sakshi's call, against the recommendation of
  Jobs-tab-only).
- **D-157** — `v_jobs_public` built (closes **D-115**, open since 2026-08-07); second PII copy found in
  `job_enrichments.raw_output`; defense-in-depth design (invoker mode + row policies + column-level
  grants) chosen and applied.
- Pointer added to **D-115** marking it closed, and to **D-155** pointing at D-156.

### Built this session
- `supabase/migrations/0014_enable_rls_backup_tables.sql` — applied, verified.
- `supabase/migrations/0015_public_dashboard_access.sql` — applied, verified. `v_jobs_public` returns
  52 jobs (5 junior-titled); `remote_companies` 29 rows.
- Private GitHub repo + first real push (`bd3c93a`).

### Next steps
1. **Add Next.js to the repo** — `npm install next react react-dom`; add `dev`/`build`/`start` scripts;
   minimal `next.config.mjs`. `tsconfig.json` needs no changes (already includes `"app"`).
2. **Env vars** — `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` into `.env.example`,
   real values into `.env.local`.
3. **Build the app** — `lib/supabaseBrowser.ts`, `lib/dashboardFormat.ts` (extract `esc`/`daysAgo`/
   `salaryChip`/`VERDICT` from `scripts/build-dashboard.ts` so both share one source),
   `styles/dashboard.css`, `app/layout.tsx`, `app/page.tsx` + components. Port
   `dashboard-live.html`'s behaviour exactly — it is the spec, not a starting point to redesign from.
4. **Verify** — `npm run build` exits 0; `npm run dev` renders both tabs; confirm via the Browser tool
   that the Jobs payload carries no recruiter fields and the Remote Companies tab shows its PII banner.
5. **Deploy (Sakshi's step)** — import `github.com/zenarcha/job-scout` at vercel.com, set the two
   `NEXT_PUBLIC_*` vars in project settings. Claude cannot do the OAuth login.
6. **Still carried over, untouched this session:** D-150's `remote_type` rename implementation,
   D-149's implementation, the `.claude/worktrees/sad-booth-957bb2/` question,
   `lib/discovery/apify.ts:65`'s stale comment, the 3 inconclusive "Remote OK" cases (Pocket FM, EOK
   Gems, Netomi), and D-71/D-149's golden eval harness (`tests/golden/fixtures.ts` + `run.ts`) — still
   not built, which still blocks D-153's baseline run.
7. **Worth considering:** `raw_output` holding a second copy of recruiter PII may deserve its own
   cleanup decision (strip those keys before storing?) rather than only being defended against at the
   grant layer.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 36 — 2026-08-14 (Golden-dataset test-design taught further; happy-path rows built from real jobs; full sheet reorganized and hardened)

**Note found while wrapping up:** a parallel/unwrapped session already claimed Session 35 and
D-155–157 (repo-publishing/PII work, unrelated to this session's golden-dataset thread) — verified by
grep before numbering this entry, per the standing rule. This session starts at Session 36 / D-158.

### 1. Golden-dataset test-design education continued
Walked through, across several follow-ups: sources on what tests belong in a golden set (four-bucket
framing: production sample / adversarial / edge cases / failure replays); what "happy path" means
concretely for this project (all 3 existing rows are diagnosed *failures*, none is a confirmed-good
baseline — the missing regression tripwire); field prioritization by consequence rather than
one-row-per-schema-field (`recommend.ts` only actually acts on `background_match`/`is_ai`/
`technical_depth`; `remote_type`/`geo_explicit` gate elsewhere; the rest is pure extraction). Pressed
twice on "do product companies do this" — answered honestly both times: the "one input, many
assertions" architecture is directly confirmed in DeepEval/Pydantic Evals/Promptfoo's own docs
(quoted and linked, not just paraphrased), but the specific Tier-1/2/3 field-prioritization scheme is
my own extrapolation from general risk-based-testing practice, not something a named source does.
Caught and corrected a real terminology slip: "evaluators" (framework jargon) sounded like it implied
LLM-as-judge, which D-50 explicitly rejected — traced the actual mechanism (one `classify` call
returns all fields in one JSON response; grading is plain per-field exact-match against
`expected_value`, confirmed against D-152's own "exact-match text" note) and confirmed via external
sourcing that exact-match, not LLM-as-judge, is the textbook-correct choice for this schema's narrow/
deterministic fields.

### 2. 12 happy-path rows added — D-158
Queried `job-tracker` (`gwvrpdkiblozwdwoqsgd`) directly for real jobs `classify` has already run
against (only 5 exist total), picked 3 for field diversity, built 4 assertion rows per posting
(`remote_type`, `geo_explicit`, `is_ai`, `technical_depth`/`is_technical`) reusing the same JD per
posting rather than sourcing one JD per field. Two rows (GC-006, GC-012) explicitly flagged
"FLAGGED, NOT YET CONFIRMED" rather than silently trusted — both are genuine judgment calls where the
JD's wording sits close to a rubric boundary.

### 3. `is_junior_title` vs `is_ai` clarified
Junior/senior routing is a deterministic SQL regex (`is_junior_title()`, D-133/D-136) that decides
which pipeline a job enters *before* any AI call — `is_ai` is itself one of `classify`'s AI-judged
outputs, produced only for junior-titled jobs. Opposite mechanisms despite the similar-sounding names.

### 4. Failure-category naming reworked; full sheet reorganized — D-159
Discussed unclear `input_pattern` slugs, landed on a two-tier structure: `input_pattern_family`
(short, structured umbrella, new column) + `input_pattern` (fuller, self-explanatory, renamed) — both
`ip_`-prefixed so either is self-identifying out of context. `root_cause` left untouched (Sakshi was
fine with it; it was already the clearest of the three). Combined with a full logical reorder of the
Golden Dataset sheet's 20 columns (Identity → Input → Test target incl. `severity` moved next to
`expected_value` → Grading → Tags → Documentation → Results) since adding a column made this the
right moment, low-stakes before any real eval run. Every Summary-sheet formula, the case-detail
table, and its conditional formatting rebuilt against the new column letters; Legend and Failure
Categories sheets updated to match, stale duplicate rows removed. Full smoke test performed exactly
as requested — set 7 PASS/FAIL values, hand-verified all 8 affected Summary numbers (catching an
arithmetic slip in the hand-check itself, not the sheet), then reverted.

**Two real bugs found and fixed while doing this** (both written up in `learnings.md`): LibreOffice's
`recalc.py` resave silently converts literal boolean cells into `=TRUE()`/`=FALSE()` formula text
(cosmetic — cached value still correct); and a genuine bug in the verification script itself —
`openpyxl`'s `ws.cell(row, col, value=None)` silently no-ops instead of clearing a cell, which let a
"reverted" smoke test leave stale `PASS`/`FAIL` values in place undetected until a manual re-check
caught it. Fixed with direct `.value = None` attribute assignment.

### 5. Column rename + overflow fix — D-160
`actual_prompt-*` → `actual_output-*` (the column holds the model's *output*, not the prompt used) /
`pass_fail_prompt-*` → `pass_fail_output-*`, across the Golden Dataset header, Summary case-detail
headers, and Legend. `wrap_text=True` added to `grading_rationale`/`why_this_test_exists`, row
heights recomputed per-row from actual content length (75–255pt) instead of the stray, inconsistent
values that were there before.

### Decisions
- **D-158** — 12 happy-path rows (GC-004–015) added, sourced from real DB jobs; 2 flagged unconfirmed.
- **D-159** — `input_pattern` two-tier family/specific naming (`ip_`-prefixed) + full Golden Dataset
  column reorg into logical groups. Verified via full smoke test, `recalc.py` clean (727 formulas).
- **D-160** — `actual_prompt-*`→`actual_output-*` rename; wrap-text/row-height overflow fix.
- (D-154, logged mid-session before this wrap: prompt-version column naming convention
  `<slug>_<CLASSIFIER_VERSION>_<PROMPT_VERSION>`.)

### Next steps
1. Get Sakshi's explicit sign-off on GC-006 (`is_ai` borderline) and GC-012 (`technical_depth`
   borderline) before trusting them as confirmed happy-path baselines rather than flagged edge cases.
2. Once Tier 1 is confirmed, consider Tier 2 happy-path rows (`salary_status`,
   `years_experience_min/max`).
3. D-71/D-149's golden eval harness (`tests/golden/fixtures.ts` + `run.ts`) still doesn't exist — the
   golden set, now much better organized, still can't actually run yet. This is the same gap carried
   over from Sessions 33–35.
4. Carried over, untouched again this session: D-149's actual implementation, the
   `.claude/worktrees/sad-booth-957bb2/` question, `lib/discovery/apify.ts:65`'s stale comment, the 3
   inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi), the confusion-matrix follow-up on the
   Summary sheet.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

---

## Session 37 — 2026-08-14, evening (D-110's dashboard built for real; the public read surface turned out never to have worked)

### What happened this session

**The Next.js app exists.** `app/` is now a real Next.js 16 app reading Supabase directly from the
browser via the anon key — D-110's shape, unchanged, no server layer and no API routes. It is a
*port* of `dashboard-live.html`, not a redesign from it (D-156's instruction): same two tabs, same
filter groups, same defaults (every verdict on; Remote + Not checked on, On-site off; "Right for me"
on, Stretch/Senior off; every Industry chip on; the three exclusions off), same wording, same
"absent is not negative" rules. Built, typechecked, production-built and driven in a real browser
against live data: 5 junior-titled jobs across 4 companies, 29 tracked remote companies, detail pane,
explain modals, Escape-to-close, and every filter group verified to produce the counts the snapshot
produces.

**Two things got exactly one home each, and that was the main design work.** The snapshot generator's
own header already claimed the styling had "exactly one home" — copying the CSS into the app would
have quietly made that false. So the stylesheet was extracted out of `dashboard-mock.html` into
`styles/dashboard.css`, which the mock now `<link>`s, the snapshot inlines at build time, and the app
imports. The same move for presentation logic: `lib/dashboardFormat.ts` holds verdict labels, salary
formatting, `daysAgo`, blockers, and the remote/experience buckets, and **returns data, never
markup** — a helper returning HTML would only have been usable by the snapshot, which is exactly how
the drift starts. `scripts/build-dashboard.ts` was refactored onto both and re-run; the regenerated
snapshot differs only in timestamps, day counts, `remote_type=other` → `not_remote` (D-150 — the
committed snapshot predated it) and the CSS comment move. **No structural change, which is the
evidence the refactor preserved behaviour.**

**The find of the session: `v_jobs_public` had never returned a row to `anon`.** The app's very first
load rendered `Could not load from Supabase — v_jobs_public: permission denied for table jobs`. The
public read surface D-157 built, granted and "verified" the night before was unusable by the only
role it exists for. Cause: `security_invoker = true` runs the view body with the *caller's*
privileges, and the body ends `where j.dropped_reason is null and j.canonical_job_id is null` —
`dropped_reason` had been excluded from anon's column grants as "internal, not needed by the UI",
which is true of the *output* and false of the *filter*. D-157's verification checked the privilege
*listing* and confirmed the right columns were absent; it never issued a read as anon, so it proved a
claim about what's missing rather than about what works. Fixed by `0016` (one column grant,
disclosing nothing — the row policy already restricts anon to rows where that column is NULL), and
this time verified **by querying as anon**: `v_jobs_public` returns zero recruiter keys;
`jobs?select=recruiter_email`, `jobs?select=hiring_manager` and `job_enrichments?select=raw_output`
all return 401/`42501`; `POST /rest/v1/jobs` returns 401. Security advisors clean — no ERROR, no
WARN, only the intended INFO-level default-deny notices. → **D-161**, amending D-157.

**Two content changes flagged rather than made silently.** The Remote Companies PII banner said the
file "should NOT be shared without redacting it first" — on a public URL that instruction is simply
false, since the page *is* shared. Reworded to state what the tab holds, where the data came from
(public job postings) and that it is publicly reachable. It still only warns the viewer, which is
what D-156 already flagged as insufficient. Separately, the snapshot's "no description stored"
fallback was markup run through `esc()` and rendered a literal `<em>` on screen — fixed in both
renderers.

**Whole tree committed and pushed.** Sakshi chose committing everything over a minimal deploy-only
commit, on the argument that the tree Vercel builds should be the tree that typechecks locally; a
partial commit would have built new app code against HEAD's older `lib/`. Two commits pushed to
`github.com/zenarcha/job-scout`.

**A parallel session took D-158–D-160 mid-flight.** The golden-dataset xlsx work logged three
decisions while this one was running, so this session's entries were renumbered to D-161/D-162 after
re-grepping the file. Commit `c3870fd`'s message still cites the old numbers; `decisions.md` is
correct and a follow-up commit records the discrepancy.

### Decisions this session
- **D-161** — AMENDS D-157: `v_jobs_public` was unreadable by `anon`; `0016` grants SELECT on the one
  load-bearing column. Rejected: dropping the view's `WHERE` (changes what service-role sees) and
  reverting to definer mode (contradicts D-145, the option D-157 already rejected).
- **D-162** — the dashboard is built; one stylesheet + one formatting module + three renderers; the
  PII banner reworded for a public URL; the filtered-away detail pane stays closed on purpose.
- Pointer added to **D-157** marking it amended.

### Built this session
- `app/` — `layout.tsx`, `page.tsx`, and `components/{JobCard,JobDetail,CompanyCard,FilterChip}.tsx`.
- `lib/supabaseBrowser.ts` (anon client + typed fetch, reads `v_jobs_public` **never**
  `v_jobs_enriched`), `lib/dashboardFormat.ts`, `styles/dashboard.css`, `next.config.mjs`.
- `supabase/migrations/0016_v_jobs_public_dropped_reason_grant.sql` — applied, verified as anon.
- `.env.example` + `.env.local` gain the two `NEXT_PUBLIC_*` vars; README gains a Dashboard section;
  `.claude/launch.json` for the dev server; `*.tsbuildinfo` and `.claude/worktrees/` gitignored.

### Next steps
1. **Deploy (Sakshi's step, nothing else blocks it).** Import `github.com/zenarcha/job-scout` at
   vercel.com and set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in project
   settings. Claude cannot do the OAuth login.
2. **Decide the "Hiring now" contrast bug.** `#004440` on `--secondary-c` (`#00504c` in dark mode) is
   dark-on-dark and effectively unreadable. Predates this session (D-144's styling), left alone rather
   than restyling a decided element — but it now ships on a public page. One-line fix.
3. **Consider stripping recruiter keys from `raw_output` before storing** rather than only defending
   at the grant layer — carried from Session 35, still untouched.
4. **README's "Live environment" section is stale** — it names project `cdjgxrmeoqiogylveagr`, not the
   canonical `gwvrpdkiblozwdwoqsgd`, and describes a migration state that no longer exists.
5. **Pre-existing `npm audit` finding:** `undici` 7.28.0 (high) reaches the tree via `cheerio`, not via
   anything added this session. Unfixed; `npm audit fix` would bump `cheerio`.
6. **Still carried over, untouched:** D-149's implementation, the stale comment at
   `lib/discovery/apify.ts:65`, the 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi),
   and D-71/D-149's golden eval harness (`tests/golden/fixtures.ts` + `run.ts`) — still not built,
   still blocking D-153's baseline run. D-150's rename and the stray worktree are both **done**; the
   worktree directory is empty and is now gitignored.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 38 — 2026-08-14, night (`why_this_test_exists` rewritten in plain language; a stale cross-reference and a real Summary-sheet formula bug both found)

### What happened this session

**Started as a plain-language question, then became a real edit.** Sakshi first asked why the
golden-dataset's `severity` column exists and what false-negative/false-positive mean there — answered
in plain language with real examples from the sheet (GC-002/GC-011). She then asked for the actual
`why_this_test_exists` column values themselves to be rewritten in plain language, keeping every
specific detail (decision IDs, session numbers, company/field specifics, named mechanisms).

**A real data bug surfaced mid-rewrite — D-163.** GC-005's note cited GC-007 as its
"geo_explicit=false, silent posting" contrast case; GC-007 is actually a `technical_depth` row. The
real contrast case is GC-014. Flagged via `AskUserQuestion` rather than silently fixed or silently
carried forward. Sakshi's answer widened the task to "check all fields in the sheet for accuracy" — a
full audit followed: every row's `severity` tag cross-checked against how `remote_type`/`is_ai`/
`technical_depth`/`is_technical` actually drive (or, for `is_technical`, deliberately don't drive per
D-63) `lib/enrich/recommend.ts`'s priority logic and `lib/enrich/geoRecheck.ts`'s fail-open trigger,
plus every cited decision ID checked against this log. Severity tags held up; `is_technical`'s tag was
flagged as weakly grounded (not wrong, just not tied to an actual code consequence) but left unchanged.

**All 15 rows (GC-001–GC-015) rewritten**, GC-005's reference corrected to GC-014, no other column
touched (`severity`, `expected_value`, `grading_rationale`, tag columns, and all other sheets left
byte-identical) — **D-163**.

**A second, unrelated real bug found while verifying, not fixed.** Confirming no `Summary` sheet
formula reads column P on purpose turned up that the "Case-level detail" table (rows 41+) is off by
one column against its own headers — e.g. the column headed "output (baseline_v4_prompt-2026-08-13)"
actually reads `'Golden Dataset'!P2` (`why_this_test_exists`), not `Q2` (the real
`actual_output-baseline...` column). Predates this session (built under D-152, restructured under
D-159); was invisible while column P held short text, now more likely to be noticed once a real eval
run fills in actual outputs and the "output" column visibly shows prose instead. Logged in D-163 and
as a technical learning in `learnings.md` — not fixed, out of this task's scope.

### Decisions/amendments made
- **D-163** — `why_this_test_exists` rewritten in plain language for all 15 rows; GC-005→GC-014
  reference fixed; full severity/citation audit performed and found sound (one soft finding on
  `is_technical`, not changed); Summary sheet's case-detail table off-by-one bug found and flagged, not
  fixed.

### Next steps
1. **Fix the Summary sheet's case-detail table off-by-one column bug** (D-163) — columns D–G in the
   "Case-level detail" table (rows 41+) need to shift one column right to actually match their own
   headers (`Q`/`R`/`S`/`T` instead of `P`/`Q`/`R`/`S`).
2. Get Sakshi's explicit sign-off on GC-006 (`is_ai` borderline) and GC-012 (`technical_depth`
   borderline) — still open from Session 36.
3. D-71/D-149's golden eval harness (`tests/golden/fixtures.ts` + `run.ts`) still doesn't exist — the
   golden set still can't actually run. Carried over from Sessions 33–37.
4. Consider whether `is_technical`'s severity convention (flagged this session, not changed) should be
   revisited now that it's known the field carries no scoring weight per D-63.
5. Still carried over, untouched: D-149's actual implementation, the stale comment at
   `lib/discovery/apify.ts:65`, the 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi).

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*

## Session 39 — 2026-08-14, evening (the dashboard deployed to Vercel; the read path proven in production, the env-var plumbing still outstanding)

### What happened this session

**Two pre-deploy defects fixed.** The "Hiring now" tag — flagged by D-162 as a known defect and
deliberately left alone — was fixed now that the page ships publicly: `.tag.hiring` paired a *themed*
background with a *hardcoded* `#004440` foreground, which in dark mode is `#004440` on `#00504c`,
roughly **1.1:1** contrast and effectively invisible across all 29 company cards. Replaced with
`var(--secondary)`, the pairing `.tag.ind` and `.chip.ind` already use in the same stylesheet — not a
new colour choice, but the tag finally following a convention the file already had. Measured in a real
browser against live data: **5.5:1 dark, 5.7:1 light**, both clear WCAG AA. `dashboard-live.html` was
regenerated in the same change because it *inlines* the stylesheet at build time; a CSS-only edit would
have left the snapshot carrying the old colour, reintroducing exactly the drift D-162's single-stylesheet
design exists to prevent. The regenerated diff is six lines — the rule, a timestamp, three day counts.
Separately, README's "Live environment" section named the wrong Supabase project
(`cdjgxrmeoqiogylveagr`) and claimed the schema still needed applying; now names the canonical
`gwvrpdkiblozwdwoqsgd` and records `0001`–`0016` as applied. → **D-165**, amending D-144.

**Sakshi deployed to Vercel; the site returned the missing-env-vars error.** `job-scout-gules.vercel.app`
built and served, but rendered "Could not load from Supabase — Missing NEXT_PUBLIC_SUPABASE_URL /
NEXT_PUBLIC_SUPABASE_ANON_KEY" *after* both variables had been set in Vercel's settings. Diagnosed from
`lib/supabaseBrowser.ts:15-18`, whose own comment states it: those lookups are substituted **at build
time**, so the values are compiled into the shipped bundle and never read at page-visit time. The live
deployment was built from `31b0bd9`, before the variables existed — its bundle literally contained
`undefined`, and the guard on line 23 correctly threw. **Adding variables afterwards cannot alter an
already-compiled bundle; the fix is a rebuild, not a settings change.**

**The diagnosis was confirmed, not assumed.** Rather than trust the reasoning, the served CSS was
inspected for the *other* pending change — the contrast fix. It still computed to `rgb(0,68,64)`
(`#004440`), proving the live site was an old build and that no rebuild had occurred. That one check
distinguished "wrong settings" from "no rebuild yet" in a single step.

**The database side was proven independently of Vercel.** The `anon` read path was exercised directly
against live Supabase with the anon key, removing Vercel from the picture entirely: `v_jobs_public`
returned **52 rows**, `remote_companies` **29 rows**, and both `jobs.recruiter_email` and
`job_enrichments.raw_output` refused with `42501`. So D-161's fix works in production and the PII grants
hold — **the only outstanding variable is Vercel's build-time env substitution.** This follows the
D-161 lesson directly: exercise the thing, don't inspect the property.

**Everything committed and pushed as `bda59ef`.** Per Sakshi's call, one commit carrying this session's
fixes plus the previously-uncommitted golden-dataset work from the parallel sessions (D-163, D-164).

**A parallel session took D-164 mid-flight, again.** D-164 appeared in `decisions.md` between reading
the file and writing to it. Caught by re-grepping before numbering rather than trusting the earlier
read — this session's entry became **D-165**. File mtimes were checked (last write ~1.5 hours prior)
to confirm that session had finished before sweeping its work into the commit.

### Decisions this session
- **D-165** — AMENDS D-144: the "Hiring now" tag's hardcoded `#004440` replaced with
  `var(--secondary)`. Rejected: a different hardcoded colour (one literal cannot serve two inverted
  palettes — that *is* the bug), a dedicated `--hiring-t` token in all four `:root` blocks
  (unnecessary indirection; `--secondary` already means "readable foreground for `--secondary-c`"),
  and deferring again (D-162 already deferred it once; the page is now public).
- Pointer added to **D-144** marking it amended.

### Next steps
1. **Confirm the deploy renders.** A rebuild from `bda59ef` was pushed; if the missing-vars error
   persists after it lands, the cause is the **Production** scope checkbox on the two Vercel
   variables (Vercel scopes Production / Preview / Development independently). Fix it and redeploy
   **without** build cache — a cached build can reuse the old compiled bundle. Then verify: 5 jobs /
   4 companies / 29 remote companies, `.tag.hiring` computing to `rgb(93,217,208)` on `rgb(0,80,76)`
   in dark mode, and no `recruiter_email` / `hiring_manager` / `raw_output` in the Jobs tab payload.
2. **D-164 has no session-summary entry.** The parallel session that fixed the Summary sheet's
   off-by-one wrote to `decisions.md` and `learnings.md` but never to this file — that work has a
   decision with no narrative. Capture it before the trail goes cold.
3. **Consider stripping recruiter keys from `raw_output` before storing** rather than only defending
   at the grant layer — carried from Session 35, still untouched, and now the data is behind a
   public URL.
4. **Pre-existing `npm audit` high on `undici`** via `cheerio`. Unfixed; not introduced by recent work.
5. Still carried over, untouched: D-149's implementation, the stale comment at
   `lib/discovery/apify.ts:65`, the 3 inconclusive "Remote OK" cases (Pocket FM, EOK Gems, Netomi),
   D-71/D-149's golden eval harness (`tests/golden/fixtures.ts` + `run.ts`) still blocking D-153, and
   Sakshi's sign-off on GC-006 / GC-012.

*Before starting next session: read the decision log and this summary entry fresh — don't trust a
memory snapshot of what was decided.*
