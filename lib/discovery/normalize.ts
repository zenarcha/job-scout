// Normalize a RawPosting into an insert-ready immutable job record, plus a light
// remote/India pre-filter. Authoritative remote_type is decided later by classification;
// here we only drop postings that are OBVIOUSLY on-site so we don't waste enrichment calls.
import { env } from '../config.js';
import type { NormalizedJob, RawPosting } from '../types.js';
import { cleanJd } from './cleanJd.js';
import { reliabilityOf } from './reliability.js';
import { normalizeTitle, slugify } from '../text.js';

// "virtual" belongs here: it is standard JD vocabulary for remote and its absence cost a
// real job (American Express offers "hybrid, onsite or virtual arrangements" — remote IS on
// offer). This list only ever makes the pre-filter MORE permissive, so a loose match here
// fails in the safe direction.
const REMOTE_MARKER = /\bremote\b|work from home|wfh|distributed|anywhere|\bvirtual(?:ly)?\b/i;

/**
 * Whether the posting shows any sign of being remote. Exported because re-evaluating
 * historical rows must use the CURRENT rule — reusing the `remote_signal` stored at ingest
 * would re-apply the very logic a fix just changed, and silently produce the old verdict.
 */
export function detectRemoteSignal(parts: {
  roleTitle?: string | null;
  location?: string | null;
  jdClean?: string | null;
}): boolean {
  const hay = `${parts.roleTitle ?? ''} ${parts.location ?? ''} ${parts.jdClean ?? ''}`.toLowerCase();
  return REMOTE_MARKER.test(hay);
}

export function normalize(raw: RawPosting): NormalizedJob {
  const jdClean = cleanJd(raw.jdRaw);
  const hay = `${raw.roleTitle ?? ''} ${raw.location ?? ''} ${jdClean}`.toLowerCase();

  const remoteSignal = detectRemoteSignal({ roleTitle: raw.roleTitle, location: raw.location, jdClean });
  const indiaSignal = env.remoteIndiaKeywords.some((k) => hay.includes(k));

  return {
    ...raw,
    companySlug: slugify(raw.company),
    jdClean,
    sourceReliability: reliabilityOf(raw.source),
    parsed: {
      norm_title: normalizeTitle(raw.roleTitle),
      remote_signal: remoteSignal,
      india_signal: indiaSignal,
    },
  };
}

// D-104: this pre-filter no longer reads the job description at all.
//
// The old version scanned the whole posting for a bare `on-site|hybrid|in-office` marker —
// a keyword scan impersonating a judgement call. On its first real sample it was wrong half
// the time (3 of 6 drops were real remote jobs) and, decisively, wrong in three unrelated
// ways: a skills list ("Office 365"), a perks list ("onsite fitness center"), and an options
// list that offered remote as a choice ("hybrid, onsite or virtual arrangements"). Every one
// of those failures came from PROSE. The word was never the problem; reading prose without
// understanding it was.
//
// Sakshi's call was explicit: hand the judgement to the AI (`geo_recheck`) and keep the regex
// only for what cannot be misread. Adding cleverness here — proximity windows, "is the marker
// near a work-arrangement noun" — was written during implementation and then removed: it
// patches the three known postings and waits to be wrong on a fourth, which is the class of
// bug this decision exists to end.
//
// So the rule is now: judge ONLY the structured `location` field, which is LinkedIn's own
// work-arrangement tag rather than someone's marketing copy. Anything the JD says is for
// geo_recheck, which can actually read a sentence.
//
// Accepted cost (Sakshi, this session): postings that used to be dropped for free now cost
// one AI call each. AI quota is the scarcest resource (D-105/D-107), so geo_recheck call
// volume must be watched over the next 3 runs rather than assumed harmless.
export function isObviouslyNonRemote(job: NormalizedJob): boolean {
  const location = (job.location ?? '').toLowerCase();
  return /\bon-?site\b|\bhybrid\b/.test(location) && !job.parsed.remote_signal;
}
