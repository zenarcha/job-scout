// Resume-match stage — scores the job 0-100 against the active resume version.
// Skips gracefully (no error) when no resume has been seeded yet.
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';

export async function runResumeMatch(jobId: string): Promise<void> {
  const { data: job, error } = await db().from('jobs').select('jd_clean').eq('id', jobId).single();
  if (error || !job) throw new Error(`resume_match: job ${jobId} not found`);

  const { data: resume } = await db()
    .from('resume_versions')
    .select('id, text')
    .eq('is_active', true)
    .maybeSingle();

  if (!resume) {
    await emitEvent({
      jobId,
      type: 'ResumeMatchDone',
      stage: 'resume_match',
      payload: { skipped: true, reason: 'no active resume version' },
    });
    return;
  }

  const res = await AIService.matchResume({ jd: job.jd_clean ?? '', resume: resume.text });
  await recordAiUsage({ jobId, stage: 'resume_match', meta: res.meta });

  await writeEnrichment({
    jobId,
    stage: 'resume_match',
    fields: { resume_match_score: res.resume_match_score, resume_version_id: resume.id },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    rawOutput: res.meta.raw,
  });

  await emitEvent({
    jobId,
    type: 'ResumeMatchDone',
    stage: 'resume_match',
    payload: { score: res.resume_match_score },
  });
}
