# AI Ops Panel — deferred build, not scheduled yet

Task 2 of [tasks.md](tasks.md). Session 31 (2026-08-10).

## Context

This session's investigation into AI call math (triggered by questions about Groq quota math and
whether the ingest regex pre-filter is still needed) surfaced that:

- Quota exhaustion (`isGroqExhausted()`, D-127) only logs a console warning — there is currently zero
  visibility into today's real token burn against the 100,000/day Groq ceiling until a run silently
  stops.
- `.env`'s `INGEST_REMOTE_FILTER` was found live-set to `on`, contradicting D-104's decided default of
  `off` — a real config-vs-decision drift nobody had noticed, discovered only by manually inspecting
  the file this session.
- Real per-stage AI cost was previously unmeasured for `remote_check`/`geo_recheck`; querying the
  existing `ai_usage` table this session produced real numbers (below) that correct the earlier
  estimate.
- `enrich_runs.failed_stages` and `v_enrich_parked` (D-101) already track failure/parking state but
  nothing surfaces them anywhere a human would actually look.

None of this is broken today — the pipeline works. The gap is **visibility**: several of these facts
were only discoverable by hand-querying Supabase mid-conversation. The intended outcome is a small,
always-current panel that surfaces them without a manual SQL session each time.

**Not scheduled for this session or immediately next — explicitly deferred ("we will build this
later").** Captured here so the design isn't re-derived from scratch next time.

## Real measured AI cost (queried live, this session, from `ai_usage`)

| Stage | Calls sampled | Avg tokens/call | AI call? |
|---|---|---|---|
| `classify` | 5 | ~1,879 | Yes |
| `geo_recheck` | 2 (conditional) | ~913 | Yes |
| `remote_check` | 47 | ~1,518 | Yes |
| `skills` | 5 | 0 (merged into classify, D-117a) | No — reused |
| `salary` | — | — | No — deterministic regex (`promptVersion: 'salary-regex-v1'`), not an AI call |

Groq ceiling: ~100,000 tokens/day (D-127), one key, no fallback (D-132) — hard-stops the rest of the
day on a real TPD 429. Current live batch (post D-138 reset, 52 real jobs): 47 senior-titled (90%,
`remote_check` path) / 5 junior-titled (10%, full `classify` path) — confirmed via direct query, not
estimated.

## Recommended approach — sized to actual scale

Single user, ~50 scraped jobs/day, ~1-2 genuinely relevant/day (D-75's own estimate), $0 budget,
checked periodically rather than needing real-time alerting. This is **one small panel added to the
existing dashboard**, not a new system — `scripts/build-dashboard.ts` / `dashboard-live.html` already
regenerate from Supabase on demand, and the source tables already exist and self-populate.

**Panel contents (4 rows):**
1. **Quota burn-down** — today's total tokens used (sum `ai_usage.prompt_tokens + completion_tokens`
   where `created_at` is today) vs. the 100,000 ceiling, as a simple bar/number. Highest-leverage item
   — this is the one fact that silently determines whether tonight's run finishes.
2. **Per-stage call count + avg cost, last 7 days** — one small table, `GROUP BY stage`. `geo_recheck`
   fire rate and the junior/senior split both fall out of this same table for free — no separate
   build needed for either.
3. **Failed/parked job count** — `count(*)` from `v_enrich_parked` (D-101) plus a rollup of
   `enrich_runs.failed_stages`. Catches a stuck pipeline in one glance instead of discovering it days
   later.
4. **Low-confidence row count** — static count of `classify` rows where `needsReview` (confidence <
   0.6) is true and unresolved. A count, not a trend chart — real volume is too low right now
   (1-2 relevant jobs/day) for a time-series to mean anything yet; revisit as a trend once there's
   enough history.

**Separate one-off script, not a panel row:** a prompt-version-drift check (`ai_usage.prompt_version`
grouped by day) — run manually right after any prompt or config change, the same way the `.env` drift
was caught this session by hand. This is an event-triggered check, not a continuous metric, so a
permanently-running panel row would just be graphing something that changes maybe once a session.

## Explicitly deferred / out of scope at this scale

- Real-time alerting/paging — no one is on-call for this; a static panel refreshed on dashboard build
  is enough.
- Latency tracking — nothing here is latency-sensitive at single-user, batch-run volume.
- Full business-outcome layer (jobs surfaced → jobs actually useful, tied to D-69/D-77 feedback) — the
  lighter feedback mechanism already exists; a dedicated dashboard for it isn't worth it until volume
  is meaningfully higher.
- Confidence trend chart (vs. static count) — premature until there's more daily volume.

## Priority relative to other outstanding work

Ranked **below** `tests/golden/` (D-71, still unbuilt) if only one gets built next. D-71 protects
*accuracy* (the thing that's already cost real mistakes — Danaher, Equinix) using labeled data this
session's earlier audit already produced. This panel protects *visibility* into a pipeline that,
today, is not actually broken. Both are real, but accuracy risk is proven; visibility risk is
currently theoretical.

## Files to reuse (no new infrastructure)

- `ai_usage`, `rollup_ai_cost` tables — already populated by `lib/events.ts`'s `recordAiUsage()`.
- `v_enrich_parked` view (D-101, migration `0003_parking_and_classify_fields.sql`).
- `enrich_runs.failed_stages` — already written per run by `lib/enrich/pipeline.ts`.
- `lib/ai/groqQuota.ts` — `isGroqExhausted()`/`markGroqExhausted()`, currently console-only.
- `scripts/build-dashboard.ts`, `dashboard-live.html` — existing dashboard generation to extend, not
  replace.

## Verification (once actually built)

- Run `npm run build-dashboard` (or whatever the current script command is) and confirm the panel
  renders with real numbers matching a manual query against `ai_usage`/`v_enrich_parked`.
- Deliberately exhaust a small test quota (or mock `isGroqExhausted()` true) and confirm the
  burn-down bar reflects it, not just the console warning.
- Re-run the prompt-version-drift script after a deliberate no-op prompt change and confirm it
  reports 100% current version (i.e., the script itself works before relying on it after a real
  change).
