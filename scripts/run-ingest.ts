// CLI: ingest postings from a local JSON file or an Apify run id.
//   npm run ingest -- --file tests/fixtures/sample-linkedin.json --source linkedin
//   npm run ingest -- --run <APIFY_RUN_ID> --source linkedin
import { readFile } from 'node:fs/promises';
import { fetchRunDataset, mapApifyItem } from '../lib/discovery/apify.js';
import { ingestPostings } from '../services/discovery/ingest.js';
import type { RawPosting } from '../lib/types.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function looksLikeRawPosting(x: any): x is RawPosting {
  return x && typeof x.externalId === 'string' && typeof x.source === 'string';
}

async function main() {
  const source = arg('source') ?? 'linkedin';
  const file = arg('file');
  const runId = arg('run');

  let postings: RawPosting[] = [];

  if (file) {
    const items = JSON.parse(await readFile(file, 'utf8'));
    postings = (Array.isArray(items) ? items : [items])
      .map((it: any) => (looksLikeRawPosting(it) ? it : mapApifyItem(it, source)))
      .filter((p): p is RawPosting => p !== null);
  } else if (runId) {
    const { items } = await fetchRunDataset(runId);
    postings = items.map((it) => mapApifyItem(it, source)).filter((p): p is RawPosting => p !== null);
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
