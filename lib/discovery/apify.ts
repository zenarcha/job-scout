// Apify integration: map dataset items → RawPosting, and fetch a run's dataset.
//
// D-137: `curious_coder/linkedin-jobs-scraper` and its tolerant multi-key mapper
// (`mapApifyItem`) were REMOVED here. D-121 had already retired that actor — it reads
// LinkedIn's logged-out page, which ignores the remote filter — but its mapper was left
// in place and `services/discovery/webhook.ts` was still calling it. One actor, one
// mapper now: a second, unused path is what let that webhook go wrong unnoticed.
import { env } from '../config.js';
import type { RawPosting } from '../types.js';

// Kept after D-137's removal: `mapFantasticJobsItem` uses it for the id fallback below.
// It is now a two-key null/empty-coalesce, NOT the cross-actor tolerance chain it was
// built for — see the note on that mapper before widening it again.
function pick<T = string>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

// ── fantastic-jobs/advanced-linkedin-job-search-api (D-121) ─────────────
//
// Reads this actor's field names DIRECTLY rather than through a tolerant key-chain.
// That is deliberate: a chain of fallback names cannot tell you which actor produced a
// given value, and D-121 exists because a source silently returned the wrong data while
// reporting success. If a future second source is added, give it its own mapper and its
// own `--actor` key (see scripts/run-ingest.ts) instead of widening this one.
//
// Field-name evidence: verified against a real 10-job run (2026-08-07, dataset
// 590VsqobvMJUvWbfz), saved at samples/fantastic-jobs-remote-india.json. Not guessed.
export function mapFantasticJobsItem(item: any, source = 'linkedin'): RawPosting | null {
  const externalId = pick<string>(item, ['id', 'linkedin_id']);
  if (!externalId) return null; // no stable id → cannot dedup (D-8)

  // `locations_derived` is deterministic geocoding of the posting's own location
  // string — NOT the `ai_`-prefixed layer. Kept distinct on purpose: see the naming
  // trap in D-121, where `ai_remote_location_derived` shares the "_derived" suffix
  // but is an LLM judgement and earns much less trust.
  const loc = Array.isArray(item.locations_derived) ? item.locations_derived : [];

  return {
    source,
    externalId: String(externalId),
    company: item.organization ?? undefined,
    roleTitle: item.title ?? undefined,
    postingUrl: item.url ?? undefined,
    // This actor exposes no external apply destination. Left undefined rather than
    // set to '' — D-41's point is that a missing apply_url must not masquerade as a
    // known one, and the previous actor returned '' on all 50 items.
    applyUrl: undefined,
    location: loc[0] ?? undefined,
    postedAt: item.date_posted ?? item.date_created ?? undefined,
    // Already plain text when descriptionType='text'; cleanJd() is idempotent over it.
    jdRaw: item.description_text ?? undefined,
    recruiterName: item.recruiter_name ?? undefined,
    recruiterLinkedin: item.recruiter_url ?? undefined,
  };
}

/**
 * The source-side signals this actor supplies that the pipeline currently spends AI
 * calls to infer. Returned separately from RawPosting because **D-122 (CLOSED,
 * 2026-08-08) decided NOT to wire these into `classify`/`salary`/`skills`** — on the
 * 10-job sample tested, `ai_salary_min/max` were null in 10/10 and `ai_experience_level`
 * is a coarse bucket string, not the integer range the dashboard filter needs. This
 * function is dead code, kept only in case a larger sample someday changes that call —
 * see D-122's "Revisit when" clause before wiring it in.
 *
 * `aiRemoteLocation` is the one field that already earned its keep in testing: on the
 * sample run it caught a job listed under `locations_derived = ['India']` whose
 * description says candidates must be based in China.
 */
export function fantasticJobsSignals(item: any): Record<string, unknown> {
  return {
    ai_work_arrangement: item.ai_work_arrangement ?? null,
    ai_remote_location: item.ai_remote_location ?? item.ai_remote_location_derived ?? null,
    ai_experience_level: item.ai_experience_level ?? null,
    ai_key_skills: item.ai_key_skills ?? null,
    ai_salary_min: item.ai_salary_min_value ?? null,
    ai_salary_max: item.ai_salary_max_value ?? null,
    ai_salary_currency: item.ai_salary_currency ?? null,
    ai_salary_unit: item.ai_salary_unit_text ?? null,
    ai_requirements_summary: item.ai_requirements_summary ?? null,
    ai_education: item.ai_education ?? null,
    countries_derived: item.countries_derived ?? null,
    org_industry: item.org_linkedin_industry ?? null,
    org_size: item.org_linkedin_size ?? null,
  };
}

async function apifyGet(path: string): Promise<any> {
  const url = `https://api.apify.com/v2/${path}${path.includes('?') ? '&' : '?'}token=${env.apify.token()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apify GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchDatasetItems(datasetId: string): Promise<any[]> {
  return apifyGet(`datasets/${datasetId}/items?clean=true&format=json`) as Promise<any[]>;
}

export async function fetchRunDataset(runId: string): Promise<{ datasetId: string; items: any[] }> {
  const run = await apifyGet(`actor-runs/${runId}`);
  const datasetId: string = run?.data?.defaultDatasetId;
  if (!datasetId) throw new Error(`No defaultDatasetId on Apify run ${runId}`);
  return { datasetId, items: await fetchDatasetItems(datasetId) };
}
