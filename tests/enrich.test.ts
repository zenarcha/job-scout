// Offline checks for deterministic enrichment logic (salary parser). No DB / no AI.
//   npx tsx tests/enrich.test.ts
import assert from 'node:assert/strict';
import { parseSalary } from '../lib/enrich/salary.js';
import { computeRecommendation } from '../lib/enrich/recommend.js';
import { parseInstituteRequirement } from '../lib/enrich/instituteRequirement.js';
import { normalizeExperienceRange, bucketExperience } from '../lib/enrich/experience.js';
import { detectRemoteSignal, isObviouslyNonRemote } from '../lib/discovery/normalize.js';
import { isGroqDailyQuotaError } from '../lib/ai/groqQuota.js';
import { ORDER } from '../lib/enrich/pipeline.js';

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

// ── salary_status is three-way (D-73's principle applied to salary) ──────────
// 'not_mentioned' and 'unrecognizable_format' were both 'unknown' before, which
// made the parser's own failure rate impossible to measure.

check('not_mentioned when the posting says nothing about pay', () => {
  const s = parseSalary('We are hiring a Product Manager for our platform team.');
  assert.equal(s.salary_status, 'not_mentioned');
  assert.equal(s.salary_min, null);
});

check('not_mentioned when pay is discussed but no figure is given', () => {
  // "Competitive salary" mentions pay but contains no number — the parser did not
  // fail here, so counting it as a failure would pollute the accuracy metric.
  const s = parseSalary('Competitive salary and great benefits.');
  assert.equal(s.salary_status, 'not_mentioned');
});

check('unrecognizable_format when a figure is present but unparseable', () => {
  const s = parseSalary('Compensation: 25,00,000 - 32,00,000 INR fixed plus variable');
  assert.equal(s.salary_status, 'unrecognizable_format');
  assert.equal(s.salary_min, null);
});

// ── the v1 priority rule (D-62/D-63/D-64) ───────────────────────────────────
// D-71: recommend is arithmetic, so it needs unit tests rather than statistical
// validation. These pin the rule so a future edit can't quietly change ranking.

const base = {
  backgroundMatch: [] as string[],
  isAi: null as string | null,
  technicalDepth: null as number | null,
  instituteRequirement: null as string | null,
  salaryStatus: null as string | null,
  salaryPeriod: null as string | null,
  salaryMax: null as number | null,
};

check('high = background_match AND one other positive signal', () => {
  const r = computeRecommendation({ ...base, backgroundMatch: ['HR Tech'], isAi: 'ai' });
  assert.equal(r.priority, 'high');
  assert.ok(r.reasons.includes('HR Tech'), 'matched tags are listed as reasons');
});

check('med = exactly one signal', () => {
  assert.equal(computeRecommendation({ ...base, backgroundMatch: ['HR Tech'] }).priority, 'med');
  assert.equal(computeRecommendation({ ...base, isAi: 'ai' }).priority, 'med');
});

check('low = no signals', () => {
  assert.equal(computeRecommendation({ ...base }).priority, 'low');
});

check('is_technical is NOT a signal; technical_depth >= 4 downgrades (D-63)', () => {
  const r = computeRecommendation({
    ...base, backgroundMatch: ['HR Tech'], isAi: 'ai', technicalDepth: 5,
  });
  assert.equal(r.priority, 'med', 'high downgraded one level by deep technical depth');
});

check('technical_depth 3 does not downgrade', () => {
  const r = computeRecommendation({
    ...base, backgroundMatch: ['HR Tech'], isAi: 'ai', technicalDepth: 3,
  });
  assert.equal(r.priority, 'high');
});

check('iit_iim_required downgrades but never filters (D-64)', () => {
  const r = computeRecommendation({
    ...base, backgroundMatch: ['HR Tech'], isAi: 'ai', instituteRequirement: 'iit_iim_required',
  });
  assert.equal(r.priority, 'med');
});

check('both downgrade conditions still drop only one level', () => {
  const r = computeRecommendation({
    ...base, backgroundMatch: ['HR Tech'], isAi: 'ai',
    technicalDepth: 5, instituteRequirement: 'iit_iim_required',
  });
  assert.equal(r.priority, 'med');
});

