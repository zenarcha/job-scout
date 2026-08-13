# Scope — job-scout (v1 / v2 / v3)

What ships in v1 versus what is deliberately deferred, so each version has a clear pick-from list.
**Every deferred item names the decision that deferred it** — if a line has no decision reference, it
was never actually decided and needs a call before it moves.

> **Module boundary (`WORKSPACE.md` D-7):** job-scout = **discover / extract / tag**. Everything after
> a job is found — application status, referrals, follow-ups, conversation timeline — belongs to the
> separate post-discovery tracker module and is out of scope here at *any* version.

Created 2026-08-04 (Session 8). Updated Session 9. Newest decisions: D-44 → D-75.

---

## v1 — in scope

### Discovery
- LinkedIn only, via Apify. — D-1, D-34
- Title scope: the five entry-level PM naming variants. — D-31
- Role-based **and** company-based search tasks, both title-filtered. — D-33
- Broad "remote PM, any seniority" search feeding the **remote-companies catalog**. — D-35, D-44
- Gmail LinkedIn alert emails used as the **coverage benchmark** (not as a discovery source). — D-40
- Remote/India pre-filter at ingest (regex, pre-AI). — D-3
- Cross-source dedup by source reliability. — D-8

### Extraction / tagging (the AI pipeline)
- `classify` → `skills` → `salary`. Three stages, not five. — D-37
  - `classify` also outputs **`domain`** and **`background_match[]`**. — D-39, D-47
    (both confirmed in v1, Session 9; `domain`'s reader — the `domain_interest` filter — is v2, so it
    is accepted as stored-now-used-later, justified by riding on an existing call)
  - `background_match` is fed by **work history + education** from `profile`. — D-46, D-47
  - **`background_match` is AI selection over a CLOSED vocabulary**, seeded from Sakshi's real Notion
    tags: `Support Company` · `Role Match – Support Work` · `Research Experience` · `HR Tech` ·
    `CPG company`. — D-67
  - Novel matches go to a separate `background_match_suggested` field and **never feed the priority
    rule until Sakshi promotes them**. — D-68
  - `institute_requirement` moves **out of the AI call** to regex. — D-57
  - `salary` is regex parse-only, never estimated. — D-12
- `recommend` ships as a **deterministic rule in code**, not an AI call. — D-53
  **Still unbuilt — `lib/enrich/recommend.ts:18` is an AI call today.**
  - **The rule, stated exactly (D-62):** `high` = background_match + ≥1 other positive signal ·
    `med` = one signal · `low` = none. `technical_depth >= 4` or `iit_iim_required` downgrades one
    level. Salary >15 LPA promotes med→high only.
  - **`is_technical` is NOT a positive signal and is out of the rule** — Sakshi is non-technical and
    seeks non-tech roles. D-53's original input list was wrong here. — D-63
  - `iit_iim_required` downgrades; it never filters. — D-64
  - Unknown salary is **ignored**, never a downgrade. — D-54
  - `recommend_reasons` are generated deterministically from which conditions fired. — D-66
- **Notify `high` + `med` only**; `low` is stored, never sent. — D-65
- `confidence` / `needs_review` are **stored but not acted on**. **No review queue and no review
  agent** — uncertainty shows as a marker on the notification, beside the feedback buttons. — D-70
  (amends D-7; the queue and the `>0.9 auto-apply` tier D-7 described were never built and nothing
  branches on confidence today)
- Versioned enrichment rows; supersede-never-overwrite. — D-6, D-9

### Data
- `profile` holds **structured master-résumé data** (work history, education). — D-46
- `job_feedback` table; `locked_fields` becomes derived from it. — D-48
- `posting_url` + `apply_url` split on `jobs`. — D-41
- `link_status` / `last_checked_at` activated by the **30-day grace, then 30-day re-check** rule. — D-45
- Remote-companies catalog table, separate from `company_watchlist`. — D-44
- `company_watchlist` — v1 role is **only** driving dedicated Apify company tasks. — D-52

### Evaluation
- **Feedback capture**: passive, **per-field**, thumbs up/down + optional free-text correction. — D-49
  - v1 specifically *because it cannot be backfilled* — everything else observability-related can. — D-51
  - **Per-field is required, not preferred** — feedback is also the validation instrument for
    `classify`, and job-level capture cannot attribute a failure to a field. — D-69
- **`classify` validation**: hand-tag 20–30 real JDs, run classify, compare per field. Needed *before*
  the pipeline is trusted; feedback alone would take months at 1–2 jobs/day. `recommend` needs only
  unit tests once it is plain code. — D-71
