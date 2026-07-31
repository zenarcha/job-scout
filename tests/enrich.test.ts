// Offline checks for deterministic enrichment logic (salary parser). No DB / no AI.
//   npx tsx tests/enrich.test.ts
import assert from 'node:assert/strict';
import { parseSalary } from '../lib/enrich/salary.js';

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

check('parses ₹ LPA range', () => {
  const s = parseSalary('Compensation: ₹18–24 LPA plus equity');
  assert.equal(s.salary_status, 'stated');
  assert.equal(s.salary_currency, 'INR');
  assert.equal(s.salary_period, 'lpa');
  assert.equal(s.salary_min, 18);
  assert.equal(s.salary_max, 24);
});

check('parses single LPA', () => {
  const s = parseSalary('Up to 20 lakhs per annum');
  assert.equal(s.salary_status, 'stated');
  assert.equal(s.salary_min, 20);
  assert.equal(s.salary_max, 20);
});

check('parses $k range', () => {
  const s = parseSalary('Base salary $120k-$160k depending on experience');
  assert.equal(s.salary_currency, 'USD');
  assert.equal(s.salary_period, 'year');
  assert.equal(s.salary_min, 120000);
  assert.equal(s.salary_max, 160000);
});

check('parses full-number USD range', () => {
  const s = parseSalary('$120,000 - $160,000 USD');
  assert.equal(s.salary_min, 120000);
  assert.equal(s.salary_max, 160000);
});

check('unknown when not stated', () => {
  const s = parseSalary('Competitive salary and great benefits.');
  assert.equal(s.salary_status, 'unknown');
  assert.equal(s.salary_min, null);
});

console.log(failures === 0 ? '\nAll enrichment checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
