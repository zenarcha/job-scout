// Core domain types shared across services. Mirrors supabase/migrations/0001_schema.sql.

export type SourceReliability = 'high' | 'medium';
// 'resume_match' is gone: D-37/D-38 deferred that stage to v2 and moved matching
// into the resume-builder module, so no stage writes a match score here.
// 'remote_check' (D-136): a standalone, cheap remote-only pass for senior-titled jobs
// that D-133 excludes from the full pipeline. NOT part of `ORDER` in
// lib/enrich/pipeline.ts — dispatched only via its own queue/orchestration path.
export type EnrichStage = 'classify' | 'geo_recheck' | 'skills' | 'salary' | 'recommend' | 'remote_check';
// D-150: third value is 'not_remote', not 'other' — 'other' read like a third flavor of
// remote next to remote_india/remote_global when it actually means on-site or hybrid.
export type RemoteType = 'remote_india' | 'remote_global' | 'not_remote';
export type Technicality = 'technical' | 'non_technical';
export type AiFlag = 'ai' | 'non_ai';
export type BusinessModel = 'saas' | 'b2c' | 'other';
export type InstituteRequirement = 'iit_iim_required' | 'preferred' | 'none';
// The verdict the rule computes and the database stores — `job_enrichments` carries
// CHECK (priority in ('high','med','low')), and keeping this type at three values is
// what makes it provable that the rule can never return "unknown".
export type Priority = 'high' | 'med' | 'low';
// What a READER of v_jobs_enriched sees (D-112). `unknown` means no verdict row
// exists because classify never ran — it is produced by the view's coalesce and is
// never stored, so storage keeps saying "no verdict" rather than holding a fake one.
// Use this for anything selecting from the view; use Priority for anything computing
// or writing a verdict.
export type PriorityView = Priority | 'unknown';
// Three-way (D-73's principle applied to salary): 'not_mentioned' and
// 'unrecognizable_format' were both 'unknown' before, which hid the parser's
// own failure rate behind postings that simply never stated pay.
export type SalaryStatus = 'stated' | 'not_mentioned' | 'unrecognizable_format';
export type GeoVerdict = 'eligible' | 'ineligible' | 'uncertain';

// A raw posting handed to the discovery service (shape we normalize Apify/ATS items into).
export interface RawPosting {
  source: string;            // linkedin | indeed | greenhouse | lever | ashby | google
  externalId: string;
  company?: string;
  roleTitle?: string;
  postingUrl?: string;       // the source posting (LinkedIn) — stable, shareable
  applyUrl?: string;         // external application destination, when exposed (D-41)
  location?: string;
  postedAt?: string;         // ISO
  jdRaw?: string;            // HTML or markdown
  recruiterName?: string;
  recruiterLinkedin?: string;
  recruiterEmail?: string;
  hiringManager?: string;
}

// Normalized, ready-to-insert job (immutable source record).
export interface NormalizedJob extends RawPosting {
  companySlug: string;
  jdClean: string;
  sourceReliability: SourceReliability;
  parsed: Record<string, unknown>;
  // D-72: set when the ingest pre-filter rejects a posting. The row is still
  // written, so the filter's false-negative rate is auditable.
  droppedReason?: string | null;
}

// ── AI result shapes ────────────────────────────────────────────────────
export interface ClassifyResult {
  remote_type: RemoteType;
  // D-73: true only when the JD explicitly states eligibility; false when
  // remote_type came from the "no geo restriction mentioned" fallback.
  geo_explicit: boolean;
  is_technical: Technicality;
  technical_depth: number;          // 1..5
  is_ai: AiFlag;
  business_model: BusinessModel;
  domain: string | null;            // what the company/product does (D-39)
  background_match: string[];       // closed vocabulary from app_config (D-67)
  background_match_suggested: string[]; // novel matches; never feed the rule (D-68)
  // D-92: one line on what the work actually IS, not another classification
  // about it. null means the model didn't answer — never an empty string.
  role_summary: string | null;
  // D-94: nullable on purpose. "Not stated" is a common, real answer and must
  // stay distinguishable from zero. An open-ended "3+ years" leaves max null.
  // Surfaced as an eligibility blocker and filterable, but it does NOT feed the
  // priority rule — see lib/enrich/recommend.ts.
  years_experience_min: number | null;
  years_experience_max: number | null;
  reasoning: string;
  confidence: number;               // 0..1
  recruiter_name?: string | null;
  recruiter_email?: string | null;
  hiring_manager?: string | null;
}

export interface GeoRecheckResult {
  geo_verdict: GeoVerdict;
  reasoning: string;
}

// D-136: senior-titled jobs' standalone remote-only check. Deliberately the same
// two fields `classify` writes (remote_type, geo_explicit) so the two stages'
// outputs are directly comparable — this is NOT a parallel vocabulary.
export interface RemoteCheckResult {
  remote_type: RemoteType;
  geo_explicit: boolean;
  reasoning: string;
}

// `required` separates must-haves from nice-to-haves so a per-job view can show
// only what the role actually demands, without discarding the preferred set.
export interface SkillItem {
  skill: string;                    // normalized, lowercase
  required: boolean;
}

export interface SkillsResult {
  skills: SkillItem[];
}

export interface SalaryResult {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;     // lpa | year | month
  salary_status: SalaryStatus;
}

export interface RecommendResult {
  priority: Priority;
  reasons: string[];
}

// Provider call metadata attached to every AI result.
export interface AiMeta {
  provider: string;
  model: string;
  promptVersion: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  raw: unknown;
}

export type WithMeta<T> = T & { meta: AiMeta };
