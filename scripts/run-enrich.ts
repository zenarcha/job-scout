// CLI: run enrichment.
//   npm run enrich -- --job <jobId>              # full pipeline for one job
//   npm run enrich -- --job <jobId> --stage classify   # single stage (retry)
//   npm run enrich -- --all                      # enrich all pending jobs
import { enrichJob, enrichPending, STAGE_RUNNERS } from '../lib/enrich/pipeline.js';
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
    console.log('Enriching pending jobs…', await enrichPending());
    return;
  }
  if (!jobId) {
    console.error('Provide --job <jobId> [--stage <stage>] or --all');
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
