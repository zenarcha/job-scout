// AIService: provider-agnostic enrichment calls. Swap Gemini/Cerebras/Grok per stage
// via env with zero changes to callers. Validates + clamps every model response.
import { z } from 'zod';
import { env, type ProviderName } from '../config.js';
import type {
  AiMeta, ClassifyResult, RecommendResult, ResumeMatchResult, SkillsResult, WithMeta,
} from '../types.js';
import { callGemini } from './gemini.js';
import { callCerebras } from './cerebras.js';
import { callGrok } from './grok.js';
import type { ProviderResponse } from './provider.js';
import {
  CLASSIFIER_VERSION, PROMPT_VERSION,
  classifyPrompt, recommendPrompt, resumeMatchPrompt, skillsPrompt,
} from './prompts.js';

export { CLASSIFIER_VERSION, PROMPT_VERSION };

const CALLERS: Record<ProviderName, (p: string) => Promise<ProviderResponse>> = {
  gemini: callGemini,
  cerebras: callCerebras,
  grok: callGrok,
};

function providerFor(stage: string): ProviderName {
  const override = env.ai.stageProvider[stage];
  return (override || env.ai.defaultProvider) as ProviderName;
}

// Models sometimes wrap JSON in prose/fences despite instructions — extract defensively.
function parseJson(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`Could not parse JSON from model output: ${text.slice(0, 200)}`);
  }
}

function metaOf(r: ProviderResponse): AiMeta {
  return {
    provider: r.provider,
    model: r.model,
    promptVersion: PROMPT_VERSION,
    usage: r.usage,
    raw: r.raw,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

// ── zod schemas (lenient in, strict out) ────────────────────────────────
const classifySchema = z.object({
  remote_type: z.enum(['remote_india', 'remote_global', 'other']).catch('other'),
  is_technical: z.enum(['technical', 'non_technical']).catch('non_technical'),
  technical_depth: z.coerce.number().catch(1),
  is_ai: z.enum(['ai', 'non_ai']).catch('non_ai'),
  business_model: z.enum(['saas', 'b2c', 'other']).catch('other'),
  institute_requirement: z.enum(['iit_iim_required', 'preferred', 'none']).catch('none'),
  confidence: z.coerce.number().catch(0.5),
  reasoning: z.string().catch(''),
  recruiter_name: z.string().nullish(),
  recruiter_email: z.string().nullish(),
  hiring_manager: z.string().nullish(),
});

const matchSchema = z.object({
  resume_match_score: z.coerce.number().catch(0),
  reasoning: z.string().catch(''),
});

const skillsSchema = z.object({ skills: z.array(z.string()).catch([]) });

const recommendSchema = z.object({
  priority: z.enum(['high', 'med', 'low']).catch('med'),
  reasons: z.array(z.string()).catch([]),
});

export const AIService = {
  async classify(input: { roleTitle: string; company: string; jd: string }): Promise<WithMeta<ClassifyResult>> {
    const r = await CALLERS[providerFor('classify')](classifyPrompt(input));
    const p = classifySchema.parse(parseJson(r.text));
    return {
      ...p,
      technical_depth: clamp(p.technical_depth, 1, 5),
      confidence: Math.max(0, Math.min(1, p.confidence)),
      recruiter_name: p.recruiter_name ?? null,
      recruiter_email: p.recruiter_email ?? null,
      hiring_manager: p.hiring_manager ?? null,
      meta: metaOf(r),
    };
  },

  async matchResume(input: { jd: string; resume: string }): Promise<WithMeta<ResumeMatchResult>> {
    const r = await CALLERS[providerFor('resume_match')](resumeMatchPrompt(input));
    const p = matchSchema.parse(parseJson(r.text));
    return { resume_match_score: clamp(p.resume_match_score, 0, 100), reasoning: p.reasoning, meta: metaOf(r) };
  },

  async extractSkills(input: { jd: string }): Promise<WithMeta<SkillsResult>> {
    const r = await CALLERS[providerFor('skills')](skillsPrompt(input));
    const p = skillsSchema.parse(parseJson(r.text));
    const skills = [...new Set(p.skills.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 15);
    return { skills, meta: metaOf(r) };
  },

  async recommend(input: Parameters<typeof recommendPrompt>[0]): Promise<WithMeta<RecommendResult>> {
    const r = await CALLERS[providerFor('recommend')](recommendPrompt(input));
    const p = recommendSchema.parse(parseJson(r.text));
    return { priority: p.priority, reasons: p.reasons.slice(0, 5), meta: metaOf(r) };
  },
};
