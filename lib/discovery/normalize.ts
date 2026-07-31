// Normalize a RawPosting into an insert-ready immutable job record, plus a light
// remote/India pre-filter. Authoritative remote_type is decided later by classification;
// here we only drop postings that are OBVIOUSLY on-site so we don't waste enrichment calls.
import { env } from '../config.js';
import type { NormalizedJob, RawPosting } from '../types.js';
import { cleanJd } from './cleanJd.js';
import { reliabilityOf } from './reliability.js';
import { normalizeTitle, slugify } from '../text.js';

export function normalize(raw: RawPosting): NormalizedJob {
  const jdClean = cleanJd(raw.jdRaw);
  const hay = `${raw.roleTitle ?? ''} ${raw.location ?? ''} ${jdClean}`.toLowerCase();

  const remoteSignal = /\bremote\b|work from home|wfh|distributed|anywhere/.test(hay);
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

// Drop only when clearly on-site/hybrid with NO remote signal at all.
export function isObviouslyNonRemote(job: NormalizedJob): boolean {
  const hay = `${job.roleTitle ?? ''} ${job.location ?? ''} ${job.jdClean}`.toLowerCase();
  const onsiteMarker = /\bon-?site\b|\bhybrid\b|\bin-office\b|in office/.test(hay);
  return onsiteMarker && !job.parsed.remote_signal;
}
