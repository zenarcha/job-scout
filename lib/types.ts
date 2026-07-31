// Core domain types shared across services. Mirrors supabase/migrations/0001_schema.sql.

export type SourceReliability = 'high' | 'medium';
export type EnrichStage = 'classify' | 'resume_match' | 'skills' | 'salary' | 'recommend';
export type RemoteType = 'remote_india' | 'remote_global' | 'other';
export type Technicality = 'technical' | 'non_technical';
export type AiFlag = 'ai' | 'non_ai';
export type BusinessModel = 'saas' | 'b2c' | 'other';
export type InstituteRequirement = 'iit_iim_required' | 'preferred' | 'none';
export type Priority = 'high' | 'med' | 'low';
export type SalaryStatus = 'stated' | 'unknown';

// A raw posting handed to the discovery service (shape we normalize Apify/ATS items into).
export interface RawPosting {
  source: string;            // linkedin | indeed | greenhouse | lever | ashby | google
  externalId: string;
  company?: string;
  roleTitle?: string;
  applyUrl?: string;
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
}

// ── AI result shapes ────────────────────────────────────────────────────
export interface ClassifyResult {
  remote_type: RemoteType;
  is_technical: Technicality;
  technical_depth: number;          // 1..5
  is_ai: AiFlag;
  business_model: BusinessModel;
  institute_requirement: InstituteRequirement;
  reasoning: string;
  confidence: number;               // 0..1
  recruiter_name?: string | null;
  recruiter_email?: string | null;
  hiring_manager?: string | null;
}

export interface ResumeMatchResult {
  resume_match_score: number;       // 0..100
  reasoning: string;
}

export interface SkillsResult {
  skills: string[];                 // normalized, lowercase
}

export interface SalaryResult {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;     // year | month | lpa | hour
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