- **Dropped postings are persisted** with a `dropped_reason` and excluded from `enrichPending()`, so
  the ingest filter is auditable. — D-72
- **`geo_explicit`** distinguishes explicitly-India-eligible from assumed-by-default; the chip reads
  "Remote-India (assumed)". — D-73
- **A second targeted AI pass re-checks geo-eligibility** on assumed rows and may overturn the
  default. Runs only on that subset. — D-75

### Delivery
- Telegram notification, **one per qualifying job**, no instant/digest split. — D-58
- **Telegram is the only delivery surface.** Notion dropped entirely. — D-59
- Idempotent via `NotificationSent` events. — D-16

---

## v2 — deferred, with a named gate

| Item | Why deferred | Decision |
|---|---|---|
| `qualify` stage + Lane Engine | No real data to calibrate judgment against; lane semantics (what A/B/C/D *mean*) were never defined. **Its seven schema columns are dropped in 0003** — re-adding nullable columns later is a catalog-only ALTER, and the columns encode a guess at an undesigned feature | D-24, D-37, **D-60** |
| `resume_match` | Redesigned to **on-demand** against the master résumé, not an automatic stage | D-38 |
| Watchlist **weighting** (`weight`) | Only relevant once dream companies are flagged; the weighting logic itself is undecided | D-52 |
| **`dream_company`** (move from `job_tracking` → `company_watchlist`) | Sakshi flags dream companies *in order to* weight them, so this arrives with weighting, not before it. The per-job→per-company remodelling is still correct and still pending | D-42, D-52 |
| Auto-creating the Apify Task when a company is added | Real added scope for a rare action | D-32, D-35 |
| **Langfuse + tracing** | Solves "what happened across many runs" — there have been **zero** runs | D-51 |
| Skill-gap analytics (% skill frequency over last 100 jobs) | `rollup_skills` already fits the design; **no data is lost by waiting** since per-job `skills` are stored from day one | Session 8 |
| `domain_interest` / `avoid_company` as filters | Read by zero code today; kept for later use as filters | D-42, D-48 |
| Chrome extension ingestion + `inbox` status | — | D-21, D-27 |
| Résumé tailoring against a JD | **resume-builder's** module, not job-scout's. Run a Jobscan/Teal competitive review *before* designing | D-38, `WORKSPACE.md` D-7 |
| RLS + dashboard auth | Deferred to dashboard build | `backlog.md` |

## v3 / unscheduled
- Semantic search (pgvector + free embeddings).
- Source-level outcome analytics (interview rate by source). — D-22
- Additional discovery sources; **Wellfound is next** if LinkedIn coverage proves insufficient. — D-34
- Multiple weighted goals in the Lane Engine. — D-25
- **Feeding `skills` into the `recommend` score.** Extraction ships in v1, but nothing consumes it
  until here — Sakshi's explicit call. — D-82
- **Careers-page checker (replaces the old "ATS polling" line).** Designed and empirically tested in
  Session 12, deliberately **not built** — the watchlist is empty and the pipeline has never run, so
  this would be a third layer on an unproven foundation. — D-87
  - Closes a real blind spot worth stating plainly: **LinkedIn-only discovery cannot see a company that
    stops posting there**, and D-40's Gmail benchmark cannot detect that either — both sides of that
    comparison draw from LinkedIn, so it only catches "LinkedIn had it, we missed it."
  - Order, cheapest first: **(1)** skip recruitment firms via LinkedIn's own "Staffing and Recruiting"
    industry tag; **(2)** where the company runs a known ATS, use its public JSON API — verified that
    Greenhouse exposes a no-auth endpoint, Lever and Ashby equivalents, needing **no new
    infrastructure**, just the plain-`fetch` pattern already used for Apify/Telegram/Gemini;
    **(3)** otherwise fetch the careers page and have AI read it, treating "not found" as a valid
    outcome; **(4)** **no browser rendering** — a fetch failure is flagged "couldn't verify
    automatically" rather than falling back, keeping the one genuinely new dependency out entirely.
  - **What died is per-company manual configuration** (`ats_type`/`ats_slug`, dropped in D-79), not the
    structured-API route — where a company *is* on a known ATS, that path is strictly better than
    AI-reading HTML: cheaper, unambiguous, and immune to the stale-search-index problem.
  - **Do first when picked up:** check how many of her real watchlist companies actually use a known
    ATS, and which — validate against her list rather than assuming market-share research generalizes.
