// Recommend stage — plain arithmetic, not an AI call (D-53). Runs last so it can
// read every other stage's output.
//
// The rule, exactly as D-62 states it:
//   high = background_match non-empty AND at least one other positive signal
//   med  = one signal present
//   low  = none
//   downgrade one level when technical_depth >= 4 (D-63) or institute_requirement
//     = 'iit_iim_required' (D-64)
//   salary > 15 LPA promotes med → high only; it never demotes (D-53, D-54)
//
// Positive signals are ONLY background_match and is_ai. `is_technical` is
// deliberately absent — D-63 removed it after Sakshi stated she is non-technical
// and seeking non-tech roles; "technical = good" had been inherited from the
// original prompt and never actually decided. `remote_type` is absent per D-53
// (everything reaching here is already remote-India eligible, so it carries no
// discriminating information) and `company_watchlist.weight` per D-74.
//
// `years_experience_min/max` are absent BY DECISION, not by oversight — D-94 says
// the field is surfaced as an eligibility blocker and is filterable, but does not
// change the verdict. Do not wire it in here without amending D-94 first.
import { db } from '../db.js';
import { CLASSIFIER_VERSION } from '../ai/AIService.js';
import { writeEnrichment } from './writeEnrichment.js';
import { emitEvent } from '../events.js';
import type { Priority } from '../types.js';

export interface RecommendInput {
  backgroundMatch: string[];
  isAi: string | null;
  technicalDepth: number | null;
  instituteRequirement: string | null;
  salaryStatus: string | null;
  salaryPeriod: string | null;
  salaryMax: number | null;
}

const DOWN: Record<Priority, Priority> = { high: 'med', med: 'low', low: 'low' };

const SALARY_PROMOTE_LPA = 15;

export function computeRecommendation(input: RecommendInput): { priority: Priority; reasons: string[] } {
  const reasons: string[] = [];

  const hasBackgroundMatch = input.backgroundMatch.length > 0;
  const isAi = input.isAi === 'ai';

  // ── base ──
  let priority: Priority;
  if (hasBackgroundMatch && isAi) priority = 'high';
  else if (hasBackgroundMatch || isAi) priority = 'med';
  else priority = 'low';

  // Reasons are the named conditions that fired (D-66) — deterministic strings
  // assembled here, never model prose, so a wrong ranking traces to a condition.
  // The matched tags themselves are listed (not just "background match"), which is
  // what lets the Telegram chip read "HR Tech" and makes per-field feedback possible.
  if (hasBackgroundMatch) reasons.push(...input.backgroundMatch);
  if (isAi) reasons.push('AI PM');

  // ── downgrades ──
  // NOTE: D-62 says "downgrade one level when X or Y". Read literally, that is ONE
  // level total even if both conditions fire, which is what this implements.
  const deepTechnical = (input.technicalDepth ?? 0) >= 4;
  const instituteBar = input.instituteRequirement === 'iit_iim_required';
  if (deepTechnical || instituteBar) {
    priority = DOWN[priority];
    if (deepTechnical) reasons.push(`Deep technical (L${input.technicalDepth})`);
    if (instituteBar) reasons.push('IIT/IIM required');
  }

  // ── salary promotion ──
  // Only fires for LPA. A USD/year or INR/month figure is IGNORED for this rule,
  // never treated as a negative — extending D-54's "unknown salary is ignored,
  // never a downgrade" to "un-comparable salary is ignored too". No currency
  // conversion is invented.
  // Applied AFTER the downgrade, following the order D-62 lists the clauses in;
  // a strongly-paying but deeply-technical role can therefore land back at high.
  // Uses the TOP of a stated range — "12–20 LPA" can pay 20.
  const salaryQualifies =
    input.salaryStatus === 'stated' &&
    input.salaryPeriod === 'lpa' &&
    (input.salaryMax ?? 0) > SALARY_PROMOTE_LPA;
  if (salaryQualifies && priority === 'med') {
    priority = 'high';
    reasons.push(`${input.salaryMax} LPA`);
  }

  return { priority, reasons };
}

export async function runRecommend(jobId: string): Promise<void> {
  // ── precondition (D-112) ──
  // Without an active `classify` row the view returns `background_match = []` and
  // `is_ai = null` — byte-identical to a job genuinely judged to have no matching
  // signals. computeRecommendation would then emit `low`, which reads as "we looked
  // and it's bad" for a job nobody looked at. 33 jobs were ranked that way.
  //
  // Third site of the D-73 principle (after `remote_type` and `salary_status`):
  // absent must never collapse into negative. The rule itself is correct and stays
  // untouched — the defect was calling it with absent inputs.
  //
  // Writing nothing is safe because `v_enrich_pending`, not the presence of a
  // `recommend` row, is the retry authority (D-99). The absence is stated explicitly
  // to readers by `v_jobs_enriched.classify_status` + `priority = 'unknown'`
  // (migration 0005), which is why a missing row does not render as a blank card.
  const { data: classify, error: classifyErr } = await db()
    .from('job_enrichments')
    .select('id')
    .eq('job_id', jobId)
    .eq('stage', 'classify')
    .eq('is_active', true)
    .maybeSingle();
  // Fail loudly rather than treating a query error as "no classify row" — that would
  // silently reintroduce the collapse this precondition exists to prevent.
  if (classifyErr) throw new Error(`recommend: reading classify row for ${jobId} failed: ${classifyErr.message}`);

  if (!classify) {
    // Not a failure: the stage declined, it did not break. `pipeline.ts` records it
    // in ok_stages, and `classify`'s own failure is what puts the job back in
    // v_enrich_pending.
    await emitEvent({
      jobId,
      type: 'StageSkipped',
      stage: 'recommend',
      payload: { reason: 'no_classify' },
    });
    return;
  }

  const { data: v, error } = await db().from('v_jobs_enriched').select('*').eq('id', jobId).single();
  if (error || !v) throw new Error(`recommend: job ${jobId} not found`);

  const { priority, reasons } = computeRecommendation({
    backgroundMatch: Array.isArray(v.background_match) ? v.background_match : [],
    isAi: v.is_ai ?? null,
    technicalDepth: v.technical_depth ?? null,
    instituteRequirement: v.institute_requirement ?? null,
    salaryStatus: v.salary_status ?? null,
    salaryPeriod: v.salary_period ?? null,
    salaryMax: v.salary_max ?? null,
  });

  await writeEnrichment({
    jobId,
    stage: 'recommend',
    fields: { priority, recommend_reasons: reasons },
    classifierVersion: CLASSIFIER_VERSION,
    // Not a prompt — versioned so a rule change is traceable the same way a
    // prompt change is (D-9's principle applied to deterministic logic).
    promptVersion: 'recommend-rule-d62-v1',
  });

  await emitEvent({ jobId, type: 'RecommendationDone', stage: 'recommend', payload: { priority } });
}
