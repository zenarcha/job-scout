// AIService: provider-agnostic enrichment calls. Swap Gemini/Cerebras/Grok per stage
// via env with zero changes to callers. Validates + clamps every model response.
import { z } from 'zod';
import { env, type ProviderName } from '../config.js';
import type {
  AiMeta, ClassifyResult, GeoRecheckResult, RemoteCheckResult, SkillsResult, WithMeta,
} from '../types.js';
import { normalizeExperienceRange } from '../enrich/experience.js';
import { callGemini } from './gemini.js';
import { callCerebras } from './cerebras.js';
import { callGrok } from './grok.js';
import { callGroq } from './groq.js';
import type { ProviderResponse } from './provider.js';
import { throttleAiCall } from './throttle.js';
import {
  CLASSIFIER_VERSION, PROMPT_VERSION,
  classifyPrompt, geoRecheckPrompt, remoteCheckPrompt, skillsPrompt,
} from './prompts.js';

export { CLASSIFIER_VERSION, PROMPT_VERSION };

const CALLERS: Record<ProviderName, (p: string) => Promise<ProviderResponse>> = {
  gemini: callGemini,
  cerebras: callCerebras,
  grok: callGrok,
  groq: callGroq,
};

function providerFor(stage: string): ProviderName {
  const override = env.ai.stageProvider[stage];
  return (override || env.ai.defaultProvider) as ProviderName;
}

// Every AI call goes through here (D-107). Single choke point on purpose: routing each
// stage's own `CALLERS[...]` call directly is what let the enrich loop fire 88 calls
// back-to-back, and a new stage added later would have repeated it.
function callProvider(stage: string, prompt: string): Promise<ProviderResponse> {
  return throttleAiCall(() => CALLERS[providerFor(stage)](prompt));
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
  // D-150: 'not_remote', not 'other' — this is the fail-open default when the model's
  // answer is missing/unparseable, deliberately the non-remote direction (D-73 pattern).
  remote_type: z.enum(['remote_india', 'remote_global', 'not_remote']).catch('not_remote'),
  // Fails open toward "assumed" (D-73): if the model omits this or returns
  // something unparseable, we must not claim the posting explicitly stated its
  // geography. A false "(assumed)" marker is cheap; a false confident one is not.
  geo_explicit: z.coerce.boolean().catch(false),
  is_technical: z.enum(['technical', 'non_technical']).catch('non_technical'),
  technical_depth: z.coerce.number().catch(1),
  is_ai: z.enum(['ai', 'non_ai']).catch('non_ai'),
  business_model: z.enum(['saas', 'b2c', 'other']).catch('other'),
  domain: z.string().nullish(),
  background_match: z.array(z.string()).catch([]),
  background_match_suggested: z.array(z.string()).catch([]),
  // D-92: no `.catch('')`. "The model didn't answer" must stay distinguishable
  // from a real summary — an empty string would render as a blank line on the
  // dashboard and look like a job with nothing to say about itself, which is the
  // silent-masking problem flagged in Session 7.
  role_summary: z.string().nullish().catch(null),
  // D-94: nullable, and never `.catch(0)`. Zero would read as "no experience
  // required" — the permissive direction, and the wrong way to fail for a signal
  // whose whole purpose is warning her off ineligible roles.
  years_experience_min: z.coerce.number().nullish().catch(null),
  years_experience_max: z.coerce.number().nullish().catch(null),
  confidence: z.coerce.number().catch(0.5),
  reasoning: z.string().catch(''),
  recruiter_name: z.string().nullish(),
  recruiter_email: z.string().nullish(),
  hiring_manager: z.string().nullish(),
});

const geoRecheckSchema = z.object({
  // Defaults to 'uncertain', never 'ineligible' — an unparseable response must
  // not be able to argue a job away.
  geo_verdict: z.enum(['eligible', 'ineligible', 'uncertain']).catch('uncertain'),
  reasoning: z.string().catch(''),
});

// D-136: same fail-open defaults as classifySchema's remote_type/geo_explicit —
// deliberately identical, not re-derived, so the two stages fail the same direction.
const remoteCheckSchema = z.object({
  remote_type: z.enum(['remote_india', 'remote_global', 'not_remote']).catch('not_remote'),
  geo_explicit: z.coerce.boolean().catch(false),
  reasoning: z.string().catch(''),
});

const skillsSchema = z.object({
  skills: z
    .array(z.object({ skill: z.string(), required: z.coerce.boolean().catch(false) }))
    .catch([]),
});

function normalizeSkills(raw: Array<{ skill: string; required: boolean }>): SkillsResult['skills'] {
  const seen = new Set<string>();
  return raw
    .map((s) => ({ skill: s.skill.trim().toLowerCase(), required: s.required }))
    .filter((s) => s.skill && !seen.has(s.skill) && seen.add(s.skill))
    .slice(0, 15);
}

