// Write a new active enrichment row for a (job, stage), superseding the prior active row.
// Honors manual overrides: fields listed in job_tracking.locked_fields are carried over from
// the current active row instead of being overwritten by fresh AI output.
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

  // Current active row (for locked-field carry-over).
  const { data: current } = await db()
    .from('job_enrichments')
    .select('*')
    .eq('job_id', jobId)
    .eq('stage', stage)
    .eq('is_active', true)
    .maybeSingle();

  // Locked fields: user overrides the AI must not touch.
  const { data: tracking } = await db()
    .from('job_tracking')
    .select('locked_fields')
    .eq('job_id', jobId)
    .maybeSingle();
  const locked = new Set<string>(tracking?.locked_fields ?? []);

  const fields = { ...input.fields };
  if (current) {
    for (const key of Object.keys(fields)) {
      if (locked.has(key) && current[key] !== null && current[key] !== undefined) {
        fields[key] = current[key];
      }
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
