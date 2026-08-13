// Framework-agnostic Apify webhook handler. Mount from a Next.js route (Phase 7) or any
// HTTP entrypoint. Validates the shared secret, pulls the run's dataset, and ingests.
//
// Configure the Apify webhook (event: ACTOR.RUN.SUCCEEDED) to POST here with:
//   - header  x-apify-webhook-secret: <APIFY_WEBHOOK_SECRET>
//   - payload template including our source label, e.g. {"source":"linkedin",
//       "resource":{{resource}},"eventData":{{eventData}}}
import { env } from '../../lib/config.js';
import { emitEvent } from '../../lib/events.js';
import { fetchDatasetItems, fetchRunDataset, mapFantasticJobsItem } from '../../lib/discovery/apify.js';
import { ingestPostings } from './ingest.js';
import type { RawPosting } from '../../lib/types.js';

export async function handleApifyWebhook(input: {
  secretHeader?: string;
  body: any;
}): Promise<{ status: number; body: unknown }> {
  const configured = env.apify.webhookSecret();
  if (configured && input.secretHeader !== configured) {
    return { status: 401, body: { error: 'invalid webhook secret' } };
  }

  const body = input.body ?? {};
  const source: string = body.source ?? 'linkedin';
  const runId: string | undefined = body?.resource?.id ?? body?.eventData?.actorRunId;
  const datasetId: string | undefined = body?.resource?.defaultDatasetId;

  try {
    let items: any[];
    if (datasetId) items = await fetchDatasetItems(datasetId);
    else if (runId) items = (await fetchRunDataset(runId)).items;
    else return { status: 400, body: { error: 'no runId or datasetId in payload' } };

    // D-137 BUG FIX, not a rename: this called `mapApifyItem` — the retired curious_coder
    // mapper — from D-121 until now. D-121 switched discovery to fantastic-jobs but never
    // updated this file. The two payloads share no field names, and `mapApifyItem` returns
    // null when it finds no id, so a real fantastic-jobs delivery here would have mapped
    // EVERY item to null, ingested nothing, and still returned HTTP 200. It stayed dormant
    // only because D-134's recurring Apify Schedule was never switched on, so nothing has
    // ever POSTed here for real. Exactly the silent-success shape D-121 exists to record.
    const postings = items
      .map((it) => mapFantasticJobsItem(it, source))
      .filter((p): p is RawPosting => p !== null);

    const summary = await ingestPostings(postings, { runId, source });
    return { status: 200, body: summary };
  } catch (err: any) {
    await emitEvent({ jobId: null, type: 'StageFailed', stage: 'ingest', error: String(err?.message ?? err) });
    return { status: 500, body: { error: String(err?.message ?? err) } };
  }
}
