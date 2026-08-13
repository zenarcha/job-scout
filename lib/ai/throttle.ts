// Serialises AI calls and spaces them out (D-107).
//
// Why this exists: the first real enrich run fired 88 base calls back-to-back
// (`enrichPending`'s sequential loop has no delay between jobs or stages) and got
// 429-ed almost immediately.
//
// CORRECTION (D-111) — the original reasoning here was wrong, and the wrong version
// survived two sessions. It read the 429s as "a rate/token-per-minute throttle
// clearing, not a daily quota wall", and concluded the fix was to stop looking like a
// burst rather than to find more quota. A direct API probe says otherwise:
// `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue: 20`. It is
// a hard DAILY cap. Spacing cannot buy a single extra request — 20 calls an hour apart
// still exhaust it.
//
// The code below is unchanged and still worth keeping: serialising calls is ordinary
// politeness toward an API and keeps one queue for every stage. Just don't mistake it
// for the thing holding the quota open. What actually raises the ceiling is fewer calls
// per job (D-117) and keys from more projects (lib/ai/keyPool.ts, D-118).
//
// Deliberately a module-level gate rather than a per-caller sleep: every AI call in the
// process shares one queue, so adding a fourth AI stage later cannot accidentally
// reintroduce parallel bursts.
import { env } from '../config.js';

let chain: Promise<void> = Promise.resolve();
let lastCallAt = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `fn` after ensuring at least `AI_CALL_SPACING_MS` has elapsed since the previous
 * AI call. Calls queue in arrival order; the spacing is measured from when the previous
 * call *started*, so a slow call doesn't add its own latency on top of the gap.
 */
export function throttleAiCall<T>(fn: () => Promise<T>): Promise<T> {
  const spacing = env.ai.callSpacingMs();
  const run = chain.then(async () => {
    if (spacing > 0) {
      const waitFor = spacing - (Date.now() - lastCallAt);
      if (waitFor > 0) await sleep(waitFor);
    }
    lastCallAt = Date.now();
  });
  // Keep the chain alive even if a call throws — one failed stage must not wedge the
  // queue for every later job in the run (the D-99 lesson, applied to the throttle).
  chain = run.catch(() => undefined);
  return run.then(fn);
}

/** Test seam: reset the queue between test cases. */
export function __resetThrottle(): void {
  chain = Promise.resolve();
  lastCallAt = 0;
}
