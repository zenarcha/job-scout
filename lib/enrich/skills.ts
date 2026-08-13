// Skills stage — extracts normalized skills[] (feeds the skills-gap view).
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';

export async function runSkills(jobId: string): Promise<void> {
  // ── precondition (D-112's rule, applied here after measurement) ──
  // Since D-117a, `classify` returns skills on its own call and this stage normally
  // just collects the cached result. But when `classify` FAILS there is nothing
  // cached, and `AIService.extractSkills` falls back to its own provider call — for a
  // job that has just proven the provider will not answer.
  //
  // Measured on the 2026-08-07 drain: 24 classify failures produced 24 skills
  // failures, and each doomed job burned up to 10 requests across both stages'
  // retries. Of 80 requests that day only 18 did useful work. A refused request still
  // counts against the daily quota — which is why it was refused.
  //
  // Same shape as `runRecommend`: no active classify row ⇒ do nothing, spend nothing.
  const { data: classify, error: classifyErr } = await db()
    .from('job_enrichments')
    .select('id')
    .eq('job_id', jobId)
    .eq('stage', 'classify')
    .eq('is_active', true)
    .maybeSingle();
  if (classifyErr) throw new Error(`skills: reading classify row for ${jobId} failed: ${classifyErr.message}`);

  if (!classify) {
    // Not a failure — the stage declined. `pipeline.ts` records it in ok_stages, and
    // classify's own failure is what returns the job to v_enrich_pending (D-99).
    await emitEvent({ jobId, type: 'StageSkipped', stage: 'skills', payload: { reason: 'no_classify' } });
    return;
  }

  const { data: job, error } = await db().from('jobs').select('jd_clean').eq('id', jobId).single();
  if (error || !job) throw new Error(`skills: job ${jobId} not found`);

  const res = await AIService.extractSkills({ jd: job.jd_clean ?? '' });

  // Write first so the usage row can point at this exact attempt.
  const enrichmentId = await writeEnrichment({
    jobId,
    stage: 'skills',
    fields: { skills: res.skills },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    rawOutput: res.meta.raw,
  });
  await recordAiUsage({ jobId, enrichmentId, stage: 'skills', meta: res.meta });

  await emitEvent({
    jobId,
    type: 'SkillsDone',
    stage: 'skills',
    payload: { count: res.skills.length, required: res.skills.filter((s) => s.required).length },
  });
}
