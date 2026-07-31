// Recommendation stage — assigns priority (high/med/low) + "why recommended" chips.
// Runs last: reads the job's current enriched view (match/AI/tech/remote/salary).
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';

export async function runRecommend(jobId: string): Promise<void> {
  const { data: v, error } = await db().from('v_jobs_enriched').select('*').eq('id', jobId).single();
  if (error || !v) throw new Error(`recommend: job ${jobId} not found`);

  const { data: wl } = await db()
    .from('company_watchlist')
    .select('weight')
    .eq('company_slug', v.company_slug)
    .maybeSingle();

  const res = await AIService.recommend({
    roleTitle: v.role_title ?? '',
    company: v.company ?? '',
    companyWeight: wl?.weight ?? 3,
    resumeMatch: v.resume_match_score ?? null,
    isAi: v.is_ai ?? null,
    technicalDepth: v.technical_depth ?? null,
    remoteType: v.remote_type ?? null,
    salaryStated: v.salary_status === 'stated',
  });
  await recordAiUsage({ jobId, stage: 'recommend', meta: res.meta });

  await writeEnrichment({
    jobId,
    stage: 'recommend',
    fields: { priority: res.priority, recommend_reasons: res.reasons },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    rawOutput: res.meta.raw,
  });

  await emitEvent({ jobId, type: 'RecommendationDone', stage: 'recommend', payload: { priority: res.priority } });
}