check('salary > 15 LPA promotes med -> high', () => {
  const r = computeRecommendation({
    ...base, backgroundMatch: ['HR Tech'],
    salaryStatus: 'stated', salaryPeriod: 'lpa', salaryMax: 24,
  });
  assert.equal(r.priority, 'high');
});

check('salary never promotes low -> med', () => {
  const r = computeRecommendation({
    ...base, salaryStatus: 'stated', salaryPeriod: 'lpa', salaryMax: 40,
  });
  assert.equal(r.priority, 'low');
});

check('non-LPA salary is ignored, never a downgrade (D-54 extended)', () => {
  const r = computeRecommendation({
    ...base, backgroundMatch: ['HR Tech'],
    salaryStatus: 'stated', salaryPeriod: 'year', salaryMax: 160000,
  });
  assert.equal(r.priority, 'med', 'USD/year neither promotes nor demotes');
});

// ── institute_requirement is regex, not AI (D-57) ────────────────────────────

check('detects a hard IIT/IIM bar', () => {
  assert.equal(
    parseInstituteRequirement('Candidates must be from IIT or IIM only.'),
    'iit_iim_required',
  );
});

check('softer wording wins on a tie', () => {
  // Biased toward 'preferred' on purpose: under D-64 the required value costs a
  // full priority level, so a false positive quietly buries a viable job.
  assert.equal(
    parseInstituteRequirement('IIT/IIM required, though strong candidates preferred from any school.'),
    'preferred',
  );
});

check('no institute mentioned = none', () => {
  assert.equal(parseInstituteRequirement('5 years of product management experience.'), 'none');
});

// ── years of experience (D-94) ───────────────────────────────────────────────
// The extraction itself is the model's job; these pin the sanity rules around
// it. The one that matters most is the first: null must never become 0.

check('absent stays null, never 0', () => {
  const r = normalizeExperienceRange({ min: null, max: undefined });
  assert.equal(r.years_experience_min, null);
  assert.equal(r.years_experience_max, null);
  // Spelled out because this is the whole point of D-94's nullable storage: a
  // posting that states no requirement must not read as "requires 0 years".
  assert.notEqual(r.years_experience_min, 0);
});

check('a real 0 survives', () => {
  // "0-2 years" is a genuine entry-level range, not a missing value.
  const r = normalizeExperienceRange({ min: 0, max: 2 });
  assert.equal(r.years_experience_min, 0);
  assert.equal(r.years_experience_max, 2);
});

check('open-ended "3+ years" leaves max null', () => {
  const r = normalizeExperienceRange({ min: 3, max: null });
  assert.equal(r.years_experience_min, 3);
  assert.equal(r.years_experience_max, null);
});

check('a reversed range is corrected, not discarded', () => {
  const r = normalizeExperienceRange({ min: 6, max: 3 });
  assert.equal(r.years_experience_min, 3);
  assert.equal(r.years_experience_max, 6);
});

check('implausible figures are dropped, not clamped', () => {
  // A year (2024) or a salary that leaked into this field must not become a
  // requirement of 50 years — clamping would invent a plausible-looking number
  // out of a parsing accident.
  const r = normalizeExperienceRange({ min: 2024, max: null });
  assert.equal(r.years_experience_min, null);
  assert.equal(normalizeExperienceRange({ min: -3, max: null }).years_experience_min, null);
});

// ── D-140: the remote-company tracker's seniority snapshot (shared with the
// dashboard's own experience bucket, so the two can't quietly drift apart) ──

check('bucketExperience: null is fit, not senior (D-73/D-112 collapse)', () => {
  assert.equal(bucketExperience(null), 'fit');
  assert.equal(bucketExperience(undefined), 'fit');
});

check('bucketExperience: 0-3 is fit, 4-6 is stretch, 7+ is senior', () => {
  assert.equal(bucketExperience(0), 'fit');
  assert.equal(bucketExperience(3), 'fit');
  assert.equal(bucketExperience(4), 'stretch');
  assert.equal(bucketExperience(6), 'stretch');
  assert.equal(bucketExperience(7), 'senior');
});

