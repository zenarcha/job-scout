// Enrichment orchestrator. Runs stages in order; each stage is independently retryable and
// a failure in one is captured (StageFailed) without aborting the rest.
//
// `geo_recheck` runs immediately after `classify` because it reads classify's output
// to decide whether it should run at all. `recommend` runs last so it can read
// everything else. `resume_match` is gone — D-37/D-38 moved matching to the
// resume-builder module and deferred it to v2.
//
// D-136: `remote_check` is registered in STAGE_RUNNERS (for manual `--job <id> --stage
// remote_check` dispatch) but deliberately EXCLUDED from ORDER. ORDER is the
// junior-title full pipeline D-133 gates via `v_enrich_pending` — adding remote_check
// there would make `enrichJob` implicitly branch on title again, exactly the coupling
// D-133 was written to keep out of it. Senior-titled jobs get remote_check through a
// fully separate path below (`runRemoteCheckJob`/`enrichRemoteCheckPending`), so the
// junior pipeline stays provably untouched.
import { db } from '../db.js';
import { emitEvent } from '../events.js';
import type { EnrichStage } from '../types.js';
import { runClassify } from './classify.js';
import { runGeoRecheck } from './geoRecheck.js';
import { runSkills } from './skills.js';
import { runSalary } from './salary.js';
import { runRecommend } from './recommend.js';
import { runRemoteCheck } from './remoteCheck.js';
import { isGroqExhausted } from '../ai/groqQuota.js';

export const STAGE_RUNNERS: Record<EnrichStage, (jobId: string) => Promise<void>> = {
  classify: runClassify,
  geo_recheck: runGeoRecheck,
  skills: runSkills,
  salary: runSalary,
  recommend: runRecommend,
  remote_check: runRemoteCheck,
};

// Exported so a test can assert `remote_check` never rejoins this list by accident.
export const ORDER: EnrichStage[] = ['classify', 'geo_recheck', 'skills', 'salary', 'recommend'];

export interface EnrichRunResult {
  ok: EnrichStage[];
  failed: EnrichStage[];
  skipped?: SkipReason;
}

// Reasons a job is deliberately not enriched. Both are cases where the job is
// absent from `v_jobs_enriched`, which `recommend` reads with `.single()` —
// without these guards a manual `--job <id>` on such a job dies with an opaque
// no-rows error four stages in, having already spent AI quota on the first three.
type SkipReason = 'non_canonical' | 'dropped_at_ingest';

export async function enrichJob(jobId: string): Promise<EnrichRunResult> {
  const { data: job, error } = await db()
    .from('jobs')
    .select('id, canonical_job_id, dropped_reason')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`enrichJob: reading job ${jobId} failed: ${error.message}`);
  if (!job) throw new Error(`enrichJob: job ${jobId} not found`);

  // D-98: a duplicate is never enriched. Cross-source dedup already grouped it
  // behind a canonical row; enriching it burns a second helping of AI quota and
  // produces a *second, different* verdict for one job (measured on the fixture
  // pair: priority med vs low). The canonical row is the one that gets judged.
  //
  // D-72: a posting the ingest pre-filter rejected is kept for auditability but
  // must cost nothing. `enrichPending` already excludes both; these guards cover
  // the manual `--job` path, which bypasses it.
  const skipped: SkipReason | undefined = job.canonical_job_id
    ? 'non_canonical'
    : job.dropped_reason
      ? 'dropped_at_ingest'
      : undefined;

  if (skipped) {
    await emitEvent({
      jobId,
      type: 'EnrichmentSkipped',
      payload: { reason: skipped, canonical_job_id: job.canonical_job_id ?? null },
    });
    return { ok: [], failed: [], skipped };
  }

  const startedAt = new Date().toISOString();
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

  // D-99: persist the outcome instead of discarding it. This is the only record
  // of whether a run actually worked — `v_enrich_pending` reads it to decide what
  // to retry. A stage that declined to run (geo_recheck on a job that was never
  // assumed-eligible, D-75) lands in `ok`, never in `failed`, so a deliberate skip
  // can never be mistaken for a failure.
  //
  // If this insert itself fails the job simply stays pending and gets retried —
  // the safe direction. The old behaviour failed the other way: it called a job
  // done and never looked at it again.
  const { error: runErr } = await db().from('enrich_runs').insert({
    job_id: jobId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok_stages: ok,
    failed_stages: failed,
  });
  if (runErr) {
    await emitEvent({
      jobId,
      type: 'StageFailed',
      stage: 'enrich_run_record',
      error: `enrich_runs insert failed: ${runErr.message}`,
    });
  }

  return { ok, failed };
}

// Enrich everything still outstanding. `v_enrich_pending` is the single authority
// on what that means — it applies D-72 (dropped postings cost no quota), D-98
// (duplicates are never enriched) and D-99 (a run that failed comes back) in one
// predicate, so this function has no completion logic of its own to drift.
//
// This replaces a check that asked "does an active `recommend` row exist?".
// `recommend` is a deterministic in-code rule that succeeds even when every AI
// stage failed, so during the gemini-2.5-flash retirement it reported jobs as
// finished while they held no classification at all, and every retry was a
// silent no-op (D-99).
export async function enrichPending(limit = 100): Promise<{ processed: number }> {
  const { data: pending, error } = await db()
    .from('v_enrich_pending')
    .select('id')
    .order('first_seen_at', { ascending: true })
    .limit(limit);
  // Fail loudly. The previous version ignored the query error and returned
  // `processed: 0`, which is indistinguishable from "nothing to do" — the same
  // silent-success shape as the defect this function was rewritten to fix.
  if (error) throw new Error(`enrichPending: querying v_enrich_pending failed: ${error.message}`);

  let processed = 0;
  for (const j of pending ?? []) {
    await enrichJob(j.id as string);
    processed++;
  }
  return { processed };
}

