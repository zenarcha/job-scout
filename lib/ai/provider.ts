// Shared provider contract + an OpenAI-compatible caller reused by Cerebras and Grok.
import pRetry, { AbortError } from 'p-retry';
import { env } from '../config.js';
import { keyCount, exhaustedCount } from './keyPool.js';

/**
 * Hard ceiling on a single provider HTTP request.
 *
 * Node's `fetch` has NO default timeout — a stalled connection waits forever. Measured
 * 2026-08-08: an enrich run sat at 13 queued jobs for 20+ minutes, process alive at 0%
 * CPU, no output, no AI call. It was not slow; it was hung on one socket. Nothing in
 * the pipeline could detect that, because a request that never returns never fails.
 *
 * 90s is deliberately generous — a real classify call takes ~1-3s, and Groq's
 * token-per-minute backoff sleeps happen OUTSIDE this window (in onFailedAttempt), so
 * this only ever fires on a genuinely dead connection. When it does, the AbortError
 * surfaces as a normal stage failure and D-101's parking brings the job back.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 90_000);

export function requestTimeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

export interface ProviderResponse {
  provider: string;
  model: string;
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  raw: unknown;
}

// ── 429 handling (D-107) ────────────────────────────────────────────────
// A rate-limit rejection and a transient 5xx need opposite responses, and the original
// code gave them the same one: `minTimeout: 800`. 800ms cannot clear a per-minute
// window, so every 429 was re-fired into the same closed door — 88 base calls became
// ~400 requests, which is what the AI Studio dashboard recorded. 5xx keeps the short
// retry; 429 waits out the window.

export class RateLimitError extends Error {
  /** How long the provider asked us to wait, in ms, when it says so.
   *  Mutable because a per-DAY quota (D-111) overrides it to 0: the provider's
   *  `retryDelay: 46s` is real for a per-minute window but meaningless against a
   *  daily cap, and it is exactly what made D-107 misread the limit. With several
   *  keys the right response is to switch key now, not to sleep. */
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) into ms. Undefined if absent/unparseable. */
function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/**
 * Classify a non-OK response into the right error kind:
 * 429 → RateLimitError (long backoff), 5xx → plain Error (short retry),
 * other 4xx → AbortError (bad key/request; retrying cannot help).
 */
export function errorForResponse(provider: string, res: Response, body: string): Error {
  const msg = `${provider} ${res.status}: ${body}`;
  if (res.status === 429) return new RateLimitError(msg, parseRetryAfter(res));
  if (res.status >= 500) return new Error(msg);
  return new AbortError(msg);
}

/**
 * Retry options shared by every provider. `onFailedAttempt` is awaited by p-retry, so
 * sleeping in it is how a 429 gets a longer delay than p-retry's own backoff schedule.
 */
export function retryOptions(provider: string) {
  return {
    // Enough attempts to try every key once before giving up. With one key this is
    // the original 3 retries; with four it becomes 4, so an all-keys-exhausted run
    // fails for the right reason rather than running out of attempts first.
    retries: Math.max(3, keyCount()),
    minTimeout: 800,
    async onFailedAttempt(error: any) {
      if (!(error instanceof RateLimitError) && error?.name !== 'RateLimitError') return;

      // Every key is spent — further attempts CANNOT succeed, and each one still
      // counts against the daily quota (a refused request is refused *because* it was
      // counted). Measured 2026-08-07: retrying into this wall turned 80 available
      // requests into 18 useful ones. Abort so p-retry stops immediately; the stage
      // fails, and D-101's parking plus v_enrich_pending bring the job back tomorrow.
      if (keyCount() > 0 && exhaustedCount() >= keyCount()) {
        throw new AbortError(
          `${provider}: all ${keyCount()} key(s) exhausted for today — not retrying. ${error.message}`,
        );
      }

      // Prefer the provider's own instruction over our guess when it gives one.
      // A per-day quota sets this to 0 upstream — switching key beats sleeping.
      const waitMs = error.retryAfterMs ?? env.ai.rateLimitBackoffMs();
      if (waitMs === 0) return;
      // Include the provider's own message (D-111). Logging only "rate limited"
      // discarded the body, where Gemini states `quotaId:
      // GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue: 20` — a DAILY
      // cap. Without it the accompanying `retryDelay: 46s` read as a clearing burst
      // window, and D-107 misdiagnosed the quota for two sessions.
      console.warn(
        `[${provider}] rate limited (attempt ${error.attemptNumber}), waiting ${Math.round(waitMs / 1000)}s before retry: ${error.message}`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    },
  };
}

// Cerebras and Grok both expose OpenAI-compatible /chat/completions endpoints.
export async function callOpenAICompatible(opts: {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<ProviderResponse> {
  return pRetry(
    async () => {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: requestTimeout(),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: opts.prompt }],
        }),
      });
      if (!res.ok) throw errorForResponse(opts.provider, res, await res.text());
      const json: any = await res.json();
      const text: string = json?.choices?.[0]?.message?.content ?? '';
      const u = json?.usage ?? {};
      return {
        provider: opts.provider,
        model: opts.model,
        text,
        usage: { prompt_tokens: u.prompt_tokens ?? 0, completion_tokens: u.completion_tokens ?? 0 },
        raw: json,
      };
    },
    retryOptions(opts.provider),
  );
}
