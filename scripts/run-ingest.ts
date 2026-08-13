// CLI: ingest postings from a local JSON file or an Apify run id.
//   npm run ingest -- --file tests/fixtures/sample-fantastic-jobs.json --source linkedin
//   npm run ingest -- --run <APIFY_RUN_ID> --source linkedin
//   npm run ingest -- --run <APIFY_RUN_ID> --actor fantastic-jobs
//
// D-121: the mapper is selected explicitly by `--actor` rather than sniffed from the
// payload — guessing which actor produced a record is precisely how the previous source
// returned wrong data while reporting success. Auto-detect is a convenience worth less
// than knowing what you ingested.
//
// D-137: `curious-coder` was removed, so MAPPERS currently has one entry. The map and the
// flag are KEPT rather than inlined — the explicit-selection property above is the point,
// and a second source (ATS pollers, remote-native boards) is already contemplated in
// D-121's rejected-options list.
import { readFile } from 'node:fs/promises';
import { fetchRunDataset, mapFantasticJobsItem } from '../lib/discovery/apify.js';
import { ingestPostings } from '../services/discovery/ingest.js';
import type { RawPosting } from '../lib/types.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function looksLikeRawPosting(x: any): x is RawPosting {
  return x && typeof x.externalId === 'string' && typeof x.source === 'string';
}

const MAPPERS: Record<string, (item: any, source: string) => RawPosting | null> = {
  // D-121's choice: server-side remote filtering, plus ai_remote_location.
  'fantastic-jobs': mapFantasticJobsItem,
};

async function main() {
  const source = arg('source') ?? 'linkedin';
  const file = arg('file');
  const runId = arg('run');
  const actor = arg('actor') ?? 'fantastic-jobs';

  const mapItem = MAPPERS[actor];
  if (!mapItem) {
    console.error(`Unknown --actor "${actor}". One of: ${Object.keys(MAPPERS).join(', ')}`);
    process.exit(1);
  }
  console.log(`Mapping with actor shape: ${actor}`);

  let postings: RawPosting[] = [];

  if (file) {
    const items = JSON.parse(await readFile(file, 'utf8'));
    postings = (Array.isArray(items) ? items : [items])
      .map((it: any) => (looksLikeRawPosting(it) ? it : mapItem(it, source)))
      .filter((p): p is RawPosting => p !== null);
  } else if (runId) {
    const { items } = await fetchRunDataset(runId);
    postings = items.map((it) => mapItem(it, source)).filter((p): p is RawPosting => p !== null);
  } else {
    console.error('Provide --file <path> or --run <apifyRunId>');
    process.exit(1);
  }

  const summary = await ingestPostings(postings, { runId, source });
  console.log('Ingest summary:', JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
