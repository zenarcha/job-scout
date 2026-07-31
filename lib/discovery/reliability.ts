// Source reliability ranking. ATS boards (fed straight from the employer) are High;
// aggregators are Medium. Used to pick the canonical copy on cross-source duplicates.
import type { SourceReliability } from '../types.js';

const HIGH = new Set(['greenhouse', 'lever', 'ashby', 'careers', 'company']);

export function reliabilityOf(source: string): SourceReliability {
  return HIGH.has(source.toLowerCase()) ? 'high' : 'medium';
}

export function reliabilityRank(r: SourceReliability): number {
  return r === 'high' ? 2 : 1;
}
