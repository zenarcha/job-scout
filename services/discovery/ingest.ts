// Discovery Service — ingest raw postings into immutable `jobs`.
// Idempotent (per Apify run + per (source,external_id)), stores raw+clean JD,
// assigns source reliability, links cross-source canonical, emits JobCreated.
import { db } from '../../lib/db.js';
import { env } from '../../lib/config.js';
import { emitEvent } from '../../lib/events.js';
import { linkCanonical } from '../../lib/discovery/dedup.js';
import { isObviouslyNonRemote, normalize } from '../../lib/discovery/normalize.js';
import type { RawPosting } from '../../lib/types.js';

export interface IngestSummary {
  received: number;
  inserted: number;
  duplicates: number;
  droppedNonRemote: number;
  skippedRun: boolean;
}

function parseDate(input?: string): string | null {
  if (!input) return null;
  if (/^\d{10,13}$/.test(input)) {
    const ms = input.length === 13 ? Number(input) : Number(input) * 1000;
    return new Date(ms).toISOString();
  }
  const t = Date.parse(input);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function ingestPostings(
  postings: RawPosting[],
  opts: { runId?: string; source?: string } = {},
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    received: postings.length,
    inserted: 0,
    duplicates: 0,
    droppedNonRemote: 0,
    skippedRun: false,
  };

  // Idempotency: a re-delivered Apify webhook (same run id) is a no-op.
  if (opts.runId) {
    const { data: seen } = await db().from('processed_runs').select('run_id').eq('run_id', opts.runId).maybeSingle();
    if (seen) return { ...summary, skippedRun: true };
  }

  for (const raw of postings) {
    const job = normalize(raw);

    // D-72: a rejected posting is PERSISTED with a reason rather than discarded.
    // The old `continue` made the pre-filter's own false-negative rate invisible —
    // there was no way to ask "what did the regex throw away, and was it right?".
    // Dropped rows are excluded from enrichPending() so they cost no AI quota.
    const droppedReason =
      env.ingest.remoteFilter() && isObviouslyNonRemote(job)
        ? 'ingest_filter:obviously_non_remote'
        : null;
    if (droppedReason) summary.droppedNonRemote++;

    const row = {
      source: job.source,
      external_id: job.externalId,
      source_reliability: job.sourceReliability,
      company: job.company ?? null,
      company_slug: job.companySlug,
      role_title: job.roleTitle ?? null,
      posting_url: job.postingUrl ?? null,
      apply_url: job.applyUrl ?? null,
      location: job.location ?? null,
      posted_at: parseDate(job.postedAt),
      jd_raw: job.jdRaw ?? null,
      jd_clean: job.jdClean,
      parsed: job.parsed,
      dropped_reason: droppedReason,
      recruiter_name: job.recruiterName ?? null,
      recruiter_linkedin: job.recruiterLinkedin ?? null,
      recruiter_email: job.recruiterEmail ?? null,
      hiring_manager: job.hiringManager ?? null,
    };

    // ignoreDuplicates: inserted rows come back; conflicts return empty.
    const { data: insertedRows, error } = await db()
      .from('jobs')
      .upsert(row, { onConflict: 'source,external_id', ignoreDuplicates: true })
      .select('id');

    if (error) throw error;

    // D-139/D-142: `remote_companies` confirmation used to happen here, as a by-product
    // of ingest — but a posting surviving the weak location pre-filter is not the same as
    // the AI confirming it's remote. That confirmation now fires from `classify`/
    // `remote_check` once `remote_type` is actually known (see lib/discovery/
    // remoteCompanies.ts). Ingest no longer touches that table at all.

    if (insertedRows && insertedRows.length > 0) {
      const jobId = insertedRows[0]!.id as string;

      if (droppedReason) {
        // Recorded for audit, but not linked into the canonical graph and not
        // announced as a real find.
        await emitEvent({
          jobId,
          type: 'JobDropped',
          stage: 'ingest',
          payload: { source: job.source, reason: droppedReason },
        });
      } else {
        summary.inserted++;
        await linkCanonical({
          id: jobId,
          companySlug: job.companySlug,
          normTitle: String(job.parsed.norm_title ?? ''),
          reliability: job.sourceReliability,
        });
        // D-42: no `job_tracking` row is created here any more — that table moved
        // to the tracker module, which creates rows lazily on first action.
        await emitEvent({ jobId, type: 'JobCreated', stage: 'ingest', payload: { source: job.source } });
      }
    } else {
      // Duplicate: bump freshness only (source data stays immutable).
      summary.duplicates++;
      await db()
        .from('jobs')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('source', job.source)
        .eq('external_id', job.externalId);
    }
  }

  if (opts.runId) {
    await db().from('processed_runs').upsert(
      { run_id: opts.runId, source: opts.source ?? null, item_count: postings.length },
      { onConflict: 'run_id', ignoreDuplicates: true },
    );
  }

  return summary;
}
