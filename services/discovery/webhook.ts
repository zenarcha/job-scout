// Framework-agnostic Apify webhook handler. Mount from a Next.js route (Phase 7) or any
// HTTP entrypoint. Validates the shared secret, pulls the run's dataset, and ingests.
//
// Configure the Apify webhook (event: ACTOR.RUN.SUCCEEDED) to POST here with:
//   - header  x-apify-webhook-secret: <APIFY_WEBHOOK_SECRET>
//   - payload template including our source label, e.g. {"source":"linkedin",
//       "resource":{{resource}},"eventData":{{eventData}}}
import { env } from '../../lib/config.js';
import { emitEvent } from '../../lib/events.js';
import { fetchDatasetItems, fetchRunDataset, mapApifyItem } from '../../lib/discovery/apify.js';
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

    const postings = items
      .map((it) => mapApifyItem(it, source))
      .filter((p): p is RawPosting => p !== null);

    const summary = await ingestPostings(postings, { runId, source });
    return { status: 200, body: summary };
  } catch (err: any) {
    await emitEvent({ jobId: null, type: 'StageFailed', stage: 'ingest', error: String(err?.message ?? err) });
    return { status: 500, body: { error: String(err?.message ?? err) } };
  }
}
