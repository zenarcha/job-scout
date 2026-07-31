// Cross-source dedup. Jobs sharing (company_slug, normalized title) are the same role.
// The most reliable copy is canonical (canonical_job_id IS NULL); duplicates point to it.
// If a higher-reliability copy arrives later, we promote it to canonical.
import { db } from '../db.js';
import type { SourceReliability } from '../types.js';
import { reliabilityRank } from './reliability.js';

interface GroupMember {
  id: string;
  canonical_job_id: string | null;
  source_reliability: SourceReliability;
  first_seen_at: string;
  parsed: { norm_title?: string } | null;
}

function best(members: GroupMember[]): GroupMember {
  return [...members].sort(
    (a, b) =>
      reliabilityRank(b.source_reliability) - reliabilityRank(a.source_reliability) ||
      new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime(),
  )[0]!;
}

// Call AFTER inserting the new job. Sets canonical links for the whole group.
export async function linkCanonical(newJob: {
  id: string;
  companySlug: string;
  normTitle: string;
  reliability: SourceReliability;
}): Promise<{ canonical: boolean; headId: string }> {
  const { data } = await db()
    .from('jobs')
    .select('id, canonical_job_id, source_reliability, first_seen_at, parsed')
    .eq('company_slug', newJob.companySlug)
    .neq('id', newJob.id);

  const group = ((data ?? []) as GroupMember[]).filter(
    (m) => (m.parsed?.norm_title ?? '') === newJob.normTitle,
  );

  if (group.length === 0) {
    return { canonical: true, headId: newJob.id }; // first of its kind → stays canonical
  }

  const heads = group.filter((m) => m.canonical_job_id === null);
  const head = heads.length ? best(heads) : best(group);

  if (reliabilityRank(newJob.reliability) > reliabilityRank(head.source_reliability)) {
    // Promote new job to canonical; repoint every existing member at it.
    await db().from('jobs').update({ canonical_job_id: newJob.id }).in(
      'id',
      group.map((m) => m.id),
    );
    return { canonical: true, headId: newJob.id };
  }

  await db().from('jobs').update({ canonical_job_id: head.id }).eq('id', newJob.id);
  return { canonical: false, headId: head.id };
}
