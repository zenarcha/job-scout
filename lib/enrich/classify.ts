// Classify stage — the broad triage call. Tags remote eligibility (+ whether that
// eligibility was stated or assumed, D-73), technicality, AI focus, business model,
// domain, and which parts of Sakshi's background connect (D-67).
//
// `institute_requirement` is NOT part of this call: D-57 moved it to a regex.
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';
import { parseInstituteRequirement } from './instituteRequirement.js';
import { buildProfileBlurb } from './profileBlurb.js';
import { confirmRemoteCompany } from '../discovery/remoteCompanies.js';
import { bucketExperience } from './experience.js';

const VOCAB_KEY = 'background_match_vocabulary';

// D-67's closed vocabulary lives in app_config, not hardcoded here, so adding a
// sixth tag (or promoting a D-68 suggestion) is a data edit rather than a deploy.
async function loadBackgroundVocabulary(): Promise<string[]> {
  const { data } = await db().from('app_config').select('value').eq('key', VOCAB_KEY).maybeSingle();
  const value = data?.value;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function runClassify(jobId: string): Promise<void> {
  const { data: job, error } = await db()
    .from('jobs')
    .select(
      'role_title, company, company_slug, posting_url, location, jd_clean, recruiter_name, recruiter_linkedin, recruiter_email, hiring_manager',
    )
    .eq('id', jobId)
    .single();
  if (error || !job) throw new Error(`classify: job ${jobId} not found`);

  const [{ data: profile }, backgroundVocabulary] = await Promise.all([
    db().from('profile').select('summary, experience, education').eq('id', 1).maybeSingle(),
    loadBackgroundVocabulary(),
  ]);

  const res = await AIService.classify({
    roleTitle: job.role_title ?? '',
    company: job.company ?? '',
    // v5: the posting's own structured location. Captured at ingest since day one and
    // shown on the dashboard, but never given to the model until now — which is why an
    // on-site Bengaluru role could come back `remote_india` (D-121).
    location: job.location ?? null,
    jd: job.jd_clean ?? '',
    profileBlurb: buildProfileBlurb(profile),
    backgroundVocabulary,
  });

  const needsReview = res.confidence < 0.6;
  // Write FIRST so the usage row can point at this exact attempt (see recordAiUsage).
  const enrichmentId = await writeEnrichment({
    jobId,
    stage: 'classify',
    fields: {
      remote_type: res.remote_type,
      geo_explicit: res.geo_explicit,
      is_technical: res.is_technical,
      technical_depth: res.technical_depth,
      is_ai: res.is_ai,
      business_model: res.business_model,
      domain: res.domain,
      background_match: res.background_match,
      background_match_suggested: res.background_match_suggested,
      // D-92 / D-94 — both ride this call rather than adding a second one.
      role_summary: res.role_summary,
      years_experience_min: res.years_experience_min,
      years_experience_max: res.years_experience_max,
      // Deterministic, not from the model (D-57).
      institute_requirement: parseInstituteRequirement(job.jd_clean),
    },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    confidence: res.confidence,
    needsReview,
    rawOutput: res.meta.raw,
  });

  await recordAiUsage({ jobId, enrichmentId, stage: 'classify', meta: res.meta });

  // Backfill recruiter contact onto the job ONLY when currently empty (never overwrite source).
  const patch: Record<string, string> = {};
  if (!job.recruiter_name && res.recruiter_name) patch.recruiter_name = res.recruiter_name;
  if (!job.recruiter_email && res.recruiter_email) patch.recruiter_email = res.recruiter_email;
  if (!job.hiring_manager && res.hiring_manager) patch.hiring_manager = res.hiring_manager;
  if (Object.keys(patch).length) await db().from('jobs').update(patch).eq('id', jobId);

  // D-139: confirmation now fires HERE — after the AI has actually determined
  // remote_type — instead of at ingest, before anything was known. D-140: seniority is
  // snapshotted (no live join to `jobs`) so the tracker's junior/senior filter works off
  // the catalog alone; bucketed the same way build-dashboard.ts's card view does.
  if (res.remote_type === 'remote_india') {
    const evidenceSeniority = bucketExperience(res.years_experience_min);
    await confirmRemoteCompany({
      company: job.company,
      companySlug: job.company_slug,
      postingUrl: job.posting_url,
      roleTitle: job.role_title,
      recruiterName: job.recruiter_name ?? res.recruiter_name ?? null,
      recruiterLinkedin: job.recruiter_linkedin ?? null,
      recruiterEmail: job.recruiter_email ?? res.recruiter_email ?? null,
      hiringManager: job.hiring_manager ?? res.hiring_manager ?? null,
      evidenceSeniority,
    });
  }

  await emitEvent({
    jobId,
    type: 'ClassificationDone',
    stage: 'classify',
    payload: { confidence: res.confidence, needsReview, geoExplicit: res.geo_explicit },
  });
}
