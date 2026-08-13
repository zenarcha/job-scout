// Write a new active enrichment row for a (job, stage), superseding the prior active row.
//
// Honors manual overrides (D-48): a field is LOCKED iff `job_feedback` holds a
// thumbs-down with a `corrected_value` against that field on the current active
// row. A correction *is* a lock — keeping "the AI was wrong, it should say X" and
// "don't overwrite my X" as two mechanisms would mean syncing them forever.
// This replaces the old `job_tracking.locked_fields` read, which is what lets
// `job_tracking` move to the tracker module (D-42).
import { db } from '../db.js';
import type { EnrichStage } from '../types.js';

export async function writeEnrichment(input: {
  jobId: string;
  stage: EnrichStage;
  fields: Record<string, unknown>; // stage-owned columns (snake_case)
  classifierVersion: string;
  promptVersion: string;
  provider?: string;
  model?: string;
  confidence?: number;
  needsReview?: boolean;
  rawOutput?: unknown;
}): Promise<string> {
  const { jobId, stage } = input;

  // Current active row — both the supersede target and the thing feedback hangs off.
  const { data: current } = await db()
    .from('job_enrichments')
    .select('id')
    .eq('job_id', jobId)
    .eq('stage', stage)
    .eq('is_active', true)
    .maybeSingle();

  const fields = { ...input.fields };

  if (current) {
    // A correction against the CURRENT active row locks that field. Scoping to the
    // active row (rather than every row this job ever had) means a correction
    // travels forward one generation at a time and stays inspectable, instead of
    // silently pinning a value forever after the prompt has moved on.
    const { data: corrections } = await db()
      .from('job_feedback')
      .select('field, corrected_value')
      .eq('enrichment_id', current.id)
      .eq('verdict', false)
      .not('corrected_value', 'is', null);

    for (const c of corrections ?? []) {
      const field = c.field as string;
      if (field in fields) fields[field] = c.corrected_value;
    }
  }

  // Deactivate prior active row (partial unique index allows only one active per job+stage).
  if (current) {
    await db().from('job_enrichments').update({ is_active: false }).eq('id', current.id);
  }

  const { data: inserted, error } = await db()
    .from('job_enrichments')
    .insert({
      job_id: jobId,
      stage,
      is_active: true,
      classifier_version: input.classifierVersion,
      prompt_version: input.promptVersion,
      provider: input.provider ?? null,
      model: input.model ?? null,
      confidence: input.confidence ?? null,
      needs_review: input.needsReview ?? false,
      raw_output: input.rawOutput ?? null,
      ...fields,
    })
    .select('id')
    .single();

  if (error) throw error;
  return inserted!.id as string;
}
