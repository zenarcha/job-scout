# Backlog — Remote Job Tracker → Application OS

Architecture is **frozen** (see D-28). Non-essential ideas land here instead of changing the design.
Promote an item only when evidence from real usage justifies it, or it's scheduled by the roadmap.

> **Roadmap rescoped 2026-08-03 (D-37–D-43, `WORKSPACE.md` D-7).** v1 for this module is now
> **discovery + extraction + tagging only**. Everything below marked *(v2)* was pushed back; the
> post-discovery tracker became its own module and is no longer this module's roadmap.
>
> **See `scope.md` (added 2026-08-04) for the authoritative v1 / v2 / v3 split**, including what was
> explicitly *rejected* rather than deferred. This file remains the place for un-scoped ideas and
> tech debt; `scope.md` is the version pick-from list.

## Scheduled by roadmap (not "someday" — sequenced)
- **(v2)** Qualification stage (structured signals + `opportunity_score`, overridable→locked) +
  deterministic Lane Engine (config rules, single `active_goal`) + time-based `urgency` + views.
  **Deferred per D-37** — no real data exists to calibrate judgment against. Stays inside this module
  when built (`WORKSPACE.md` D-7 retired the separate `recommendation-engine`).
- **(v2)** `recommend` (priority high/med/low) — **removed from the v1 pipeline per D-37**;
  `lib/enrich/recommend.ts` stays on disk, unused. A manual "chance of selection" field covers the
  need in v1.
- **(v2)** `resume_match` — deferred *and* redesigned per D-38: on-demand rather than a pipeline
  stage, scored against the master résumé. Drops `resume_versions` / `resume_version_id` from this
  module in the meantime.
- **P3** Chrome Extension ingestion source (AI-free, POSTs `RawPosting`) + manual import; wire the
  `inbox` status + `enrichPending` skip for inbox jobs. **Now also carries conversation capture**
  (click-to-save on a manual text selection, D-43) — though that half belongs to the tracker module.
- **P4** ~~Analyze Resume Builder + Startup Outreach codebases → design & create `application_assets`~~
  — **superseded.** Application assets are the post-discovery tracker's concern
  (`WORKSPACE.md` D-7), and "Startup Outreach" is the separate, pre-existing funded-company project,
  not a source to extract from.
- **P5** ~~Rename to Application OS~~ — **superseded** by the `job-tracker` → `job-scout` rename
  (`WORKSPACE.md` D-7). "Application OS" is the workspace name, not this module's.

## Candidate improvements (need evidence before adopting)
- **Multiple weighted goals** in the Lane Engine (only if one active goal proves too limiting). — D-25
- **`hiring_probability` / `company_quality` / `startup_stage`** as additional qualification signals.
- **Source-level outcome analytics** (interview rate by source) once real applications accrue. — D-22
- **Promote hot JSON fields to first-class columns** — decide from the verification report's data-
  quality findings (which `parsed`/`signals` keys are queried/filtered most).
- **External salary dataset** to enrich `salary_status=unknown` roles (still never LLM-estimated). — D-12
- **Semantic search** (pgvector + free Gemini embeddings) — "find jobs like this / like my experience."
- **Referral CRM** — only if lightweight `job_tracking` referral fields prove insufficient.
- **RLS + dashboard auth hardening** at dashboard build (Phase 7).
- **Skill-gap → portfolio action step.** Surfaced 2026-08-04 in user-research (see `user-research.md`
  Block 1/12): beyond just *identifying* a skill gap between a JD and her résumé, Sakshi wants the
  system to prompt her to close it — e.g. build a portfolio piece that demonstrates the missing skill,
  then feed it back into her résumé/portfolio. `scope.md`'s v2 "skill-gap analytics" item covers
  detection only; the action step is new and unscoped. Brand new idea, not yet evidenced by real usage.
- **ATS polling** (Greenhouse/Lever/Ashby direct feeds, was "Phase 4") — de-scoped from committed
  roadmap 2026-08-01. The watchlist companies are already covered via Apify's (now title-filtered)
  company-search tasks; ATS polling would only improve copy quality/freshness and reduce reliance on
  aggregator scraping, not add coverage. Promote only if LinkedIn copies for companies on the (now
  evidence-gated, currently empty) watchlist prove genuinely stale or low-quality in practice.
