// Event bus (append-only job_events) + AI usage/cost recording.
// Stages emit events; the dispatcher routes them. Every AI call records usage.
import { db } from './db.js';
import type { AiMeta } from './types.js';

export type EventType =
  | 'JobCreated'
  | 'JobDropped'         // ingest pre-filter rejected it; the row is still persisted (D-72)
  | 'JobUndropped'       // D-104: a narrowed filter disagreed with an earlier drop, reason cleared
  | 'ClassificationDone'
  | 'GeoRecheckDone'     // D-75: second-pass geo verdict on an assumed-eligible job
  | 'RemoteCheckDone'    // D-136: standalone remote-only pass for senior-titled jobs
  | 'SkillsDone'
  | 'SalaryParsed'
  | 'RecommendationDone'
  | 'NotificationSent'
  | 'FeedbackReceived'   // D-77: a 👍/👎 tap arrived via the Telegram poller
  | 'EnrichmentSkipped'  // D-98: the job is a duplicate or was dropped at ingest — no stage ran
  // D-112: the job is real and the run proceeded, but ONE stage declined because its
  // inputs were absent. Distinct from EnrichmentSkipped (whole job, decided upfront)
  // and from StageFailed (the stage tried and broke). A skipped stage is not a
  // failure — same reading as geo_recheck declining under D-75.
  | 'StageSkipped'
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

// `enrichmentId` ties the cost to the exact attempt that spent it — without it two
// re-classifications of the same job are indistinguishable in the log. Callers must
// therefore write the enrichment row FIRST and pass the id back in here.
export async function recordAiUsage(input: {
  jobId: string | null;
  enrichmentId?: string | null;
  stage: string;
  meta: AiMeta;
}): Promise<void> {
  const rate = RATE[input.meta.provider] ?? { in: 0, out: 0 };
  const cost =
    (input.meta.usage.prompt_tokens / 1_000_000) * rate.in +
    (input.meta.usage.completion_tokens / 1_000_000) * rate.out;

  await db().from('ai_usage').insert({
    job_id: input.jobId,
    enrichment_id: input.enrichmentId ?? null,
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