- **Skill-gap → portfolio action step** — from Session 10; `scope.md`'s v2 skill-gap covers detection
  only. Placement still undecided. — `backlog.md`

---

## Explicitly rejected (not deferred — decided against)

| Item | Why | Decision |
|---|---|---|
| External salary lookup (AmbitionBox/Glassdoor) | No official API, second ToS exposure, and a company-average is exactly the estimate D-12 banned | D-55 |
| LinkedIn alumni/recruiter **automation** | No official profile-read API; every route runs inside the logged-in personal account → ban risk. Manual search stays; only bookkeeping is automated | D-56 |
| LLM-as-judge critique pass | Same model class checking its own work; no volume problem to triage at 1–2 jobs/day | D-50 |
| RemoteOK as a second source | Zero India-remote APM listings on a real manual search | D-34 |
| Instant/digest notification split | Solves a volume problem that doesn't exist | D-58 |
| Code-side title-match pre-filter | Filtering belongs at the Apify source; PM titles legitimately contain "Sales"/"Engineering" as scope | D-33 |
| LLM salary estimation | A wrong number erodes trust in the whole tool | D-12 |
| **Notion as a delivery surface** | The tracker module is a purpose-built replacement for what Notion was doing; two systems holding the same records means no authoritative one | D-59 |

---

## Resolved in Session 12 (2026-08-05) — the schema walk is finished

The list below was the blocker on migration `0003`. **There is now no `0003`** — D-86 squashed
everything into a single fresh `supabase/migrations/0001_schema.sql`, written but **not yet applied**.

| Was open | Resolution |
|---|---|
| `ats_type` / `ats_slug` | Dropped — D-79 |
| `jobs.recruiter_linkedin` | Kept as-is; also flows to the tracker module when built — D-87 session |
| `remote_type` suppresses the notification? | **Yes** — D-76 |
| Does `background_match` store *which* tags matched? | Yes, `text[]` — the chip and feedback need them |
| `job_feedback` → `job_id` or `enrichment_id`? | `enrichment_id` only — D-84 |
| Salary: `CHECK`, mixed currencies, third status | All three — D-81 |
| `ai_usage.enrichment_id` | Added — D-85 (the other trace columns stay deferred) |
| Rollup tables vs. views | Both kept, inert; revisit in the v2 analytics conversation |
| `locked_fields` | Deleted; derived from `job_feedback` instead — D-48 built in D-84 |
| `resume_match_score` / `resume_version_id` | Dropped; matching lives in resume-builder — D-80 |
| Restore the `stage` CHECK | Restored, five values (no `resume_match`) — D-80 |
| Never-reviewed tables | Walked. `decisions`/`status_history` → tracker module; `job_events`/`processed_runs`/`ai_usage`/`v_jobs_enriched` confirmed load-bearing and correct; rollups + their views deferred to v2; `v_skill_gap` dropped |
| `job_tracking` "marked decided but isn't" | Genuinely closed — it has no remaining job-scout dependency |

## Still open — needs a call before it can be scoped

- **`remote_companies`' columns.** The one thing in `0001_schema.sql` marked
  `<!-- UNREVIEWED DEFAULT: needs Sakshi sign-off -->`. D-44 decided the table exists but explicitly
  left its name and column list unresolved, and the Session 12 walk did not cover it. Nothing in v1's
  critical path reads it — the broad discovery search that would populate it (D-35) is itself unbuilt.
- **Watchlist's real meaning**: today `weight` only affects an *already-discovered* posting. Whether it
  should also mean "alert me when this company posts its first role" is a different, unbuilt feature.
  — noted in D-52
- **Trace/eval columns beyond `enrichment_id`**: `latency_ms`, retry/attempt, `input_hash`. Storage,
  not tooling — unrecoverable for runs already past, which is the same test that kept feedback in v1
  (D-51), even though D-51 rightly deferred the *tool*.
- **Actor confirmation**: `curious_coder/linkedin-jobs-scraper` was narrowed to on free-tier grounds
  but never explicitly confirmed. — D-30
- **Polling cadence**: still blocked on one real Apify run for real cost numbers. — D-30
- **Tracker module's name**; the Stage + Waiting-on status model. — `backlog.md`
- **Cross-module (different repo):** `resume-builder/candidate_profile.skills` is flat `[string]` and
  should become grouped-by-category to match D-78. Needs its own decision entry and migration there.
