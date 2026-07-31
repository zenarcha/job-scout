// Enrichment orchestrator. Runs stages in order; each stage is independently retryable and
// a failure in one is captured (StageFailed) without aborting the rest. `recommend` runs last
// so it can read the other stages' outputs.
import { db } from '../db.js';
import { emitEvent } from '../events.js';
import type { EnrichStage } from '../types.js';
import { runClassify } from './classify.js';
import { runResumeMatch } from './resumeMatch.js';
import { runSkills } from './skills.js';
import { runSalary } from './salary.js';
import { runRecommend } from './recommend.js';

export const STAGE_RUNNERS: Record<EnrichStage, (jobId: string) => Promise<void>> = {
  classify: runClassify,
  resume_match: runResumeMatch,
  skills: runSkills,
  salary: runSalary,
  recommend: runRecommend,
};

const ORDER: EnrichStage[] = ['classify', 'resume_match', 'skills', 'salary', 'recommend'];

export async function enrichJob(jobId: string): Promise<{ ok: EnrichStage[]; failed: EnrichStage[] }> {
  const ok: EnrichStage[] = [];
  const failed: EnrichStage[] = [];
  for (const stage of ORDER) {
    try {
      await STAGE_RUNNERS[stage](jobId);
      ok.push(stage);
    } catch (err: any) {
      failed.push(stage);
      await emitEvent({ jobId, type: 'StageFailed', stage, error: String(err?.message ?? err) });
    }
  }
  return { ok, failed };
}

// Enrich every job that has no active `recommend` row yet (i.e. not fully enriched).
export async function enrichPending(limit = 100): Promise<{ processed: number }> {
  const { data: done } = await db()
    .from('job_enrichments')
    .select('job_id')
    .eq('stage', 'recommend')
    .eq('is_active', true);
  const doneSet = new Set((done ?? []).map((r) => r.job_id as string));

  const { data: jobs } = await db()
    .from('jobs')
    .select('id')
    .order('first_seen_at', { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const j of jobs ?? []) {
    if (doneSet.has(j.id as string)) continue;
    await enrichJob(j.id as string);
    processed++;
  }
  return { processed };
}
