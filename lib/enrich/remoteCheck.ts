// Remote-check stage (D-136) — a standalone, cheap remote-only pass for senior-titled
// jobs, which D-133 excludes from the full `classify` call entirely. Reads the job row
// directly (unlike geoRecheck, there is no prior classify row to build on) and writes
// only remote_type/geo_explicit/reasoning via classify's own columns, so the two
// stages' outputs are directly comparable.
//
// No skip-guard here (unlike geoRecheck's `if (!classify...) return`) — eligibility is
// fully decided by the caller's query (`v_remote_check_pending`), not by anything this
// function itself needs to check.
import { db } from '../db.js';
import { AIService, CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent, recordAiUsage } from '../events.js';
import { confirmRemoteCompany } from '../discovery/remoteCompanies.js';

export async function runRemoteCheck(jobId: string): Promise<void> {
  const { data: job, error } = await db()
    .from('jobs')
    .select(
      'role_title, company, company_slug, posting_url, location, jd_clean, recruiter_name, recruiter_linkedin, recruiter_email, hiring_manager',
    )
    .eq('id', jobId)
    .single();
  if (error || !job) throw new Error(`remote_check: job ${jobId} not found`);

  const res = await AIService.remoteCheck({
    roleTitle: job.role_title ?? '',
    company: job.company ?? '',
    location: job.location ?? null,
    jd: job.jd_clean ?? '',
  });

  const enrichmentId = await writeEnrichment({
    jobId,
    stage: 'remote_check',
    fields: {
      remote_type: res.remote_type,
      geo_explicit: res.geo_explicit,
      remote_check_reasoning: res.reasoning,
    },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: res.meta.promptVersion,
    provider: res.meta.provider,
    model: res.meta.model,
    rawOutput: res.meta.raw,
  });

  await recordAiUsage({ jobId, enrichmentId, stage: 'remote_check', meta: res.meta });

  // D-139: confirmation fires here, after the AI has actually determined remote_type —
  // this stage only ever runs on senior-titled jobs (D-133/D-136), so the tracker's
  // seniority snapshot is always 'senior' for a company confirmed via this path.
  // AIService.remoteCheck doesn't return recruiter fields, so evidence comes straight
  // from whatever ingest already stored on the job row.
  if (res.remote_type === 'remote_india') {
    await confirmRemoteCompany({
      company: job.company,
      companySlug: job.company_slug,
      postingUrl: job.posting_url,
      roleTitle: job.role_title,
      recruiterName: job.recruiter_name,
      recruiterLinkedin: job.recruiter_linkedin,
      recruiterEmail: job.recruiter_email,
      hiringManager: job.hiring_manager,
      evidenceSeniority: 'senior',
    });
  }

  await emitEvent({
    jobId,
    type: 'RemoteCheckDone',
    stage: 'remote_check',
    payload: { remoteType: res.remote_type },
  });
}
