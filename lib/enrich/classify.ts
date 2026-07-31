// Classify stage — tags a job (remote/tech/AI/business-model/IIT-IIM) with confidence.
// Confidence < 0.6 flags the row for the manual review queue.
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';

export async function runClassify(jobId: string): Promise<void> {
  const { data: job, error } = await db()
    .from('jobs')
    .select('role_title, company, jd_clean, recruiter_name, recruiter_email, hiring_manager')
    .eq('id', jobId)
    .single();
  if (error || !job) throw new Error(`classify: job ${jobId} not found`);

  const res = await AIService.classify({
    roleTitle: job.role_title ?? '',
    company: job.company ?? '',
    jd: job.jd_clean ?? '',
  });
  await recordAiUsage({ jobId, stage: 'classify', meta: res.meta });

  const needsReview = res.confidence < 0.6;
  await writeEnrichment({
    jobId,
    stage: 'classify',
    fields: {
      remote_type: res.remote_type,
      is_technical: res.is_technical,
      technical_depth: res.technical_depth,
      is_ai: res.is_ai,
      business_model: res.business_model,
      institute_requirement: res.institute_requirement,
    },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    confidence: res.confidence,
    needsReview,
    rawOutput: res.meta.raw,
  });

  // Backfill recruiter contact onto the job ONLY when currently empty (never overwrite source).
  const patch: Record<string, string> = {};
  if (!job.recruiter_name && res.recruiter_name) patch.recruiter_name = res.recruiter_name;
  if (!job.recruiter_email && res.recruiter_email) patch.recruiter_email = res.recruiter_email;
  if (!job.hiring_manager && res.hiring_manager) patch.hiring_manager = res.hiring_manager;
  if (Object.keys(patch).length) await db().from('jobs').update(patch).eq('id', jobId);

  await emitEvent({
    jobId,
    type: 'ClassificationDone',
    stage: 'classify',
    payload: { confidence: res.confidence, needsReview },
  });
}