- **Watchlist management UI** — deferred; additions are rare and evidence-driven (D-32), so a CRUD
  page isn't worth building yet. Revisit if adding companies becomes frequent enough to be friction.
- **Additional discovery sources beyond LinkedIn — decided against for now (D-34, 2026-08-02).**
  RemoteOK was the leading candidate (public JSON API, lowest effort/risk) but Sakshi manually searched
  it and found zero India-remote Associate Product Manager listings — real-world fit beat the
  theoretical cost/risk comparison. Staying LinkedIn-only. Wellfound/We Work Remotely/Built In
  Remote/Rocket.jobs were discussed but not investigated further; revisit only if LinkedIn-only coverage
  proves insufficient against the manual benchmark list (see `session-summary.md` Session 5).

## Open questions from the 2026-08-03 rescope (raised, deliberately not decided)
- **Status model for the tracker.** Recommended splitting Sakshi's single Notion status list into
  **Stage** (Interested/Applied/Interviewing/Offer/Closed) + **Waiting on** (Me/Company/Referrer/
  Nobody), because her own board proves one list cannot hold both — the Purplle row is simultaneously
  `Applied: May 1` *and* `Status: Referral Pending`. Her list is also missing Interviewing and Offer.
  **Not confirmed.**
- ~~**`avoid_company` and `domain_interest`**~~ — **resolved 2026-08-04 (D-48, `scope.md`):** kept
  for **v2/v3 as filters**, not dropped. Still read by zero code in v1.
- **`dream_company` → `company_watchlist`** — agreed in principle (it is per-company, not per-job as
  currently modelled on `job_tracking`), but the migration is not written. **Sequenced 2026-08-04:**
  travels with **v2 weighting**, not v1 — Sakshi flags dream companies *in order to* weight them
  (D-52), so the field has no v1 consumer. See `scope.md`.
- **Where `resume_version_used` lives.** Needed by the learning loop ("which résumé gets interviews"),
  which straddles job-scout, the tracker, and resume-builder. The one field that does not land cleanly
  on either side of the D-42 split.
- **The tracker module's name.** "Referral tracker" undersells the scope now that it covers
  applications, interviews, and offers; `application-tracker` proposed to match `WORKSPACE.md`'s
  existing "Application" concept. Undecided.
- **Whether a `tasks.md` is wanted** for this project or across ApplicationOS modules — carried from
  Session 5, still open.
- **Notify channel (Telegram, D-58/D-59) doesn't match Sakshi's real attention.** Raised 2026-08-04
  user-research (`user-research.md` Block 12): she checks WhatsApp, not Telegram. Checked, not
  assumed: WhatsApp's official Cloud API has no subscription fee, but business-initiated messages
  (what a notification bot sends) are billed per conversation/category with no monthly free
  allotment — conflicts with the D-5 $0 constraint, so it isn't a drop-in swap. **Not decided** —
  needs a real choice between accepting Telegram's attention-fit gap, finding another $0 channel, or
  revisiting the constraint itself, logged properly once chosen.
- **Workspace module split (`WORKSPACE.md` D-1) may not fit how Sakshi actually builds — proposed,
  not decided.** Raised 2026-08-04 user-research (`user-research.md` Block 12): "I'm really not
  building one module at a time," which directly contradicts D-1's stated premise ("built in parallel
  isolated Claude sessions"). D-1 itself pre-approved this exact reversal ("reversible to a monorepo
  via subtree-merge if the workflow assumptions change") and names the precise trigger ("one dev
  routinely edits many modules at once") — now met. Claude's recommendation: collapse the
  *infrastructure* separation (one repo, likely one Supabase project) while keeping the *conceptual*
  module boundaries (resume-builder / job-scout / tracker as named packages) for the "clear story to
  tell" reason from Block 7. job-scout and the tracker are cheap/free to fold in (no commits /
  doesn't exist yet); resume-builder (live repo + Vercel deploy) is the real migration cost and was
  **not independently inspected this session** — verify against the actual repo before committing.
  **Status: recommended, awaiting Sakshi's explicit go-ahead** — flagged against D-1 in
  `WORKSPACE.md`, not yet executed or logged as a settled decision there.
  **Resolved 2026-08-04 — logged as `WORKSPACE.md` D-9.** Direction decided (collapse to a
  monorepo); resume-builder's real repo has now been inspected (no code-level blockers found, one
  real risk: preserve the existing Vercel project/URL, quoted in her recruiter-facing case-study
  docs). Execution is still open — a dedicated migration session, checklist in `plans.md`.
