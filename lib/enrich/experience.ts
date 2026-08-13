// Sanity rules for the years-of-experience range the classify call extracts (D-94).
//
// A pure module rather than inline in AIService for the same reason
// `instituteRequirement.ts` and `salary.ts` are: it makes the rule testable
// offline, with no env, no DB and no provider call.
//
// The governing constraint from D-94: null must survive. "Not stated" is a common
// and real answer, and it must stay distinguishable from zero — a missing value
// coerced to 0 would read as "no experience required", the permissive direction,
// which is the wrong way to fail for a signal that exists to warn Sakshi off
// ineligible roles.

// Above this, the number is not a years-of-experience figure — it is a salary, a
// headcount, or a year (2024). Discarded rather than clamped: clamping 2024 to 50
// would invent a plausible-looking requirement out of a parsing accident.
const MAX_PLAUSIBLE_YEARS = 50;

function sane(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > MAX_PLAUSIBLE_YEARS) return null;
  return rounded;
}

export function normalizeExperienceRange(input: {
  min?: number | null;
  max?: number | null;
}): { years_experience_min: number | null; years_experience_max: number | null } {
  let min = sane(input.min);
  let max = sane(input.max);

  // A reversed range is a transcription slip, not a different meaning — "3-6"
  // returned as {min: 6, max: 3} still describes 3 to 6. Swapping preserves the
  // fact; dropping it would lose a requirement the posting genuinely stated.
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  return { years_experience_min: min, years_experience_max: max };
}

// The "is this job for me?" bucket — Sakshi's own experience, not the source's
// ai_experience_level (see build-dashboard.ts). `null` lands in 'fit', NOT a senior
// bucket: "not stated" is not "senior" (the D-73/D-112 collapse). Shared by
// build-dashboard.ts's card view and lib/enrich/classify.ts's remote_companies
// evidence_seniority snapshot (D-140) so the two can never quietly drift apart.
export function bucketExperience(yearsMin: number | null | undefined): 'fit' | 'stretch' | 'senior' {
  if (yearsMin == null || yearsMin <= 3) return 'fit';
  if (yearsMin <= 6) return 'stretch';
  return 'senior';
}
