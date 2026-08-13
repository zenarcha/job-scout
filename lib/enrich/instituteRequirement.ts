// D-57: `institute_requirement` moved OUT of the AI call to a regex. The question
// is a keyword lookup ("does this posting name IIT/IIM/tier-1 as a bar?"), not a
// judgment call — deterministic, free, and reproducible across re-runs.
import type { InstituteRequirement } from '../types.js';

// Word-boundary matching so "iit" doesn't fire inside unrelated words.
const INSTITUTE =
  /\b(iit|iim|isb|nit|bits\s*pilani|tier[\s-]?(?:1|one)|premier\s+institutes?|top[\s-]?tier\s+(?:college|institute|b[\s-]?school))\b/i;

// Phrases that make it a hard bar rather than a preference.
const HARD = /\b(only|must|mandatory|required|requirement|essential|strictly)\b/i;
// Phrases that explicitly soften it.
const SOFT = /\b(preferred|preferable|plus|bonus|advantage|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|desirable|ideally)\b/i;

/**
 * Classify a job description's institute requirement.
 *
 * Deliberately biased toward the softer answer: when an institute is named but
 * the wording is ambiguous, this returns 'preferred' rather than
 * 'iit_iim_required'. Under D-64 the required value costs a full priority level,
 * so a false positive silently buries a job Sakshi could have applied to —
 * exactly the failure mode D-64 wrote the downgrade (rather than a filter) to
 * avoid in the first place.
 */
export function parseInstituteRequirement(text: string | undefined | null): InstituteRequirement {
  if (!text) return 'none';

  // Only sentences that actually name an institute can carry the requirement.
  const sentences = text.split(/(?<=[.!?\n;])\s+/).filter((s) => INSTITUTE.test(s));
  if (sentences.length === 0) return 'none';

  // A single sentence often contains both ("IIT/IIM preferred but not required"),
  // so SOFT is checked first — the softer reading wins on a tie.
  for (const s of sentences) {
    if (SOFT.test(s)) return 'preferred';
  }
  for (const s of sentences) {
    if (HARD.test(s)) return 'iit_iim_required';
  }
  return 'preferred';
}
