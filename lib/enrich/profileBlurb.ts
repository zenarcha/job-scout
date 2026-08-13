// D-39/D-47: `background_match` needs a SHORT profile blurb in the classify prompt —
// work history and education, not a skills list and not the full résumé.
// A skills array can produce "knows SQL"; only employment history produces
// "we overlapped at Infosys", which is the outreach material the tag exists for.
// Keeping it short also avoids reintroducing the résumé dependency D-38 removed.

interface ExperienceEntry {
  company?: string;
  title?: string;
  dates?: string;
  business_model?: string;
  domain?: string;
}

interface EducationEntry {
  institution?: string;
  degree?: string;
  field?: string;
}

export function buildProfileBlurb(profile: {
  summary?: string | null;
  experience?: unknown;
  education?: unknown;
} | null): string {
  if (!profile) return '';

  const experience = (Array.isArray(profile.experience) ? profile.experience : []) as ExperienceEntry[];
  const education = (Array.isArray(profile.education) ? profile.education : []) as EducationEntry[];

  const lines: string[] = [];

  for (const e of experience) {
    const context = [e.business_model, e.domain].filter(Boolean).join(' · ');
    const head = [e.title, e.company].filter(Boolean).join(' at ');
    const parts = [head, e.dates, context].filter(Boolean);
    if (parts.length) lines.push(`- ${parts.join(' — ')}`);
  }

  for (const ed of education) {
    const degree = [ed.degree, ed.field].filter(Boolean).join(' in ');
    const parts = [degree, ed.institution].filter(Boolean);
    if (parts.length) lines.push(`- ${parts.join(', ')}`);
  }

  if (profile.summary) lines.unshift(profile.summary);

  return lines.join('\n');
}
