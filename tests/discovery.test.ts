// Offline unit checks for the discovery logic (no DB / no network / no credentials).
//   npx tsx tests/discovery.test.ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapFantasticJobsItem } from '../lib/discovery/apify.js';
import { isObviouslyNonRemote, normalize } from '../lib/discovery/normalize.js';
import { normalizeTitle, slugify } from '../lib/text.js';
import { cleanJd } from '../lib/discovery/cleanJd.js';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e: any) {
    failures++;
    console.error(`✗ ${name}\n   ${e.message}`);
  }
}

check('slugify', () => {
  assert.equal(slugify('Acme AI, Inc.'), 'acme-ai-inc');
  assert.equal(slugify(''), 'unknown');
});

check('normalizeTitle collapses punctuation/case', () => {
  assert.equal(normalizeTitle('Product Manager, AI Platform'), 'product manager ai platform');
});

check('cleanJd strips HTML + keeps bullets', () => {
  const t = cleanJd('<p>Hello</p><ul><li>SQL</li><li>Python</li></ul>');
  assert.ok(t.includes('Hello'));
  assert.ok(t.includes('• SQL'));
  assert.ok(!t.includes('<li>'));
});

// D-137: these run against the fantastic-jobs actor's real record shape (D-121's source),
// not the retired curious_coder shape. Field names in the fixture are copied from real
// captured output (`samples/fantastic-jobs-remote-india.json`), per D-121's own rule:
// verify against a run, don't trust the docs.
const items = JSON.parse(await readFile(new URL('./fixtures/sample-fantastic-jobs.json', import.meta.url), 'utf8'));

check('map + normalize remote-India PM', () => {
  const raw = mapFantasticJobsItem(items[0], 'linkedin');
  assert.ok(raw);
  const job = normalize(raw!);
  assert.equal(job.companySlug, 'acme-ai');
  assert.equal(job.parsed.remote_signal, true);
  assert.equal(job.parsed.india_signal, true);
  assert.equal(isObviouslyNonRemote(job), false);
});

check('onsite role is dropped', () => {
  const raw = mapFantasticJobsItem(items[1], 'linkedin');
  const job = normalize(raw!);
  assert.equal(isObviouslyNonRemote(job), true);
});

check('ISO postedAt is passed through unchanged', () => {
  const raw = mapFantasticJobsItem(items[0], 'linkedin');
  assert.equal(raw!.postedAt, '2026-07-09T10:00:00.000');
});

check('postedAt falls back to date_created when date_posted is absent', () => {
  // The mapper implements this fallback; nothing exercised it before D-137.
  const raw = mapFantasticJobsItem(items[1], 'linkedin');
  assert.equal(raw!.postedAt, '2026-07-03T08:26:40.000');
});

check('no id and no linkedin_id → null (cannot dedup, D-8)', () => {
  assert.equal(mapFantasticJobsItem(items[3], 'linkedin'), null);
});

check('LinkedIn vs Greenhouse dupes share dedup key', () => {
  const a = normalize(mapFantasticJobsItem(items[0], 'linkedin')!);
  const b = normalize(mapFantasticJobsItem(items[2], 'greenhouse')!);
  assert.equal(a.companySlug, b.companySlug);
  assert.equal(a.parsed.norm_title, b.parsed.norm_title);
  assert.equal(b.sourceReliability, 'high'); // greenhouse > linkedin
});

console.log(failures === 0 ? '\nAll discovery checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
