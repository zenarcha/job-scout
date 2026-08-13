// Rotates Gemini API keys across several Google projects (D-118).
//
// Why this exists: the free-tier cap is 20 requests **per day, per project** (D-111,
// read off the API). Keys within ONE project all share that 20 — Google's docs say
// "Rate limits are applied per project, not per API key" — so extra keys only help
// when each belongs to a *different* project. That distinction is the whole point of
// this module and is why `.env.example` states it explicitly.
//
// The behavioural change that matters: a per-DAY 429 means this key is finished until
// midnight Pacific. Sleeping 46s and retrying it (what retryOptions did, built for
// D-107's since-disproven burst theory) burns a retry on a key that cannot recover
// within the run. With several keys the useful move is to switch immediately.
//
// Deliberately NOT doing: shaping request timing to avoid abuse detection. Rotation
// spreads load across allowances legitimately held; spacing stays exactly as
// throttle.ts already had it.

/** Marks a rate-limit error as a per-day quota (key is done today) vs a per-minute
 *  window (waiting genuinely helps). Google puts the distinction in `quotaId`. */
export function isDailyQuotaError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /PerDay|RequestsPerDay/i.test(msg);
}

function parseKeys(): string[] {
  // Sakshi put four comma-separated keys on the existing GEMINI_API_KEY line, so both
  // names accept a list. A single key with no comma is simply a list of one, which is
  // why the pre-existing single-key setup keeps working untouched.
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  const keys = [...new Set(raw.split(',').map((k) => k.trim()).filter(Boolean))];
  if (!keys.length) throw new Error('Missing required env var: GEMINI_API_KEY (or GEMINI_API_KEYS)');
  return keys;
}

let keys: string[] | null = null;
// Exhaustion is per-process only, not persisted. The pipeline runs as a short-lived
// CLI, so a later run rediscovers an exhausted key by spending one call on it — at
// most one wasted call per key per run (4 of 80 today). A `key_usage` table would
// remove that waste and is not worth the schema; recorded here so the cost is a
// visible tradeoff rather than an apparent oversight.
const exhausted = new Set<string>();
let cursor = 0;

function all(): string[] {
  if (!keys) keys = parseKeys();
  return keys;
}

export function keyCount(): number {
  return all().length;
}

/** Next usable key, round-robin. Throws only when every key is exhausted — at which
 *  point the stage fails and D-101's parking / v_enrich_pending take over unchanged. */
export function nextKey(): { key: string; index: number } {
  const ks = all();
  for (let i = 0; i < ks.length; i++) {
    const index = (cursor + i) % ks.length;
    const key = ks[index]!;
    if (!exhausted.has(key)) {
      cursor = (index + 1) % ks.length;
      return { key, index };
    }
  }
  throw new Error(
    `All ${ks.length} Gemini key(s) have hit their daily quota. ` +
      `Free-tier quotas reset at midnight Pacific; jobs stay in v_enrich_pending until then.`,
  );
}

// Successful calls served per key this process. Reported when a key exhausts, which
// is what makes "did this key actually get its own 20/day?" answerable — see D-125,
// where three supposedly-separate projects yielded roughly 6 calls each and there was
// no per-key record to explain it.
const served = new Map<string, number>();

export function noteServed(key: string): void {
  served.set(key, (served.get(key) ?? 0) + 1);
}

/** Records that a key's project is out of daily quota. Idempotent. */
export function markExhausted(key: string, index: number): void {
  if (exhausted.has(key)) return;
  exhausted.add(key);
  console.warn(
    `[gemini] key[${index}] hit its per-day quota after ${served.get(key) ?? 0} successful call(s) ` +
      `this run — ${all().length - exhausted.size} of ${all().length} key(s) left. ` +
      `(A key in its own project should reach ~20; far fewer means the keys share a project.)`,
  );
}

export function exhaustedCount(): number {
  return exhausted.size;
}

/** Test seam. */
export function __resetKeyPool(): void {
  keys = null;
  exhausted.clear();
  cursor = 0;
}