// D-117a: `classify` and `skills` now ride ONE provider call, because the free-tier
// quota counts requests rather than tokens (D-111) — two calls over the same JD cost
// double for no gain. The stage model is deliberately untouched: `runClassify` and
// `runSkills` still each write their own `job_enrichments` row, so `v_jobs_enriched`,
// `v_enrich_pending` and D-112's precondition all behave exactly as before. Only the
// number of network calls drops.
//
// This cache is how the second stage collects what the first call already fetched.
// Keyed by the JD text (the stages share no job id), and per-process only — the
// pipeline is a short-lived CLI, so it never needs invalidation.
const skillsFromClassify = new Map<string, SkillsResult['skills']>();

export const AIService = {
  async classify(input: {
    roleTitle: string;
    company: string;
    location?: string | null;
    jd: string;
    profileBlurb: string;
    backgroundVocabulary: string[];
  }): Promise<WithMeta<ClassifyResult>> {
    const r = await callProvider('classify', classifyPrompt(input));
    const raw = parseJson(r.text);
    const p = classifySchema.parse(raw);

    // Skills come back on this same call now (D-117a). Parsed separately so a malformed
    // skills array can never invalidate the classification — `skillsSchema` catches to
    // [] rather than throwing, and an empty result simply means the skills stage falls
    // through to its own call, which is the safe direction.
    const skills = normalizeSkills(skillsSchema.parse(raw).skills);
    if (skills.length) skillsFromClassify.set(input.jd, skills);

    // Enforce D-67's closed vocabulary in code, not just in the prompt. A model
    // that invents a tag would otherwise make the priority rule non-reproducible
    // and the tags uncountable — the exact drift D-67 exists to prevent.
    const allowed = new Set(input.backgroundVocabulary);
    const matched = [...new Set(p.background_match)].filter((t) => allowed.has(t));
    // Anything it invented is not discarded — it becomes a suggestion (D-68),
    // which never feeds the rule until Sakshi promotes it.
    const invented = [...new Set(p.background_match)].filter((t) => !allowed.has(t));

    return {
      ...p,
      technical_depth: clamp(p.technical_depth, 1, 5),
      confidence: Math.max(0, Math.min(1, p.confidence)),
      domain: p.domain ?? null,
      background_match: matched,
      background_match_suggested: [...new Set([...p.background_match_suggested, ...invented])],
      // An empty or whitespace-only summary is the model declining to answer, not
      // a summary that happens to be blank — collapse it to null so the two never
      // become confusable downstream (D-92).
      role_summary: p.role_summary?.trim() || null,
      ...normalizeExperienceRange({ min: p.years_experience_min, max: p.years_experience_max }),
      recruiter_name: p.recruiter_name ?? null,
      recruiter_email: p.recruiter_email ?? null,
      hiring_manager: p.hiring_manager ?? null,
      meta: metaOf(r),
    };
  },

  async geoRecheck(input: { roleTitle: string; company: string; location?: string | null; jd: string }): Promise<WithMeta<GeoRecheckResult>> {
    const r = await callProvider('geo_recheck', geoRecheckPrompt(input));
    const p = geoRecheckSchema.parse(parseJson(r.text));
    return { geo_verdict: p.geo_verdict, reasoning: p.reasoning, meta: metaOf(r) };
  },

  // D-136: senior-titled jobs' standalone remote-only pass. Reads the job row
  // directly (no prior classify output to build on, unlike geoRecheck) and returns
  // only remote_type/geo_explicit/reasoning — the cheap 3-key contract is the point.
  async remoteCheck(input: { roleTitle: string; company: string; location?: string | null; jd: string }): Promise<WithMeta<RemoteCheckResult>> {
    const r = await callProvider('remote_check', remoteCheckPrompt(input));
    const p = remoteCheckSchema.parse(parseJson(r.text));
    return { remote_type: p.remote_type, geo_explicit: p.geo_explicit, reasoning: p.reasoning, meta: metaOf(r) };
  },

  async extractSkills(input: { jd: string }): Promise<WithMeta<SkillsResult>> {
    // Reuse what `classify` already fetched on this run (D-117a) — this is where the
    // saved request actually happens. Usage is reported as zero because the tokens
    // were already recorded against the classify call; counting them twice would
    // overstate consumption in `ai_usage`, and that table is the evidence the quota
    // decisions are made from.
    const cached = skillsFromClassify.get(input.jd);
    if (cached) {
      return {
        skills: cached,
        meta: {
          provider: 'reused',
          model: 'classify-call',
          promptVersion: PROMPT_VERSION,
          usage: { prompt_tokens: 0, completion_tokens: 0 },
          raw: { reused_from: 'classify' },
        },
      };
    }

    // No cached result: `--stage skills` was run on its own, or classify failed.
    // Falls back to the standalone call so the stage keeps working in isolation.
    const r = await callProvider('skills', skillsPrompt(input));
    const p = skillsSchema.parse(parseJson(r.text));
    return { skills: normalizeSkills(p.skills), meta: metaOf(r) };
  },
};

/** Test seam: drop the cross-stage skills cache between cases. */
export function __resetSkillsCache(): void {
  skillsFromClassify.clear();
}
