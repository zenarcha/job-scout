// Skills stage — extracts normalized skills[] (feeds the skills-gap view).
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';

export async function runSkills(jobId: string): Promise<void> {
  const { data: job, error } = await db().from('jobs').select('jd_clean').eq('id', jobId).single();
  if (error || !job) throw new Error(`skills: job ${jobId} not found`);

  const res = await AIService.extractSkills({ jd: job.jd_clean ?? '' });
  await recordAiUsage({ jobId, stage: 'skills', meta: res.meta });

  await writeEnrichment({
    jobId,
    stage: 'skills',
    fields: { skills: res.skills },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    rawOutput: res.meta.raw,
  });

  await emitEvent({ jobId, type: 'SkillsDone', stage: 'skills', payload: { count: res.skills.length } });
}
