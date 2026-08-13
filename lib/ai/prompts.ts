// Versioned prompts. Bump PROMPT_VERSION when wording changes; bump CLASSIFIER_VERSION
// when the output contract/rubric changes. Both are stored on every enrichment row so a
// quality shift can be traced to the prompt vs. the model.
//
// v2 (2026-08-05): classify gains geo_explicit (D-73), domain + background_match +
// background_match_suggested (D-39/D-67/D-68), and LOSES institute_requirement, which
// D-57 moved out of the AI call to a regex. skills now returns {skill, required} pairs.
// recommend is no longer a prompt at all — D-53 made it a deterministic rule in code.
//
// v3 (2026-08-06): classify gains role_summary (D-92) and years_experience_min/max
// (D-94). Both ride this call rather than a new one — extra output tokens on a
// request that is already happening, which is what keeps them inside D-5's $0
// constraint. Three new outputs is a change to the output contract, so
// CLASSIFIER_VERSION moves too, not just PROMPT_VERSION.
// v5 (2026-08-08): `location` is finally SHOWN to the model. It was captured at
// ingest, stored, and rendered on the dashboard — but passed to no prompt, so the
// classifier chose between three geography labels while blind to the geography field.
// `geoRecheckPrompt` was the sharpest case: it instructed the model to weigh "phrasing
// that presumes a location" while withholding the location. Paired with a rubric that
// said mark it remote_india if the posting "mentions India" — which every Bengaluru
// office posting does — that is why on-site Indian roles came out `remote_india`.
// The rubric now judges WHERE THE WORK IS DONE, and names the Kira/China shape
// explicitly: remote but region-locked is `remote_global`, never `other`.
// Inputs and wording only, so PROMPT_VERSION moves and CLASSIFIER_VERSION does not (D-9).
//
// v4 (2026-08-07): skills moves INTO the classify call (D-117a). The quota counts
// requests, not tokens (D-111), so two calls over the same JD cost twice as much as
// one that answers both — for no benefit, since both are the same kind of extraction
// from the same document. Third application of the D-92/D-94 reasoning. The skills
// rubric below is the FORMER skillsPrompt wording verbatim, deliberately unchanged, so
// the regression comparison measures the merge and not a rewrite. A new output key is
// an output-contract change, so CLASSIFIER_VERSION moves too.
//
// v6 (2026-08-13): remote_type's third rubric value renamed "other" -> "not_remote"
// (D-150) — "other" read like a third flavor of remote next to remote_india/
// remote_global when it means on-site or hybrid. Same wording change applied to
// remoteCheckPrompt, which copies this rubric verbatim (see its own comment). Wording
// only, the value set is unchanged (still 3 options), so PROMPT_VERSION moves and
// CLASSIFIER_VERSION does not. Skips v5 as an exported const — that label was already
// used descriptively above for a change that never actually bumped the const.
export const PROMPT_VERSION = 'prompt-2026-08-13';
export const CLASSIFIER_VERSION = 'v4';

const JSON_ONLY = 'Respond with ONLY a single minified JSON object. No markdown, no code fences, no prose.';

