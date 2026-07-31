// Salary PARSER (deterministic, no LLM). Extracts compensation only when explicitly stated;
// otherwise returns status 'unknown'. We never estimate — accuracy over speculation.
import type { SalaryResult } from '../types.js';
import { db } from '../db.js';
import { CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent } from '../events.js';

const UNKNOWN: SalaryResult = {
  salary_min: null, salary_max: null, salary_currency: null, salary_period: null, salary_status: 'unknown',
};

const num = (s: string) => Number(s.replace(/[,\s]/g, ''));
const SEP = '(?:-|–|—|to|and)';

export function parseSalary(text: string | undefined | null): SalaryResult {
  if (!text) return UNKNOWN;
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

  return UNKNOWN;
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
}
