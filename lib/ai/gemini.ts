// Gemini adapter (free tier via Google AI Studio). REST — no SDK dependency.
import pRetry, { AbortError } from 'p-retry';
import { env } from '../config.js';
import type { ProviderResponse } from './provider.js';

export async function callGemini(prompt: string): Promise<ProviderResponse> {
  const model = env.ai.gemini.model;
  const key = env.ai.gemini.apiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  return pRetry(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        // 429/5xx are retryable; 4xx (bad key/quota) should fail fast.
        if (res.status >= 500 || res.status === 429) throw new Error(`gemini ${res.status}: ${body}`);
        throw new AbortError(`gemini ${res.status}: ${body}`);
      }
      const json: any = await res.json();
      const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const um = json?.usageMetadata ?? {};
      return {
        provider: 'gemini',
        model,
        text,
        usage: {
          prompt_tokens: um.promptTokenCount ?? 0,
          completion_tokens: um.candidatesTokenCount ?? 0,
        },
        raw: json,
      };
    },
    { retries: 3, minTimeout: 800 },
  );
}