// D-101's on-demand retry: enrich everything that has exhausted its retry budget,
// ignoring the 24-hour cooling-off. `v_enrich_parked` gets a job back on its own
// eventually; this is for when Sakshi already knows the provider is back and does
// not want to wait it out. She chose "why not both?" over picking one.
//
// Deliberately a separate function rather than a flag on enrichPending: the two
// answer different questions ("what is outstanding" vs. "what gave up"), and
// v_enrich_parked is the view that makes giving up visible in the first place.
// The dashboard's retry button calls this rather than reimplementing it.
export async function enrichParked(limit = 100): Promise<{ processed: number }> {
  const { data: parked, error } = await db()
    .from('v_enrich_parked')
    .select('id')
    .order('last_attempt_at', { ascending: true })
    .limit(limit);
  // Same loud failure as enrichPending — a swallowed query error here would
  // report "0 parked jobs", which is indistinguishable from a healthy feed.
  if (error) throw new Error(`enrichParked: querying v_enrich_parked failed: ${error.message}`);

  let processed = 0;
  for (const j of parked ?? []) {
    await enrichJob(j.id as string);
    processed++;
  }
  return { processed };
}

// D-136 — Priority 2: senior-titled jobs' standalone remote-only check.
//
// A trimmed sibling of enrichJob, not a parameterized reuse of it: enrichJob's ORDER
// loop and enrich_runs bookkeeping are what the junior full pipeline's retry/parking
// logic depends on, and this stage is a single, run-once check with different
// semantics (v_remote_check_pending excludes jobs that already have an active
// remote_check row — see supabase/migrations/0007 — where the junior pipeline reruns
// stages on retry regardless of prior success). Keeping this separate means the
// already-working junior path is provably unaffected by this addition.
export async function runRemoteCheckJob(jobId: string): Promise<EnrichRunResult> {
  const { data: job, error } = await db()
    .from('jobs')
    .select('id, canonical_job_id, dropped_reason')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`runRemoteCheckJob: reading job ${jobId} failed: ${error.message}`);
  if (!job) throw new Error(`runRemoteCheckJob: job ${jobId} not found`);

  const skipped: SkipReason | undefined = job.canonical_job_id
    ? 'non_canonical'
    : job.dropped_reason
      ? 'dropped_at_ingest'
      : undefined;

  if (skipped) {
    await emitEvent({
      jobId,
      type: 'EnrichmentSkipped',
      payload: { reason: skipped, canonical_job_id: job.canonical_job_id ?? null },
    });
    return { ok: [], failed: [], skipped };
  }

  const startedAt = new Date().toISOString();
  const ok: EnrichStage[] = [];
  const failed: EnrichStage[] = [];
  try {
    await runRemoteCheck(jobId);
    ok.push('remote_check');
  } catch (err: any) {
    failed.push('remote_check');
    await emitEvent({ jobId, type: 'StageFailed', stage: 'remote_check', error: String(err?.message ?? err) });
  }

  const { error: runErr } = await db().from('enrich_runs').insert({
    job_id: jobId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok_stages: ok,
    failed_stages: failed,
  });
  if (runErr) {
    await emitEvent({
      jobId,
      type: 'StageFailed',
      stage: 'enrich_run_record',
      error: `enrich_runs insert failed: ${runErr.message}`,
    });
  }

  return { ok, failed };
}

// Runs remote_check for every senior-titled job outstanding, AFTER Priority 1
// (enrichPending) has fully completed for the run — callers (scripts/run-enrich.ts)
// are responsible for that ordering, this function does not enforce it itself.
//
// No quota predictor: this loop simply attempts jobs in order and stops the moment
// isGroqExhausted() is true, relying on lib/ai/groqQuota.ts's exhaustion signal
// (set by lib/ai/groq.ts on a real daily-TPD 429) rather than estimating remaining
// budget in advance. A job that doesn't get to run today just stays in
// v_remote_check_pending for tomorrow's run — same "absent means not-yet, not
// negative" shape as every other retry/parking mechanism in this pipeline.
export async function enrichRemoteCheckPending(limit = 100): Promise<{ processed: number }> {
  const { data: pending, error } = await db()
    .from('v_remote_check_pending')
    .select('id')
    .order('first_seen_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`enrichRemoteCheckPending: querying v_remote_check_pending failed: ${error.message}`);

  let processed = 0;
  for (const j of pending ?? []) {
    await runRemoteCheckJob(j.id as string);
    processed++;
    if (isGroqExhausted()) {
      console.warn(
        `[remote_check] Groq daily quota exhausted after ${processed} job(s) — stopping; ` +
          'remaining jobs stay in v_remote_check_pending for the next run.',
      );
      break;
    }
  }
  return { processed };
}
