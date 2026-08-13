// CLI: run enrichment.
//   npm run enrich -- --job <jobId>              # full pipeline for one job
//   npm run enrich -- --job <jobId> --stage classify   # single stage (retry)
//   npm run enrich -- --all                      # Priority 1 (junior full pipeline),
//                                                 # then Priority 2 (senior remote-only
//                                                 # check, D-136) — sequential, not
//                                                 # interleaved; Priority 1 always
//                                                 # finishes first
//   npm run enrich -- --parked                   # retry jobs that gave up (D-101)
//   npm run enrich -- --remote-check              # Priority 2 standalone (D-136)
import {
  enrichJob, enrichPending, enrichParked, enrichRemoteCheckPending, STAGE_RUNNERS,
} from '../lib/enrich/pipeline.js';
import type { EnrichStage } from '../lib/types.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const jobId = arg('job');
  const stage = arg('stage') as EnrichStage | undefined;

  if (has('all')) {
    console.log('Enriching pending jobs (Priority 1 — junior titles, full pipeline)…', await enrichPending());
    console.log('Remote-checking senior-titled jobs (Priority 2 — D-136)…', await enrichRemoteCheckPending());
    return;
  }
  // D-101's on-demand retry. Until the dashboard exists this is where the button
  // lives; when it does exist it calls enrichParked() rather than its own query.
  if (has('parked')) {
    console.log('Retrying parked jobs (ignoring the 24h cooling-off)…', await enrichParked());
    return;
  }
  // D-136 standalone: run Priority 2 on its own, without also running Priority 1.
  if (has('remote-check')) {
    console.log('Remote-checking senior-titled jobs (Priority 2 — D-136)…', await enrichRemoteCheckPending());
    return;
  }
  if (!jobId) {
    console.error('Provide --job <jobId> [--stage <stage>], --all, --parked, or --remote-check');
    process.exit(1);
  }
  if (stage) {
    if (!STAGE_RUNNERS[stage]) {
      console.error(`Unknown stage: ${stage}. One of: ${Object.keys(STAGE_RUNNERS).join(', ')}`);
      process.exit(1);
    }
    await STAGE_RUNNERS[stage](jobId);
    console.log(`Stage ${stage} done for ${jobId}`);
    return;
  }
  console.log('Enrich result:', await enrichJob(jobId));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
