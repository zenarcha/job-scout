// Event bus (append-only job_events) + AI usage/cost recording.
// Stages emit events; the dispatcher routes them. Every AI call records usage.
import { db } from './db.js';
import type { AiMeta } from './types.js';

export type EventType =
  | 'JobCreated'
  | 'ClassificationDone'
  | 'ResumeMatchDone'
  | 'SkillsDone'
  | 'SalaryParsed'
  | 'RecommendationDone'
  | 'QualificationDone' // reserved for the future Qualification stage (Phase 2); unused now
  | 'NotificationSent'
  | 'StageFailed';

export async function emitEvent(input: {
  jobId: string | null;
  type: EventType;
  stage?: string;
  payload?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  await db().from('job_events').insert({
    job_id: input.jobId,
    type: input.type,
    stage: input.stage ?? null,
    payload: input.payload ?? {},
    error: input.error ?? null,
  });
}

// Rough per-provider cost estimate (USD / 1M tokens). Free tiers => ~0, but we track
// tokens so quota/cost is visible if you ever move off free.
const RATE: Record<string, { in: number; out: number }> = {
  gemini: { in: 0, out: 0 },
  cerebras: { in: 0, out: 0 },
  grok: { in: 0, out: 0 },
};

export async function recordAiUsage(input: { jobId: string | null; stage: string; meta: AiMeta }): Promise<void> {
  const rate = RATE[input.meta.provider] ?? { in: 0, out: 0 };
  const cost =
    (input.meta.usage.prompt_tokens / 1_000_000) * rate.in +
    (input.meta.usage.completion_tokens / 1_000_000) * rate.out;

  await db().from('ai_usage').insert({
    job_id: input.jobId,
    stage: input.stage,
    provider: input.meta.provider,
    model: input.meta.model,
    prompt_version: input.meta.promptVersion,
    prompt_tokens: input.meta.usage.prompt_tokens,
    completion_tokens: input.meta.usage.completion_tokens,
    est_cost_usd: cost,
  });

  // Incremental daily rollup (read-modify-write; fine at single-user volume).
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await db().from('rollup_ai_cost').select('*').eq('day', day).maybeSingle();
  await db().from('rollup_ai_cost').upsert({
    day,
    requests: (data?.requests ?? 0) + 1,
    prompt_tokens: (data?.prompt_tokens ?? 0) + input.meta.usage.prompt_tokens,
    completion_tokens: (data?.completion_tokens ?? 0) + input.meta.usage.completion_tokens,
    est_cost_usd: Number(data?.est_cost_usd ?? 0) + cost,
  });
}
