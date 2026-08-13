// Salary PARSER (deterministic, no LLM — D-12). Extracts compensation only when explicitly
// stated; never estimates, because a wrong number erodes trust in the whole tool.
// Status is three-way: 'stated' | 'not_mentioned' | 'unrecognizable_format'.
import type { SalaryResult } from '../types.js';
import { db } from '../db.js';
import { CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent } from '../events.js';
import { confirmRemoteCompany } from '../discovery/remoteCompanies.js';

const nullResult = (status: SalaryResult['salary_status']): SalaryResult => ({
  salary_min: null, salary_max: null, salary_currency: null, salary_period: null, salary_status: status,
});

// Signals that the posting states an actual pay FIGURE the parser failed to read —
// which is the only thing 'unrecognizable_format' should mean. Distinguishing that
// from silence is the whole point of the three-way status: it makes the parser's own
// failure rate measurable instead of invisible.
//
// Deliberately requires a DIGIT near the pay context. "Competitive salary and great
// benefits" mentions pay but contains no number — the parser didn't fail there, there
// was nothing to parse, so counting it as a failure would pollute the metric.
const PAY_FIGURE = [
  /[₹$£€]\s*\d/,                                                        // ₹18…, $120…
  /\b(salary|compensation|ctc|pay|package|remuneration|stipend)\b[^.\n]{0,60}\d/i,
  /\d[^.\n]{0,20}\b(lpa|lakhs?|lacs?|per\s+annum|k\s*(?:-|–|to)\s*\d)/i,
];
const mentionsPayFigure = (t: string) => PAY_FIGURE.some((re) => re.test(t));

const num = (s: string) => Number(s.replace(/[,\s]/g, ''));
const SEP = '(?:-|–|—|to|and)';

export function parseSalary(text: string | undefined | null): SalaryResult {
  if (!text) return nullResult('not_mentioned');
  const t = text.replace(/ /g, ' ');

  // ── Indian LPA: "₹18–24 LPA", "18 to 24 LPA", "INR 20 lakhs per annum" ──
  const lpaRange = t.match(new RegExp(`(?:₹|rs\\.?|inr)?\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*${SEP}\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*(?:lpa|lakhs?|lacs?|l)\\b`, 'i'));
  if (lpaRange) return { salary_min: num(lpaRange[1]!), salary_max: num(lpaRange[2]!), salary_currency: 'INR', salary_period: 'lpa', salary_status: 'stated' };
  const lpaOne = t.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?)\b/i);
  if (lpaOne) return { salary_min: num(lpaOne[1]!), salary_max: num(lpaOne[1]!), salary_currency: 'INR', salary_period: 'lpa', salary_status: 'stated' };

  // ── USD/EUR/GBP with k: "$120k-$160k", "£90K to 110K" ──
  const cur = (sym: string) => (sym === '$' ? 'USD' : sym === '£' ? 'GBP' : sym === '€' ? 'EUR' : 'USD');
  const kRange = t.match(new RegExp(`([$£€])?\\s*(\\d{2,3})\\s*k\\s*${SEP}\\s*[$£€]?\\s*(\\d{2,3})\\s*k`, 'i'));
  if (kRange) return { salary_min: num(kRange[2]!) * 1000, salary_max: num(kRange[3]!) * 1000, salary_currency: cur(kRange[1] ?? '$'), salary_period: 'year', salary_status: 'stated' };

  // ── Full numbers: "$120,000 - $160,000" ──
  const fullRange = t.match(new RegExp(`([$£€])\\s*(\\d{2,3}(?:,\\d{3})+)\\s*${SEP}\\s*[$£€]?\\s*(\\d{2,3}(?:,\\d{3})+)`, 'i'));
  if (fullRange) return { salary_min: num(fullRange[2]!), salary_max: num(fullRange[3]!), salary_currency: cur(fullRange[1]!), salary_period: 'year', salary_status: 'stated' };

  // ── Indian full numbers per month: "₹1,50,000/month" ──
  const inrMonth = t.match(/₹\s*(\d[\d,]{3,})\s*(?:\/|per\s*)?\s*month/i);
  if (inrMonth) return { salary_min: num(inrMonth[1]!), salary_max: num(inrMonth[1]!), salary_currency: 'INR', salary_period: 'month', salary_status: 'stated' };

  // Nothing matched. Was there a figure we failed to read, or simply no figure?
  return nullResult(mentionsPayFigure(t) ? 'unrecognizable_format' : 'not_mentioned');
}

// Salary stage runner (no AI call, no ai_usage).
export async function runSalary(jobId: string): Promise<void> {
  const { data: job, error } = await db().from('jobs').select('jd_clean').eq('id', jobId).single();
  if (error || !job) throw new Error(`salary: job ${jobId} not found`);

  const sal = parseSalary(job.jd_clean);
  await writeEnrichment({
    jobId,
    stage: 'salary',
    fields: {
      salary_min: sal.salary_min,
      salary_max: sal.salary_max,
      salary_currency: sal.salary_currency,
      salary_period: sal.salary_period,
      salary_status: sal.salary_status,
    },
    classifierVersion: CLASSIFIER_VERSION,
    promptVersion: 'salary-regex-v1',
  });

  await emitEvent({ jobId, type: 'SalaryParsed', stage: 'salary', payload: { status: sal.salary_status } });

  // D-144: snapshot the salary onto remote_companies, same "capture it permanently"
  // framing as recruiter contact (D-140) — but only when there's a real figure to keep
  // (never write 'not_mentioned'/'unrecognizable_format' onto the archive) and only for a
  // company already AI-confirmed remote_india, same gating D-139 established. `classify`
  // runs before `salary` in ORDER (pipeline.ts), so classify's own confirmRemoteCompany
  // call has already created this row a moment earlier in the same enrichJob() run — this
  // is a second, idempotent call that adds the salary fields on top.
  if (sal.salary_status === 'stated') {
    const { data: classifyRow } = await db()
      .from('job_enrichments')
      .select('remote_type')
      .eq('job_id', jobId)
      .eq('stage', 'classify')
      .eq('is_active', true)
      .maybeSingle();

    if (classifyRow?.remote_type === 'remote_india') {
      const { data: jobRow } = await db()
        .from('jobs')
        .select('company, company_slug, posting_url, role_title')
        .eq('id', jobId)
        .maybeSingle();

      if (jobRow) {
        await confirmRemoteCompany({
          company: jobRow.company,
          companySlug: jobRow.company_slug,
          postingUrl: jobRow.posting_url,
          roleTitle: jobRow.role_title,
          salaryMin: sal.salary_min,
          salaryMax: sal.salary_max,
          salaryCurrency: sal.salary_currency,
          salaryPeriod: sal.salary_period,
        });
      }
    }
  }
}
