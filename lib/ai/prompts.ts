// Versioned prompts. Bump PROMPT_VERSION when wording changes; bump CLASSIFIER_VERSION
// when the output contract/rubric changes. Both are stored on every enrichment row so a
// quality shift can be traced to the prompt vs. the model.
export const PROMPT_VERSION = 'prompt-2026-07-10';
export const CLASSIFIER_VERSION = 'v1';

const JSON_ONLY = 'Respond with ONLY a single minified JSON object. No markdown, no code fences, no prose.';

export function classifyPrompt(input: { roleTitle: string; company: string; jd: string }): string {
  return `You are triaging a job posting for a Product Manager job seeker based in India who wants REMOTE roles.

Classify the role using these strict rubrics:

- remote_type: "remote_india" only if India-based candidates are clearly eligible (mentions India, Remote-India, Asia, Worldwide/Global remote, or no geo restriction). "remote_global" if remote but appears region-locked away from India. "other" if onsite/hybrid.
- is_technical: "technical" if the PM is expected to read code, write SQL, work deep in APIs/data/ML; else "non_technical".
- technical_depth: integer 1-5. 1 = pure stakeholder/ops PM. 3 = reads dashboards, writes basic SQL, works with APIs. 5 = writes queries/code, deep ML/infra fluency.
- is_ai: "ai" if the product or role centers on AI/ML/LLMs; else "non_ai".
- business_model: "saas" (sells software to businesses), "b2c" (consumer product), or "other".
- institute_requirement: "iit_iim_required" ONLY if IIT/IIM/"tier-1 institute" is a HARD requirement. "preferred" if mentioned as nice-to-have. Else "none".
- confidence: 0..1, your certainty in the above.
- reasoning: one short sentence.
- recruiter_name, recruiter_email, hiring_manager: extract if explicitly present, else null.

ROLE: ${input.roleTitle}
COMPANY: ${input.company}
JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: remote_type, is_technical, technical_depth, is_ai, business_model, institute_requirement, confidence, reasoning, recruiter_name, recruiter_email, hiring_manager.`;
}

export function resumeMatchPrompt(input: { jd: string; resume: string }): string {
  return `Score how well this candidate's resume matches the job (0-100). Consider role fit, required skills, seniority, and domain. Be calibrated: 85+ = strong fit, 60-84 = plausible, <60 = weak.

RESUME:
${input.resume}

JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: resume_match_score (integer 0-100), reasoning (one short sentence).`;
}

export function skillsPrompt(input: { jd: string }): string {
  return `Extract the concrete, hard skills/tools/methods this job requires or prefers. Normalize to short lowercase canonical names (e.g. "sql", "python", "a/b testing", "llm evaluation", "experimentation", "sql", "roadmapping", "stakeholder management"). Deduplicate. Max 15.

JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: skills (array of lowercase strings).`;
}

export function recommendPrompt(input: {
  roleTitle: string;
  company: string;
  companyWeight: number;
  resumeMatch: number | null;
  isAi: string | null;
  technicalDepth: number | null;
  remoteType: string | null;
  salaryStated: boolean;
}): string {
  return `Assign an application priority for this job seeker (Product Manager, India, remote-only) and list the reasons.

Signals:
- company watchlist weight (1-5): ${input.companyWeight}
- resume match (0-100): ${input.resumeMatch ?? 'unknown'}
- AI-focused: ${input.isAi ?? 'unknown'}
- technical depth (1-5): ${input.technicalDepth ?? 'unknown'}
- remote type: ${input.remoteType ?? 'unknown'}
- salary stated: ${input.salaryStated}
- role: ${input.roleTitle} @ ${input.company}

Rules of thumb: high weight + strong match + AI + remote_india => "high". Weak match or non-remote-India => "low". Otherwise "med".
Reasons: 2-5 short chips like "AI PM", "Remote India", "Technical L3", "84% match", "watchlist co".

${JSON_ONLY}
Keys: priority ("high"|"med"|"low"), reasons (array of short strings).`;
}
