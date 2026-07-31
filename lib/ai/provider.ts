// Shared provider contract + an OpenAI-compatible caller reused by Cerebras and Grok.
import pRetry, { AbortError } from 'p-retry';

export interface ProviderResponse {
  provider: string;
  model: string;
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  raw: unknown;
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
      if (!res.ok) {
        const body = await res.text();
        if (res.status >= 500 || res.status === 429) throw new Error(`${opts.provider} ${res.status}: ${body}`);
        throw new AbortError(`${opts.provider} ${res.status}: ${body}`);
      }
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
    { retries: 3, minTimeout: 800 },
  );
}