export function classifyPrompt(input: {
  roleTitle: string;
  company: string;
  location?: string | null;
  jd: string;
  profileBlurb: string;
  backgroundVocabulary: string[];
}): string {
  const vocab = input.backgroundVocabulary.map((t) => `"${t}"`).join(', ');
  return `You are triaging a job posting for a Product Manager job seeker based in India who wants REMOTE roles.

Classify the role using these strict rubrics:

- remote_type: judge WHERE THE WORK IS DONE, using the LOCATION field below as well as the description.
  "remote_india" = the role is remote AND someone living in India may hold it (says Remote-India, Asia, Worldwide/Global remote, hiring anywhere, OR is remote with no geographic restriction stated).
  "remote_global" = the role is REMOTE but restricted to a region that is not India (e.g. "remote, but candidates must be based in China", "US-remote only", "remote within EMEA"). Being remote is not enough — if an India-based person could not hold it, it is NOT remote_india.
  "not_remote" = on-site or hybrid; the role requires attending a workplace.
  A posting simply NAMING an Indian city (Bengaluru, Hyderabad, Mumbai, Noida) is an OFFICE LOCATION and is evidence of "not_remote", NOT of "remote_india". Mentioning India is not the same as being remote-eligible from India; say "remote_india" only when the work itself is remote.
- geo_explicit: true ONLY if the posting explicitly states its geographic eligibility (names India/Asia/Worldwide/Global remote, or names a specific region). false if you inferred remote_type from the ABSENCE of any geographic statement. Be strict: when in doubt, false.
- is_technical: "technical" if the PM is expected to read code, write SQL, work deep in APIs/data/ML; else "non_technical".
- technical_depth: integer 1-5. 1 = pure stakeholder/ops PM. 3 = reads dashboards, writes basic SQL, works with APIs. 5 = writes queries/code, deep ML/infra fluency.
- is_ai: "ai" if the product or role centers on AI/ML/LLMs; else "non_ai".
- business_model: "saas" (sells software to businesses), "b2c" (consumer product), or "other".
- domain: what the company/product actually does, as a short lowercase phrase (e.g. "hr_tech", "fintech", "devtools", "edtech", "customer support tooling"). Objective — describes the company, not the candidate. null if genuinely unclear.
- background_match: array of tags from THIS EXACT LIST, and nothing else: [${vocab}]. Include a tag only when the candidate's background below genuinely connects to this role. Empty array if none apply. Never invent a tag.
- background_match_suggested: array of short free-text phrases for genuine overlaps that NO tag above covers. Empty array if none. These are suggestions for review, not classifications.
- role_summary: ONE sentence, max 20 words, saying what this person would actually DO day to day — the product they would own and the work involved. Write it from the job description's responsibilities, NOT from the company blurb. Do NOT describe what the company sells, its size, its funding, or its mission. Bad: "A fast-growing leader in HR technology." Good: "Own the candidate-screening product end to end, working with a data science team." Use null if the posting genuinely never says what the work is.
- years_experience_min / years_experience_max: integer years of experience the posting asks for, or null. Read the whole posting, not just a "Requirements" heading — this appears as "3-6 years", "3+ years", "minimum three years", "at least 3 yrs", and in prose. A closed range "3-6 years" sets min 3 and max 6. An open-ended "3+ years" or "minimum 3 years" sets min 3 and max null. A single figure "5 years of experience" sets both to 5. If the posting states no experience requirement at all, both are null — do NOT guess a number from the seniority of the title, and do NOT return 0 to mean "not stated".
- confidence: 0..1, your certainty in the above.
- reasoning: one short sentence.
- recruiter_name, recruiter_email, hiring_manager: extract if explicitly present, else null.
- skills: the concrete, hard skills/tools/methods this job requires or prefers. Normalize to short lowercase canonical names (e.g. "sql", "python", "a/b testing", "llm evaluation", "experimentation", "roadmapping", "stakeholder management"). Deduplicate. Max 15. For each skill, set "required": true if the posting treats it as a hard requirement ("must have", "required", listed under Requirements/Qualifications), or false if it is a preference ("nice to have", "a plus", "bonus", listed under Preferred). When the posting does not distinguish, judge from phrasing and default to false. Empty array if the posting names no concrete skills.

CANDIDATE BACKGROUND (for background_match only):
${input.profileBlurb}

ROLE: ${input.roleTitle}
COMPANY: ${input.company}
LOCATION (the posting's own structured location field): ${input.location?.trim() || 'not stated'}
JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: remote_type, geo_explicit, is_technical, technical_depth, is_ai, business_model, domain, background_match, background_match_suggested, role_summary, years_experience_min, years_experience_max, confidence, reasoning, recruiter_name, recruiter_email, hiring_manager, skills (array of objects, each {"skill": string, "required": boolean}).`;
}

