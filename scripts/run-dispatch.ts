// CLI: dispatcher — drive enrichment for any job that isn't fully enriched yet, then fire
// instant (High-priority) notifications. Runs right after ingest (and on a periodic cron).
//   npm run dispatch
import { enrichPending } from '../lib/enrich/pipeline.js';
import { notifyNew } from '../services/notify/notify.js';

(async () => {
  const enriched = await enrichPending();
  const notified = await notifyNew();
  console.log('Dispatch complete:', { ...enriched, ...notified });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
