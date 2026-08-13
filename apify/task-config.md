# Apify setup — role & company discovery

Apify runs the scraper on a schedule and calls our webhook when a run finishes. We never run our own
scraping cron; Apify's scheduler is the trigger.

> **This doc describes decisions made elsewhere. It never makes one.** Per `CLAUDE.md`'s process
> rule, anything settled here for the first time is a bug in the process. Every section below cites
> the `decisions.md` entry it comes from; anything not yet decided is marked as such rather than
> written up as if it were.
>
> **Rewritten 2026-08-09 (D-137).** This file described the retired `curious_coder` actor as current
> for two days after D-121 replaced it — including an input schema (`urls`, `count`,
> `splitByLocation`) that this actor does not accept at all. If you find it recommending
> curious_coder or hand-captured LinkedIn search URLs again, the doc is stale, not the decision.

## 1. Actor — decided, see `decisions.md` D-121

**`fantastic-jobs/advanced-linkedin-job-search-api`**

Chosen because its remote filter is **its own, applied server-side** (`aiWorkArrangementFilter`), so
there is no LinkedIn URL parameter left to be silently dropped — the previous failure mode is
designed out rather than worked around.

**Why the previous actor was retired.** `curious_coder/linkedin-jobs-scraper` reads LinkedIn's
**public, logged-out** page, and that page silently ignores `f_WT=2` (LinkedIn's Remote filter). Its
entire input schema had no cookie, no session, no credential — it could not authenticate, so this was
never fixable by configuration. Result: of 51 real postings collected, **not one was remote**, while
every run reported success. D-100's earlier pick of curious_coder (on free-tier cost grounds, over
`bebity`'s $29.99/month rental) is **superseded** by D-121 — but D-100 remains the record of why
bebity was rejected, which still holds.

**Cost (D-132):** real pricing is **$0.005/job ($5/1,000)**, read off the live `pricingInfo` in the
actual run-creation response — *not* the store page's advertised $1.50/1,000. Trivial at this
project's volume either way. Per **D-105**, Apify spend was never the binding constraint; the AI
provider's daily quota is.

> ⚠️ LinkedIn scraping is a ToS gray area. Keep result caps modest. (ATS pollers as a cleaner
> supplement were de-scoped 2026-08-01 — see `backlog.md`; not committed, evidence-gated.)

Indeed / Google Jobs actors remain unselected and out of v1 scope (D-34: staying LinkedIn-only until
LinkedIn-only coverage is shown to be insufficient).

## 2. Task input — decided, see D-126, D-132, D-135

This actor is **field-driven**. It does **not** take LinkedIn search URLs. One broad search replaces
the old four-URL-per-title setup.

```json
{
  "titleSearch": ["Product Manager", "Product Owner", "Product Analyst",
                  "Product Management Intern", "Product Intern", "Product Associate",
                  "Product Management Trainee", "Director of Product Management",
                  "VP of Product", "Head of Product", "Chief Product Officer"],
  "locationSearch": ["India"],
  "aiWorkArrangementFilter": ["Remote OK", "Remote Solely"],
  "removeAgency": false,
  "timeRange": "24h",
  "limit": 150,
  "populateAiRemoteLocation": true,
  "populateAiRemoteLocationDerived": true
}
```

**Why one broad search and not per-title tasks (D-126).** Measured supply decided this: remote +
India, last 7 days — the "Product Manager" family returns **34 jobs**; "Associate/Junior Product
Manager" returns **3 jobs over SIX MONTHS**. The narrow titles are effectively empty; the search must
be broad or there is nothing to filter. Phrase matching means this already catches
Associate/Junior/Senior/Principal/Group/Staff/Lead variants — anything containing the literal phrase
"Product Manager". Intern titles are named explicitly — "Product Manager" happens to match "Product
Manager Intern" but would miss "Product Intern".

**Correction (D-147): "Director" variants were NOT actually covered, despite the line above
originally claiming they were.** "Director of Product Management" contains "Product Management," not
"Product Manager" — same word-mismatch gap as "Product Intern" had, just never caught until this
session verified it against real sample data. Fixed by adding `"Director of Product Management"`,
`"VP of Product"`, `"Head of Product"`, and `"Chief Product Officer"` as explicit full-form terms —
deliberately not abbreviations (no "SPM"/"Lead PM"/"Director PM"), since those carry real collision
risk with unrelated domains (e.g. "APM" = Application Performance Monitoring in DevOps/IT titles).
Bare "APM" was considered and rejected: Sakshi checked real postings and confirmed the abbreviated
form always appears alongside the full "Associate Product Manager" spelled out too, so the existing
phrase match already covers it — no separate term needed. `"Product Management Trainee"` also added
(entry-level gap: neither "Product Management" nor "Trainee" matches existing terms). Full reasoning
and the internet research behind the seniority-ladder list: `decisions.md` D-147.

**Seniority is NOT filtered at the source (D-126).** Filtering it here was proposed and rejected:
`aiExperienceLevelFilter=["0-2","2-5"]` returned **20 jobs over 6 months** where an unfiltered week
returned **34** — it silently drops rows whose experience it cannot determine. Absent is not senior
(D-73/D-112). Sakshi's own `years_experience_min` (D-94) decides after ingest, reading the full
description; the dashboard then narrows by **filter, not deletion**.

**`limit: 150` is load-bearing (D-132).** If omitted it **defaults to 10**, and that single missing
parameter was the entire apparent "coverage gap" — always exactly 10 results regardless of real
supply, and a different arbitrary subset each run. 89 real matching jobs existed for the same
week/search when checked directly against a signed-in LinkedIn. **Never omit it.**

**`removeAgency: false` (D-132)** — Sakshi's call: include agency/recruiter postings rather than
filter them out, since real coverage matters more than avoiding some duplicate reposts. (This
reverses the `true` value D-126 originally carried.)

**`populateAiRemoteLocation` / `populateAiRemoteLocationDerived` (D-135)** — both free, no downside
identified. They backfill `ai_remote_location` from geocoded data only when the AI field would
otherwise be empty. This is the field D-121 credited with catching a role listed under
`locations_derived = ['India']` whose description said candidates must be based in China — LinkedIn's
own metadata was wrong and the field caught it.

> **Naming trap to carry forward (D-121):** `locations_derived` (deterministic geocoding, reliable)
> and `ai_remote_location_derived` (an LLM's judgement) share a `_derived` suffix and deserve very
> different levels of trust.

> **Do not read job counts off a logged-out LinkedIn page.** The same searches read 15–20x too high
> while signed out, because the public search page does not honour the remote filter at all. Any
> count not gathered from a signed-in session is not a remote count. This warning is what D-121's
> root cause turned on and it is still true — it now applies to sanity-checking our own results, not
> to building input URLs.

### Company tasks (watchlist)

Watchlist seeds live in `seed/company_watchlist.json` — **currently empty** (D-32). Add a company
only once you have direct evidence it's remote-from-India friendly; there is no committed roadmap
item to auto-populate this list. **So there are no company tasks to create yet.** Pulling every open
role at a company was reversed 2026-08-01 (D-33): it wastes Apify quota and downstream AI quota on
unrelated roles.

Separately, the `remote_companies` **catalog** (D-44/D-109) is populated automatically from ingest —
it is not a task you configure here.

## 3. Schedule — cadence decided (D-134), NOT BUILT

**Decided:** `timeRange: "24h"`, run **daily**.

**Why 24h and not 7d:** Apify bills per job written to its dataset on **every** run, regardless of
whether that job is already in `jobs`. A `7d` search run daily would re-charge for the same
overlapping jobs every day. A `24h` window run once a day naturally covers "since roughly the last
run". Our own `(source, external_id)` dedupe (`services/discovery/ingest.ts`) is a backstop against
accidental overlap, not the primary cost control — the time-window choice is.

**Still open, deliberately (D-134):** the *mechanism* — Apify's own Schedule vs. an external cron —
was left undecided. Do not assume either.

**Status: not built, and NOT to be built yet.** No schedule exists. Sakshi said explicitly on
2026-08-09: *"don't do a schedule yet."* D-134 settled *what* the cadence would be if built — it is
not authorization to build it. This section describes a decision, not a running system and not a
queued task.

## 4. Webhook (how results reach us)

On the Task (or globally), add a **Webhook**:
- **Event type:** `ACTOR.RUN.SUCCEEDED`
- **URL:** your deployed endpoint, e.g. `https://<your-app>.vercel.app/api/webhooks/apify` (Phase 7).
  For local testing use `npm run ingest -- --run <runId> --source <source>` instead.
- **Headers:** `x-apify-webhook-secret: <APIFY_WEBHOOK_SECRET>` (same value as in `.env`).
- **Payload template** (so we know which source/label the run is):
  ```json
  {
    "source": "linkedin",
    "resource": {{resource}},
    "eventData": {{eventData}}
  }
  ```

The handler (`services/discovery/webhook.ts`) validates the secret, pulls the run's dataset via the
Apify API, maps items, and ingests them (idempotent per run id).

> **Fixed 2026-08-09 (D-137).** This handler was still calling the retired curious_coder mapper from
> D-121 until now. The two actors' payloads share no field names, so a real delivery here would have
> mapped every item to null, ingested nothing, and returned HTTP 200. It never fired only because the
> §3 schedule was never built. **Before switching the schedule on, confirm the first run actually
> ingests a non-zero count** — the failure mode of this endpoint is a silent success.

## 5. Local testing without the webhook
- From a saved run: `npm run ingest -- --run <APIFY_RUN_ID> --source linkedin`
- From a JSON file of items: `npm run ingest -- --file samples/fantastic-jobs-remote-india.json --source linkedin`

`--actor` selects the mapper explicitly and defaults to `fantastic-jobs` (D-121: the mapper is chosen
deliberately, never sniffed from the payload — guessing which actor produced a record is precisely how
the previous source returned wrong data while reporting success).

## 6. Verified against real runs

`lib/discovery/apify.ts`'s `mapFantasticJobsItem` field names were **verified against a real 10-job
run** (2026-08-07, dataset `590VsqobvMJUvWbfz`, saved at `samples/fantastic-jobs-remote-india.json`),
not guessed — and re-confirmed 2026-08-09 by re-ingesting that file end to end (10 received, 0 lost
to null). `tests/fixtures/sample-fantastic-jobs.json` mirrors that real shape.

Of the actor's 71 fields, only **23** are `ai_`-prefixed; 26 are raw (including the full
`description_text`), 9 are deterministic geocoding, 14 are company data. Sakshi's own classification
stays authoritative and the AI fields can be measured against it rather than trusted blindly — which
is what makes relying on this source low-risk.