// ── D-104: the remote pre-filter must not drop real remote jobs ─────────
// The three false positives below are the actual postings the first real run dropped
// (Merck, Franklin Templeton, American Express — still in `jobs` with
// dropped_reason='ingest_filter:obviously_non_remote'). They are regression cases, not
// invented examples: each represents a different way a bare keyword scan gets it wrong,
// which is why the fix was proximity-to-arrangement rather than a word-boundary tweak.
// remote_signal is derived, not hardcoded — the filter's behaviour depends on it, so a
// fixture that pinned it to false would test a state ingest never actually produces.
const posting = (jdClean: string, location = 'India') => ({
  roleTitle: 'Product Manager',
  location,
  jdClean,
  parsed: { remote_signal: detectRemoteSignal({ roleTitle: 'Product Manager', location, jdClean }) },
}) as any;

check('D-104: a skills-list "Office 365" is not an on-site claim (Merck)', () => {
  assert.equal(isObviouslyNonRemote(posting('Required: strong skills in Office 365.')), false);
});

check('D-104: an "onsite fitness center" perk is not an on-site claim (Franklin Templeton)', () => {
  assert.equal(
    isObviouslyNonRemote(posting('Benefits include a free onsite fitness center and cafeteria.')),
    false,
  );
});

check('D-104: an options list offering remote is not an on-site claim (Amex)', () => {
  assert.equal(
    isObviouslyNonRemote(posting('We offer flexible options: onsite, hybrid, or remote.')),
    false,
  );
});

check('D-104: the structured location tag is still trusted', () => {
  // LinkedIn's own work-arrangement tag, not prose — this is the only thing the pre-filter
  // is still allowed to judge.
  assert.equal(isObviouslyNonRemote(posting('Great team.', 'Pune (Hybrid)')), true);
  assert.equal(isObviouslyNonRemote(posting('Great team.', 'Chennai (On-site)')), true);
});

check('D-104: the JD is NOT judged, even when it plainly says on-site', () => {
  // Deliberate: prose is geo_recheck's job now. A regex that got this "right" would be the
  // same regex that got Merck/Franklin Templeton/Amex wrong — it cannot tell a statement
  // about the role from a perk, a skill, or a menu of options. Failing open costs one AI
  // call; failing closed silently discards a real job.
  assert.equal(isObviouslyNonRemote(posting('This is an on-site role based in Bengaluru.')), false);
  assert.equal(isObviouslyNonRemote(posting('The position is 100% onsite.')), false);
});

check('D-104: an explicit remote signal overrides even the location tag', () => {
  assert.equal(isObviouslyNonRemote(posting('Fully remote team.', 'Pune (Hybrid)')), false);
});

check('D-104: "virtual arrangements" counts as a remote signal (Amex)', () => {
  // Its absence is what left Amex's on-site marker unopposed. This list only ever makes the
  // pre-filter more permissive, so a loose match here fails in the safe direction.
  assert.equal(
    detectRemoteSignal({ jdClean: 'Flexible working model with hybrid, onsite or virtual arrangements.' }),
    true,
  );
});

// ── D-136: Groq's daily TPD quota detection ──────────────────────────────
// Matched on the literal text seen in the live 429 (D-127), not a guess.

check('detects Groq\'s daily TPD quota error', () => {
  assert.equal(
    isGroqDailyQuotaError(
      new Error('groq 429: Rate limit reached for `llama-3.3-70b-versatile` … on tokens per day (TPD): Limit 100000, Used 98748.'),
    ),
    true,
  );
});

check('does not mistake a per-minute rate limit for the daily quota', () => {
  assert.equal(
    isGroqDailyQuotaError(new Error('groq 429: Rate limit reached … on tokens per minute (TPM): Limit 12000, Used 12000.')),
    false,
  );
});

check('a plain error is not the daily quota', () => {
  assert.equal(isGroqDailyQuotaError(new Error('groq 500: internal server error')), false);
});

// ── D-136: remote_check must stay out of the junior full pipeline ────────
// Cheap insurance against a future edit accidentally recoupling the two paths
// D-133 was written to keep apart — see lib/enrich/pipeline.ts's own comment.

check('remote_check is never in the junior pipeline ORDER', () => {
  assert.ok(!ORDER.includes('remote_check' as any));
});

console.log(failures === 0 ? '\nAll enrichment checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
