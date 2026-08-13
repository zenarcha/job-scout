// Groq daily-quota exhaustion tracking (D-136).
//
// Kept separate from lib/ai/keyPool.ts on purpose: keyPool.ts models Gemini's shape —
// several keys, each with its own per-day REQUEST allowance, rotated when one runs out.
// Groq (D-124, sole provider per D-132) is structurally different — one key, and its
// binding limit is TOKENS per day, not requests (D-127: "Rate limit reached for
// `llama-3.3-70b-versatile` … on tokens per day (TPD): Limit 100000, Used 98748." —
// ~43 jobs/day at classify's token cost). There is no second key to rotate to, so the
// only useful response to hitting it is: stop for today, not retry or switch.
//
// Exhaustion is per-process only, like keyPool.ts's — the pipeline is a short-lived
// CLI, so a later run just rediscovers the reset quota with one call.
let exhausted = false;

/** Groq's own daily-TPD 429 body, verbatim per D-127 — matched on the literal text
 *  seen in the live error, not a guess. */
export function isGroqDailyQuotaError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /tokens per day \(TPD\)/i.test(msg);
}

/** Records that Groq's daily token budget is spent. Idempotent. */
export function markGroqExhausted(): void {
  if (exhausted) return;
  exhausted = true;
  console.warn(
    '[groq] daily TPD quota exhausted for today — not retrying. ' +
      'Jobs stay pending until the next run (D-127: ~100,000 tokens/day, resets daily).',
  );
}

export function isGroqExhausted(): boolean {
  return exhausted;
}

/** Test seam. */
export function __resetGroqQuota(): void {
  exhausted = false;
}