// D-75: a second, narrower pass over jobs that classify accepted only by the
// fail-open default (remote_type = 'remote_india' AND geo_explicit = false).
// Deliberately a separate call rather than more rubric inside classifyPrompt —
// this one question can carry far richer instruction than a shared eight-output
// prompt can afford, and it only runs on a small subset.
export function geoRecheckPrompt(input: { roleTitle: string; company: string; location?: string | null; jd: string }): string {
  return `A job posting did not state its geographic eligibility. Decide ONE question: could a candidate based in INDIA, working remotely, plausibly hold this role?

Weigh indirect signals in the posting:
- Work authorization language ("must be authorized to work in the US", "right to work in the UK") — strong evidence AGAINST.
- Timezone requirements ("must overlap 9-5 PT", "core hours EST") — a demand for near-full overlap with a US/EU timezone is evidence against; a few hours of overlap is not.
- Phrasing that presumes a location ("our US-based team", "occasional travel to our NYC office", "hybrid from Berlin").
- Payroll/contracting hints ("W2", "must be a US entity", "local employment contract required").
- Company headquarters and where the posting says the team sits.

Rules:
- Absence of evidence is NOT evidence against. If the posting simply says nothing about location or authorization, answer "uncertain".
- Answer "ineligible" only when there is a concrete signal an India-based candidate could not hold the role.
- Answer "eligible" when indirect signals positively suggest global/distributed hiring (e.g. "we hire anywhere", named team members across continents, async-first culture).

Output:
- geo_verdict: "eligible" | "ineligible" | "uncertain"
- reasoning: one short sentence QUOTING or naming the specific signal you used. If there was no signal, say so plainly.

ROLE: ${input.roleTitle}
COMPANY: ${input.company}
LOCATION (the posting's own structured location field): ${input.location?.trim() || 'not stated'}
JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: geo_verdict, reasoning.`;
}

// D-136: standalone remote-only pass for senior-titled jobs, which D-133 excludes from
// `classify` entirely. Rubric wording for remote_type/geo_explicit is copied VERBATIM
// from classifyPrompt above so the two calls can't silently drift into different
// judgment criteria over time — if that rubric changes, change both call sites.
// Deliberately 3 output keys, not classify's 17 — this must stay the cheap call.
export function remoteCheckPrompt(input: { roleTitle: string; company: string; location?: string | null; jd: string }): string {
  return `You are triaging a job posting for a Product Manager job seeker based in India who wants REMOTE roles. Judge ONLY where the work is done — nothing else about the role.

- remote_type: judge WHERE THE WORK IS DONE, using the LOCATION field below as well as the description.
  "remote_india" = the role is remote AND someone living in India may hold it (says Remote-India, Asia, Worldwide/Global remote, hiring anywhere, OR is remote with no geographic restriction stated).
  "remote_global" = the role is REMOTE but restricted to a region that is not India (e.g. "remote, but candidates must be based in China", "US-remote only", "remote within EMEA"). Being remote is not enough — if an India-based person could not hold it, it is NOT remote_india.
  "not_remote" = on-site or hybrid; the role requires attending a workplace.
  A posting simply NAMING an Indian city (Bengaluru, Hyderabad, Mumbai, Noida) is an OFFICE LOCATION and is evidence of "not_remote", NOT of "remote_india". Mentioning India is not the same as being remote-eligible from India; say "remote_india" only when the work itself is remote.
- geo_explicit: true ONLY if the posting explicitly states its geographic eligibility (names India/Asia/Worldwide/Global remote, or names a specific region). false if you inferred remote_type from the ABSENCE of any geographic statement. Be strict: when in doubt, false.
- reasoning: one short sentence naming the specific signal you used.

ROLE: ${input.roleTitle}
COMPANY: ${input.company}
LOCATION (the posting's own structured location field): ${input.location?.trim() || 'not stated'}
JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: remote_type, geo_explicit, reasoning.`;
}

// D-117a: no longer used by the pipeline — `classify` now returns skills on the same
// call. Kept as the standalone fallback for `npm run enrich -- --stage skills`, which
// runs the skills stage on its own with no classify call to ride. Wording is identical
// to the rubric now embedded in classifyPrompt; if one changes, change both.
export function skillsPrompt(input: { jd: string }): string {
  return `Extract the concrete, hard skills/tools/methods this job requires or prefers. Normalize to short lowercase canonical names (e.g. "sql", "python", "a/b testing", "llm evaluation", "experimentation", "roadmapping", "stakeholder management"). Deduplicate. Max 15.

For each skill, set "required": true if the posting treats it as a hard requirement ("must have", "required", listed under Requirements/Qualifications), or false if it is a preference ("nice to have", "a plus", "bonus", listed under Preferred). When the posting does not distinguish, judge from phrasing and default to false.

JOB DESCRIPTION:
${input.jd}

${JSON_ONLY}
Keys: skills (array of objects, each {"skill": string, "required": boolean}).`;
}
