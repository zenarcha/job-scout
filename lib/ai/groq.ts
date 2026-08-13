// Groq adapter (D-124). OpenAI-compatible, so this reuses `callOpenAICompatible`
// exactly as the Cerebras adapter does.
//
// ⚠️ GROQ IS NOT GROK. `lib/ai/grok.ts` points at **xAI** (Elon Musk's, paid) — a
// different company with a near-identical name. D-113 already recorded that confusion
// once, when "keep Groq in reserve" turned out to mean a `grok.ts` aimed at a paid xAI
// endpoint. Two files, two vendors, one letter apart: check which you are editing.
//   groq.ts  → api.groq.com   → Groq, free tier, this file
//   grok.ts  → api.x.ai       → xAI, paid
//
// Why it exists: the Gemini free tier is 20 requests/day per project (D-111), the
// binding constraint on this whole pipeline. Groq's free tier is 30 requests/**minute**
// and 1,000/day on llama-3.3-70b-versatile — a 50x ceiling — and the pipeline already
// spaces calls 4s apart (throttle.ts), so the per-minute limit is never approached.
//
// Model choice sets the daily ceiling:
//   llama-3.3-70b-versatile → 1,000/day  (default; the stronger instruction-follower)
//   llama-3.1-8b-instant    → 14,400/day (far more headroom, noticeably weaker)
// The 70B default is deliberate: `classify` must honour a 17-output JSON contract and
// D-67's closed vocabulary, which is exactly where smaller models drift.
//
// NOT the default provider. `AI_PROVIDER` stays `gemini`; reach this per stage via
// AI_PROVIDER_CLASSIFY / AI_PROVIDER_SKILLS / AI_PROVIDER_GEO_RECHECK. Making it the
// default is a quality decision needing the D-122 comparison — three times this session
// a capability was believed on its documentation and turned out not to hold.
//
// ⚠️ Privacy, same as D-118: free tiers are generally free because inputs may be used.
// This pipeline sends full JDs, which carry recruiter names. True of Gemini too.
//
// D-136: Groq's binding limit is tokens-per-day, not requests-per-day (D-127) — a
// 429 for it doesn't clear by waiting or retrying, only by the next day. Detected via
// lib/ai/groqQuota.ts (deliberately not lib/ai/keyPool.ts — Gemini's multi-key,
// per-day-REQUESTS model doesn't apply here) and aborted immediately rather than
// burning callOpenAICompatible's normal 3-retry backoff into a wall that cannot clear
// within the run, mirroring gemini.ts's isDailyQuotaError handling.
import pRetry, { AbortError } from 'p-retry';
import { env } from '../config.js';
import { errorForResponse, retryOptions, requestTimeout, RateLimitError, type ProviderResponse } from './provider.js';
import { isGroqDailyQuotaError, markGroqExhausted } from './groqQuota.js';

export async function callGroq(prompt: string): Promise<ProviderResponse> {
  const model = env.ai.groq.model;
  const apiKey = env.ai.groq.apiKey();

  return pRetry(
    async () => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: requestTimeout(),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = errorForResponse('groq', res, await res.text());
        if (err instanceof RateLimitError && isGroqDailyQuotaError(err)) {
          markGroqExhausted();
          throw new AbortError(err.message);
        }
        throw err;
      }

      const json: any = await res.json();
      const text: string = json?.choices?.[0]?.message?.content ?? '';
      const u = json?.usage ?? {};
      return {
        provider: 'groq',
        model,
        text,
        usage: { prompt_tokens: u.prompt_tokens ?? 0, completion_tokens: u.completion_tokens ?? 0 },
        raw: json,
      };
    },
    retryOptions('groq'),
  );
}
