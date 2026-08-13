// Gemini adapter (free tier via Google AI Studio). REST — no SDK dependency.
import pRetry from 'p-retry';
import { env } from '../config.js';
import { errorForResponse, retryOptions, requestTimeout, RateLimitError, type ProviderResponse } from './provider.js';
import { isDailyQuotaError, markExhausted, nextKey, noteServed } from './keyPool.js';

export async function callGemini(prompt: string): Promise<ProviderResponse> {
  const model = env.ai.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  return pRetry(
    async () => {
      // Drawn INSIDE the retried function, not once outside it: a retry after a
      // per-day 429 must reach a different project's key, or it repeats the request
      // that just failed. The key travels in a header rather than the query string
      // so it never lands in a URL (logs, error messages, proxies).
      const { key, index } = nextKey();

      const res = await fetch(url, {
        method: 'POST',
        signal: requestTimeout(),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });

      // D-111: 429 splits two ways. A per-DAY quota means this key's project is done
      // until midnight Pacific — mark it and let the retry pick another key, with no
      // sleep, because waiting cannot help. A per-minute window keeps D-107's long
      // backoff, where waiting is exactly what helps. `quotaId` in the body is the
      // only thing that distinguishes them, which is why provider.ts now logs
      // error.message rather than discarding it.
      if (!res.ok) {
        const err = errorForResponse('gemini', res, await res.text());
        if (err instanceof RateLimitError && isDailyQuotaError(err)) {
          markExhausted(key, index);
          err.retryAfterMs = 0;
        }
        throw err;
      }

      noteServed(key);
      const json: any = await res.json();
      const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const um = json?.usageMetadata ?? {};
      // Record WHICH key served this call. Without it, `ai_usage` says only
      // "provider: gemini" and there is no way to tell whether four keys each got a
      // fresh 20/day or were quietly sharing one allowance — the exact question left
      // unanswerable on 2026-08-07, when 3 supposedly-fresh keys yielded ~6 calls each
      // instead of 20 (D-125). The index is enough; the key itself is never logged.
      return {
        provider: 'gemini',
        model,
        text,
        usage: {
          prompt_tokens: um.promptTokenCount ?? 0,
          completion_tokens: um.candidatesTokenCount ?? 0,
        },
        raw: { ...json, _key_index: index },
      };
    },
    retryOptions('gemini'),
  );
}
