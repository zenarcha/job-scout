# Apify setup — role & company discovery

Apify runs the scrapers on a schedule and calls our webhook when a run finishes. We never
run our own scraping cron; Apify's scheduler is the trigger.

## 1. Actors to use
- **LinkedIn Jobs Scraper** — e.g. `bebity/linkedin-jobs-scraper` or
  `curious_coder/linkedin-jobs-scraper` (pick one; both output compatible fields).
- (optional) **Indeed Scraper** — `misceres/indeed-scraper`.
- (optional) **Google Jobs** — any Google Jobs actor.

> ⚠️ LinkedIn scraping is a ToS gray area. Keep result caps modest. The Greenhouse/Lever/Ashby
> ATS pollers (Phase 4) are the clean, high-reliability supplement for watchlist companies.

## 2. Create Tasks (saved actor configs)

### Role tasks (one per title)
Input (LinkedIn actor): `title` = the role, `location` = `India`, `remote` = true (or the
actor's remote filter), `rows`/`maxItems` = a small cap (e.g. 50).

Titles:
- Product Manager
- Product Operations
- Product Analyst
- AI Product Operations
- Product Specialist
- Technical Product Specialist

### Company tasks (one per watchlist company)
Input: `companyName` = the company, `location` = `India`, `remote` = true. **Do not** set a
title filter — we want off-title roles ("Product Lead", "Growth PM", "AI Solutions Manager").
The classifier decides relevance.

Watchlist seeds live in `seed/company_watchlist.json`.

## 3. Schedule
Add each Task to an Apify **Schedule** (e.g. every 30–60 min). Stagger role vs. company tasks to
stay within free-tier limits.

## 4. Webhook (how results reach us)
On each Task (or globally), add a **Webhook**:
- **Event type:** `ACTOR.RUN.SUCCEEDED`
- **URL:** your deployed endpoint, e.g. `https://<your-app>.vercel.app/api/webhooks/apify`
  (Phase 7). For local testing use `npm run ingest -- --run <runId> --source <source>` instead.
- **Headers:** `x-apify-webhook-secret: <APIFY_WEBHOOK_SECRET>` (same value as in `.env`).
- **Payload template** (so we know which source/label the run is):
  ```json
  {
    "source": "linkedin",
    "resource": {{resource}},
    "eventData": {{eventData}}
  }
  ```
  Set `"source"` to `linkedin` / `indeed` / `google` per task.

The handler (`services/discovery/webhook.ts`) validates the secret, pulls the run's dataset via
the Apify API, maps items, and ingests them (idempotent per run id).

## 5. Local testing without the webhook
- From a saved run: `npm run ingest -- --run <APIFY_RUN_ID> --source linkedin`
- From a JSON file of items: `npm run ingest -- --file tests/fixtures/sample-linkedin.json --source linkedin`
