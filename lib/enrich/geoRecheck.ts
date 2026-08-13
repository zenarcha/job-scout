// Geo-recheck stage (D-75) — a second, narrow AI pass over jobs that `classify`
// accepted only by its fail-open default.
//
// Runs ONLY where remote_type = 'remote_india' AND geo_explicit = false, i.e. the
// posting never stated its geography and the classifier assumed eligibility. Most
// jobs never get a row here at all.
//
// It writes its OWN versioned row rather than overwriting classify's (D-6/D-9), so
// a wrong override stays traceable and correctable. And per the delivery decision,
// the verdict does NOT gate the notification — an 'ineligible' job is still sent,
// just marked. A false positive costs 30 seconds of reading; a false negative
// costs a role she'd never know existed, and this pass's own accuracy is unmeasured
// until D-71's hand-tagging happens.
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';

export async function runGeoRecheck(jobId: string): Promise<void> {
  const { data: classify } = await db()
    .from('job_enrichments')
    .select('remote_type, geo_explicit')
    .eq('job_id', jobId)
    .eq('stage', 'classify')
    .eq('is_active', true)
    .maybeSingle();

  // Not an assumed-eligible job — nothing to re-check. Writing nothing is
  // deliberate: an absent row means "never needed checking", which is a
  // different fact from "checked and uncertain".
  if (!classify || classify.remote_type !== 'remote_india' || classify.geo_explicit !== false) return;

  const { data: job, error } = await db()
    .from('jobs')
    .select('role_title, company, location, jd_clean')
    .eq('id', jobId)
    .single();
  if (error || !job) throw new Error(`geo_recheck: job ${jobId} not found`);

  const res = await AIService.geoRecheck({
    roleTitle: job.role_title ?? '',
    company: job.company ?? '',
    // The prompt asks the model to weigh "phrasing that presumes a location" — it
    // should be able to see the location while doing so.
    location: job.location ?? null,
    jd: job.jd_clean ?? '',
  });

  const enrichmentId = await writeEnrichment({
    jobId,
    stage: 'geo_recheck',
    fields: {
      geo_verdict: res.geo_verdict,
      geo_verdict_reasoning: res.reasoning,
    },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    rawOutput: res.meta.raw,
  });

  await recordAiUsage({ jobId, enrichmentId, stage: 'geo_recheck', meta: res.meta });

  await emitEvent({
    jobId,
    type: 'GeoRecheckDone',
    stage: 'geo_recheck',
    payload: { verdict: res.geo_verdict },
  });
}
