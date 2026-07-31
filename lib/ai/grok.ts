// Grok (xAI) adapter. OpenAI-compatible.
import { env } from '../config.js';
import { callOpenAICompatible, type ProviderResponse } from './provider.js';

export async function callGrok(prompt: string): Promise<ProviderResponse> {
  return callOpenAICompatible({
    provider: 'grok',
    baseUrl: 'https://api.x.ai/v1',
    apiKey: env.ai.grok.apiKey(),
    model: env.ai.grok.model,
    prompt,
  });
}
