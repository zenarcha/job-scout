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

    if (env.ingest.remoteFilter() && isObviouslyNonRemote(job)) {
      summary.droppedNonRemote++;
      continue;
    }

    const row = {
      source: job.source,
      external_id: job.externalId,
      source_reliability: job.sourceReliability,
      company: job.company ?? null,
      company_slug: job.companySlug,
      role_title: job.roleTitle ?? null,
      apply_url: job.applyUrl ?? null,
      location: job.location ?? null,
      posted_at: parseDate(job.postedAt),
      jd_raw: job.jdRaw ?? null,
      jd_clean: job.jdClean,
      parsed: job.parsed,
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

    if (insertedRows && insertedRows.length > 0) {
      const jobId = insertedRows[0]!.id as string;
      summary.inserted++;
      await linkCanonical({
        id: jobId,
        companySlug: job.companySlug,
        normTitle: String(job.parsed.norm_title ?? ''),
        reliability: job.sourceReliability,
      });
      // Ensure a tracking row exists so the dashboard/pipeline can attach state.
      await db().from('job_tracking').upsert({ job_id: jobId }, { onConflict: 'job_id', ignoreDuplicates: true });
      await emitEvent({ jobId, type: 'JobCreated', stage: 'ingest', payload: { source: job.source } });
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
