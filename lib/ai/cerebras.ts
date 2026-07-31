// Cerebras adapter (free tier, very fast). OpenAI-compatible.
import { env } from '../config.js';
import { callOpenAICompatible, type ProviderResponse } from './provider.js';

export async function callCerebras(prompt: string): Promise<ProviderResponse> {
  return callOpenAICompatible({
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: env.ai.cerebras.apiKey(),
    model: env.ai.cerebras.model,
    prompt,
  });
}
