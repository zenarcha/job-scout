// Presentation logic shared by the two things that render the dashboard: the static
// snapshot generator (`scripts/build-dashboard.ts`, D-119) and the Next.js app
// (`app/`, D-110). It exists so the app is a *port* of the snapshot rather than a second
// implementation that drifts from it — the same reason the stylesheet has one home in
// `styles/dashboard.css`.
//
// Everything here returns DATA, never HTML. The snapshot wraps these values in escaped
// tag strings; React renders them directly. A helper that returned markup would only be
// usable by one of the two, which is how the drift starts.
//
// No DB, no env, no `window` — importable from a server script and a browser bundle alike.
//
// Extensionless, unlike the `.js`-suffixed specifiers the rest of the repo uses: this module
// is bundled by Turbopack for the browser, and Turbopack does not apply TypeScript's
// `.js` → `.ts` rewrite the way `tsc` and `tsx` do. Extensionless resolves in all three.
import { bucketExperience } from './enrich/experience';

// D-116: `unknown` is a first-class state, not a blank. `Pending` follows the CI
// convention — one word, cannot be misread as a verdict.
export const VERDICT: Record<string, { label: string; cls: string }> = {
  high: { label: 'Yes', cls: 'yes' },
  med: { label: 'Maybe', cls: 'maybe' },
  low: { label: 'Probably not', cls: 'no' },
  unknown: { label: 'Pending', cls: 'pending' },
};

export function verdictOf(priority: unknown): { label: string; cls: string } {
  return VERDICT[String(priority)] ?? VERDICT.unknown!;
}

// The bucket key stored on a card and toggled by the verdict chips. An unrecognised
// priority collapses to `unknown` so it stays visible under the Pending chip rather
// than becoming unfilterable.
export function verdictKey(priority: unknown): string {
  return VERDICT[String(priority)] ? String(priority) : 'unknown';
}

export const SENIORITY_LABEL: Record<string, string> = { fit: 'Junior', stretch: 'Stretch', senior: 'Senior' };

export function daysAgo(iso: string | null | undefined): string {
  if (!iso) return 'date unknown';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? '1d ago' : `${d}d ago`;
}

export interface SalaryFields {
  salary_status?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
}

// `soft` is the italic "no figure here" treatment. Kept as a flag rather than baked into
// the string so both renderers pick the same class from the same condition.
export function salaryLabel(j: SalaryFields): { text: string; soft: boolean } {
  if (j.salary_status === 'stated' && (j.salary_min || j.salary_max)) {
    const unit = j.salary_period === 'lpa' ? 'L' : '';
    const cur = j.salary_currency === 'INR' || j.salary_period === 'lpa' ? '₹' : '';
    const range = j.salary_min && j.salary_max ? `${j.salary_min}–${j.salary_max}` : `${j.salary_max ?? j.salary_min}`;
    return { text: `${cur}${range}${unit}`, soft: false };
  }
  if (j.salary_status === 'unrecognizable_format') return { text: 'salary unclear', soft: true };
  return { text: 'not stated', soft: true };
}

// Blockers are DERIVED from stored fields, never model prose (D-66). Each one names the
// field it came from so a wrong blocker traces to a wrong value, not to a wrong opinion.
export function blockers(j: {
  institute_requirement?: string | null;
  technical_depth?: number | null;
  years_experience_min?: number | null;
  years_experience_max?: number | null;
}): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (j.institute_requirement === 'iit_iim_required')
    out.push(['IIT/IIM required', 'stated as a hard requirement — you do not have this']);
  if (j.institute_requirement === 'preferred')
    out.push(['IIT/IIM preferred', 'stated as a preference, not a bar']);
  if ((j.technical_depth ?? 0) >= 4)
    out.push([`Deeply technical (L${j.technical_depth})`, 'expects hands-on code/SQL/ML depth']);
  if (j.years_experience_min != null)
    out.push([
      `${j.years_experience_min}${j.years_experience_max ? `–${j.years_experience_max}` : '+'} years asked`,
      'you are transitioning in, so this may be a stretch',
    ]);
  return out;
}

// Three-valued on purpose: a job the AI has not read yet is "unknown", never "on-site".
// Collapsing those would hide jobs for a property nobody has checked — the D-73 mistake,
// in the UI.
export function remoteBucket(remoteType: string | null | undefined): 'onsite' | 'remote' | 'unknown' {
  if (remoteType === 'not_remote') return 'onsite';
  return remoteType ? 'remote' : 'unknown';
}

// Re-exported so the two renderers reach experience bucketing through this one module
// rather than each importing `enrich/experience.js` on its own. Buckets come from OUR
// `years_experience_min` (D-94), not the source's `ai_experience_level`, and `null` lands
// in 'fit' — "not stated" is not "senior".
export { bucketExperience };

// Actions the dashboard shows but does not yet implement. The copy is here, next to the
// rest of the shared presentation logic, so the snapshot and the app explain an
// unimplemented button identically.
export const EXPLAIN: Record<string, [string, string]> = {
  shortlist: ['Shortlist — not built yet', 'Needs a small new table; job_tracking moved to the tracker module (D-42).'],
  tailor: ['Tailor résumé — not built yet', "Will POST this JD to resume-builder's /api/triage endpoint (D-37/D-38)."],
};