- **Stage count / module boundaries were Claude's proposal, not Sakshi's decision.** Raised by Sakshi
  herself 2026-08-04 during user-research (see `user-research.md` Block 8): "initially there were 5
  stages and the modules Claude decided." She's mid-way through a self-initiated "schema recheck and
  product re-check" of the current 3-stage model (`classify → skills → salary`, D-37, frozen by D-28).
  Deliberately **not resolved in the user-research session** — re-deriving stage count/module
  boundaries is implementation work and doing it inside that session would repeat the same pattern
  (Claude deciding structure she didn't ask for). Needs a dedicated session, working forward from
  actual v1 need rather than from what's already built, with the outcome logged properly in
  `decisions.md`.

## Known follow-ups / tech debt
- **Capture the real LinkedIn search URLs** — **four titles, not five** (D-102, 2026-08-06): Associate
  Product Manager · Product Associate · Junior Product Manager · Product Manager I. The broad
  "Product Manager" search is company discovery (D-35) and waits for the `remote_companies` catalog.
  **`APIFY_TOKEN` is now set** (verified 2026-08-06, Session 16) — that half is done. **The URLs are
  still the blocker.** Three capture attempts so far: attempt 1 had "remote"/"past week" typed into the
  *keyword* box as words (LinkedIn matches those as text, including against the JD body); attempts 2
  and 3 fixed the keywords and carry the date filter, but the **Remote filter is missing from all
  four** and **location is present on only one**. All four also carry an undecided salary-band filter —
  see D-103. D-100 pinned a URL-driven actor,
  and `apify/task-config.md` §2 is marked unreviewed until real URLs are pasted in. Hand-built URLs
  redirect to an authwall, so a wrong filter parameter reads as "no results today" rather than an
  error — they must be copied from the address bar after filtering in LinkedIn's UI.
- [x] ~~**Sign off the enrichment retry cap**~~ — **resolved 2026-08-06 (D-101), and BUILT
  2026-08-06 (Session 16).** Cap is 5, plus a `v_enrich_parked` view, automatic re-eligibility after a
  24h cooling-off, and `npm run enrich -- --parked` as the on-demand retry. Sakshi's question exposed
  that the shipped design had *no recovery path at all* — a job at the cap could never come back,
  because the counter only resets on a clean run that could never happen. Shipped in
  `0003_parking_and_classify_fields.sql` and verified live against an isolated throwaway job: parked
  inside the window, parked *and* pending past 24h, released entirely by a clean run.
- **Outage-aware retry counting** — the circuit-breaker idea: don't charge a failure to a job when
  every job in the run failed the same stage. **Rejected for now on scale grounds (D-101), not
  complexity:** at 1–2 jobs/day "every job failed" is usually "the one job failed", indistinguishable
  from a single broken posting. Revisit only if volume makes the detection trustworthy.
- Verify Apify actor field mappings against a real run — now specifically against
  `curious_coder/linkedin-jobs-scraper` (D-100). `lib/discovery/apify.ts:14-47` reads tolerantly
  across key aliases but has only ever seen the local fixture; a silently-null `externalId` drops the
  posting outright (`apify.ts:32`).
- Verify seed watchlist `ats_type`/`ats_slug` guesses before Phase 4 ATS polling.
- Golden-dataset test harness (20–30 JDs) — build alongside Phase 2 so lane/qualification changes are
  regression-tested. **Note `package.json` already declares `test:golden` → `tsx tests/golden/run.ts`,
  and that path does not exist** — the script fails instantly (found Session 16). Either the harness
  was planned and never built or it was removed and the script is stale; worth one `npm test` that
  runs `tests/enrich.test.ts` and `tests/discovery.test.ts` either way. Doubles as the coverage benchmark discussed 2026-08-02 (see D-30-adjacent
  discovery-evaluation discussion in `session-summary.md` Session 5).
- **Persist `IngestSummary` run counters** (`received/inserted/duplicates/droppedNonRemote/skippedRun`,
  computed in `services/discovery/ingest.ts` but only `console.log`'d in `scripts/run-ingest.ts`) to a
  run-log table — near-zero-cost way to get duplicate rate / drop rate per run once discovery is live.
- **No relevance filter for employment type** — nothing in code excludes contract/internship postings;
  filtering currently depends entirely on the Apify actor's title whitelist (`apify/task-config.md`)
  doing so incidentally. Worth a manual spot-check of real output before deciding if a filter is needed.
- **No crawl-failure/reliability tracking** — only a bare `StageFailed` event on catch
  (`services/discovery/webhook.ts`); no aggregation of run success/failure rate, no retry visibility.
- **No staleness / closed-job detection** — nothing re-checks a discovered job's `applyUrl` after
  ingestion, so "how long do stale jobs remain" / "are closed jobs removed" are currently unanswerable
  by construction, not just unmeasured. Matches the unbuilt "Freshness & linkcheck" phase in `plans.md`.
- **JD-to-resume module produces fabricated experience — self-reported, not yet grep-verified.**
  Sakshi says (2026-08-04 user-research, `user-research.md` Block 3) the already-built JD-to-resume
  builder still does what she originally built it to prevent: inventing experience she doesn't have
  (named example: fabricating UAT experience because UAT appeared in a JD) when asked to adapt her
  résumé to a job description. Unlike the "Verified defects" list below, this has not been independently
  confirmed against the code in this session — needs a grep/read pass on the relevant module before
  it's treated as a confirmed defect.

## Verified defects — Session 9 (2026-08-04, every claim grep-confirmed)

- **`v_jobs_enriched` never projects `remote_type`.** `lib/enrich/classify.ts:28` writes it to a real
  column (`0001_schema.sql:95`), but neither view definition selects it (`0001:232`, `0002:55`). So
  `lib/enrich/recommend.ts:25` receives `undefined`, and the "Remote-India" chip at
  `lib/telegram.ts:39` **can never render**. The single most important classification in the product is
  dropped between its writer and every reader. Fix: add `c.remote_type` to both view definitions.
  *Root cause worth noting: the view is the contract between writers and readers, and nothing verifies
  the two sides agree.*
- **`company_watchlist` has no loader.** `seed/company_watchlist.json` is `{"companies": []}` and is
  referenced by zero code. Its only reader (`lib/enrich/recommend.ts:12-16`) therefore always takes the
  `?? 3` default. Inert in v1 by decision (D-74), but the absent loader is a separate gap.
- **`ai_usage` has no foreign key to `job_enrichments`.** It carries `job_id` + `stage` only, while
  enrichment rows supersede — so multiple rows exist per (job, stage) over time and token counts cannot
  be attributed to a specific attempt. This is the concrete defect behind D-51's note. Fix is one
  column: `enrichment_id uuid references job_enrichments(id)`.
- **`est_cost_usd` is permanently `0`** — the `RATE` table is all zeros (`lib/events.ts:35-39`) because
  everything runs on free tiers. Token counts are the real signal; the cost columns are placeholders
  for a future paid tier.
- **`locked_fields` has never executed.** `services/discovery/ingest.ts:92` creates `job_tracking` rows
  with `{job_id}` only, so it stays at its `'{}'` default and the carry-over loop at
  `lib/enrich/writeEnrichment.ts:40-44` has never run a single iteration. D-37 kept this mechanism
  explicitly, describing it as the guard against a prompt-tuning re-run wiping manual corrections — it
  has never guarded anything.
- **Three `package.json` scripts point at files that do not exist:** `test:golden` →
  `tests/golden/run.ts`, `ats:poll` → `scripts/run-ats-poll.ts`, `linkcheck` →
  `scripts/run-linkcheck.ts` (`package.json:16-18`).
- **Nine schema objects have zero readers and zero writers:** `decisions`, `status_history`,
  `rollup_company`, `rollup_skills`, `rollup_funnel`, `app_config`, `v_company_rollup`, `v_skill_gap`,
  `v_ai_cost`. One question covers all of them — does `0003` drop them or keep them as placeholders?
  Two have an obvious prior: `decisions` duplicates `decisions.md`, and `status_history` belongs with
  `job_tracking` in the tracker module (D-42).
- **Only `tests/enrich.test.ts` exists and it covers `parseSalary` alone** — no test touches classify,
  skills, recommend, confidence, or the notify path.

## Verified defects — Session 13 (2026-08-06, found by the first live end-to-end run)

Both were invisible to code review and surfaced only by running the pipeline against a real database.
Logged as decisions because the fix is a design call, not a patch. **Both blocked the dashboard**
(D-89/D-93) — they corrupted the data it would display, so they landed first.

**Both fixed and verified live in Session 14 (2026-08-06)** — D-98 and D-99 are now resolved; see
`supabase/migrations/0002_canonical_read_path.sql` and `lib/enrich/pipeline.ts`. The dashboard is no
longer blocked on either. D-99 was verified by *reproducing* the original Gemini outage and watching
the job self-heal, not by inspection.

- [x] **D-98 — `v_jobs_enriched` double-lists deduped jobs.** The view filters only
  `dropped_reason is null`; it never filters `canonical_job_id is null` the way `v_company_rollup`
  correctly does. Cross-source dedup itself works — the fixture's near-duplicate pair (`ln-1001` /
  `gh-2001`, same Acme AI role, titles differing by one comma) was grouped correctly. **The deeper
  problem:** each duplicate is enriched *separately*, burning its own AI quota and producing a
  different verdict for one job — measured: `technical_depth` 3 vs 4, `institute_requirement`
  preferred vs none, skills 4 vs 2, **`priority` med vs low**. Filtering the view alone hides the
  symptom and leaves the waste and the contradiction. Options: filter the view / skip enrichment for
  non-canonical rows / enrich canonical only and have duplicates inherit — the last touches
  supersede-never-overwrite (D-6/D-9). Undecided.
- [x] **D-99 — `enrichPending` marks jobs complete when only the non-AI stages succeeded.**
  `lib/enrich/pipeline.ts:45-52` checks for an active `recommend` row, but `recommend` is a
  deterministic in-code rule that succeeds regardless of whether `classify`/`skills` failed. During the
  Gemini outage both jobs were recorded complete holding *no classification*; `npm run enrich -- --all`
  reported `processed: 0` and every retry was a silent no-op. Recovery needed each job id by hand. The
  obvious fix ("require a row for every stage") is wrong as stated — `geo_recheck` runs only
  conditionally (D-75) — so the correct predicate needs deciding.

**Also confirmed working by the same run** (so these can stop being treated as unknowns): ingest
pre-filter drops non-remote roles *with an auditable reason* (D-72), cross-source dedup groups
duplicates, salary regex and the recommend rule both survive a total AI-provider outage, and
`v_jobs_enriched` now projects `remote_type` — Session 9's long-standing defect, verified fixed in the
live database.

**Newly relevant, not yet scheduled:** RLS is disabled on all 14 tables (Supabase advisor: critical).
**Re-dated 2026-08-06 (Session 15):** the trigger is *not* "once real postings land" — LinkedIn job
postings are not the sensitive asset. `profile` is (D-46/D-78), and it is currently empty. The real
deadline is whichever comes first: seeding `profile` with her résumé data, or any client-side database
access from a deployed dashboard. A server-rendered dashboard would not create the second trigger; a
static page reading Supabase from the browser would. Ties to D-95's open security question.

## Verified defects — Session 18 (2026-08-07, found by the first real discovery→ingest→enrich run)

All four were invisible to typechecking, code review and fixtures. Fixtures confirm the code does
what it says; they say nothing about whether the outside world agrees.

- [x] **`recruiterName` / `recruiterLinkedin` never resolved.** `mapApifyItem` looked for
  `recruiterName`/`posterName`/`hiringPerson`; `curious_coder` emits **`jobPosterName`** and
  **`jobPosterProfileUrl`**. The field had been `undefined` for every posting ever ingested and
  nothing failed — `pick()` returns `undefined` just as readily for a wrong guess as for a genuinely
  absent field. Fixed (`lib/discovery/apify.ts`); 4 recruiters populated where there had been 0.
- [x] **`apply_url` is `''` on all 50 items**, so it is uniformly null regardless of posting type.
  The D-41 comment asserting "a null apply_url means Easy Apply" is now wrong — it means "we didn't
  ask". Corrected in the code comment. `scrapeCompany: true` may populate it at the cost of an extra
  billed request per job; untested, and a cost decision if anyone wants it.
- [x] **notify wrote a permanent delivery guard for messages it never sent** — see D-106. Fixed.
      **Data cleanup still outstanding and needs sign-off** (deletes real rows):
      `delete from job_events where type='NotificationSent' and created_at < '2026-08-07';`
- [x] **Ingest pre-filter drops ~50% wrongly** — see D-104, **RESOLVED 2026-08-07 (Session 19)**.
      `INGEST_REMOTE_FILTER` now defaults to `off`; `classify.remote_type` is the verdict. All 7
      historical drops cleared with `JobUndropped` audit events. A proximity-based regex was built
      first and removed — it still failed the real Amex row.
      **Conditional follow-up (open):** Sakshi's sign-off was conditional on watching `geo_recheck`
      call volume for 3 runs. Not started — needs the first post-fix enrich run.

**The capacity finding, which matters more than any of the above:** the AI free tier allows ~19
successful calls/day ⇒ **~10 jobs enriched/day**, while one $0.05 Apify run delivers 44. See D-105.
Any cadence sized against Apify spend will simply grow a backlog that drains at ten a day.

**Also confirmed working by this run** (so these can stop being unknowns): `received: 50` matched the
dataset exactly, so `mapApifyItem` silently dropped nothing; `role_summary` describes the work rather
than the company blurb on full-length JDs (D-92, tested against a 6.4k-char JD that opens with two
paragraphs of company marketing); years-of-experience extraction distinguishes "5-year roadmaps" from
"minimum five years of experience" and returns `null` — never `0` — when nothing is stated (D-94);
and D-99's completion tracking correctly refused to mark 39 quota-failed jobs complete, returning
them to `v_enrich_pending`.

## Session 19 additions (2026-08-07)

- [x] **429 retry storm** — see D-107. `pRetry` treated 429 like a transient 5xx (800ms), turning 88
      needed requests into ~400. Fixed: process-wide call gate + a real 429 backoff honouring
      `Retry-After`. **Not yet verified against a live run** — quota had not reset. This is the top
      next step.
- [x] **`remote_companies` was an unreviewed placeholder** — see D-109. Columns signed off,
      `last_confirmed_at` added (migration 0004, applied), auto-populated from ingest, backfilled
      with 50 companies.
- [ ] **`remote_companies` dashboard tab** — its own tab (job-scout owns it, D-89) with two filters:
      actively-hiring (derived from `last_confirmed_at`) and watchlist-membership. Requirement
      recorded; nothing built. Blocked behind the dashboard itself.
- [ ] **Apply D-108 in Apify's UI** — separate run per URL, Product Associate dropped, broad
      catalog-only "Product Manager" search added. `apify/task-config.md` is updated but the Task
      config is manual; no code triggers Apify runs.
- [ ] **RLS policies** — unblocked by D-110 (Supabase-direct + tight RLS). The anon key ships in the
      site's source by design, so policies must grant read-only access to the public job surface only;
      application status, referral contacts and notes must be unreachable, not merely un-queried.
- [ ] **Telegram tokens still unconfigured** — so every enriched job currently reaches nobody. Setup
      task, not a decision. This is also the condition that made D-106's bug possible.
