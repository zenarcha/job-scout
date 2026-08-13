// Browser-side Supabase client — the anon key, and ONLY the anon key (D-110).
//
// The counterpart to `lib/db.ts`, which holds the service-role client and must never be
// imported from anything that ships to a browser. This file is the reverse: it is safe in
// the bundle by construction, because `NEXT_PUBLIC_*` is the only env prefix Next exposes
// to client code and neither value here is a secret.
//
// What actually protects the data is not this file — it is migration 0015 (D-157): anon
// holds SELECT on `v_jobs_public` and `remote_companies` and nothing else, RLS policies
// scope the rows, and column-level grants exclude both copies of recruiter PII (the four
// `jobs` columns and `job_enrichments.raw_output`). Reading this key out of the shipped
// bundle gets an attacker exactly what the page already shows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Written as literal `process.env.NEXT_PUBLIC_…` lookups because that is the form Next
// substitutes at build time; a computed key would compile to `undefined` in the browser.
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

export function browserDb(): SupabaseClient {
  if (!URL_ || !ANON) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Set both in .env.local ' +
        'locally and in Vercel → Settings → Environment Variables for the deployment.',
    );
  }
  if (!_client) {
    _client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _client;
}

// The Jobs tab reads `v_jobs_public`, NOT `v_jobs_enriched`. The enriched view selects
// `j.*` and therefore carries recruiter contact columns; the public one enumerates its
// columns explicitly so a future column added to `jobs` cannot silently join the public
// surface. That distinction is the whole of D-115 — do not "simplify" this to the other view.
const JOB_COLUMNS =
  'id, company, company_slug, role_title, location, posting_url, apply_url, link_status, source, posted_at, first_seen_at, jd_clean,' +
  'priority, classify_status, recommend_reasons, role_summary, domain, is_technical, is_ai,' +
  'technical_depth, institute_requirement, years_experience_min, years_experience_max,' +
  'remote_type, skills, salary_min, salary_max, salary_currency, salary_period, salary_status, is_junior_title';

const COMPANY_COLUMNS =
  'company, company_slug, evidence_url, evidence_note, evidence_seniority, added_at, ' +
  'last_confirmed_at, recruiter_name, recruiter_linkedin, recruiter_email, hiring_manager, ' +
  'evidence_salary_min, evidence_salary_max, evidence_salary_currency, evidence_salary_period';

export interface Skill {
  skill: string;
  required?: boolean | null;
}

export interface JobRow {
  id: string;
  company: string | null;
  company_slug: string | null;
  role_title: string | null;
  location: string | null;
  posting_url: string | null;
  apply_url: string | null;
  link_status: string | null;
  source: string | null;
  posted_at: string | null;
  first_seen_at: string | null;
  jd_clean: string | null;
  priority: string | null;
  classify_status: string | null;
  recommend_reasons: string[] | null;
  role_summary: string | null;
  domain: string | null;
  is_technical: string | null;
  is_ai: string | null;
  technical_depth: number | null;
  institute_requirement: string | null;
  years_experience_min: number | null;
  years_experience_max: number | null;
  remote_type: string | null;
  skills: Skill[] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_status: string | null;
  is_junior_title: boolean | null;
}

// D-142: this row carries recruiter contact details, and D-156 puts it on a public URL
// deliberately. Anything added here is published.
export interface CompanyRow {
  company: string | null;
  company_slug: string | null;
  evidence_url: string | null;
  evidence_note: string | null;
  evidence_seniority: string | null;
  added_at: string | null;
  last_confirmed_at: string | null;
  recruiter_name: string | null;
  recruiter_linkedin: string | null;
  recruiter_email: string | null;
  hiring_manager: string | null;
  evidence_salary_min: number | null;
  evidence_salary_max: number | null;
  evidence_salary_currency: string | null;
  evidence_salary_period: string | null;
}

// Both tabs are fetched together: the Remote Companies tab's "Hiring now" and Industry
// tags are derived from the jobs list (see `companyJobInfo` in app/page.tsx), so a tab
// switch must not trigger a second round trip against data the page already has.
export async function fetchDashboard(): Promise<{ jobs: JobRow[]; companies: CompanyRow[] }> {
  const supabase = browserDb();

  const [jobsRes, companiesRes] = await Promise.all([
    supabase.from('v_jobs_public').select(JOB_COLUMNS).order('first_seen_at', { ascending: false }),
    supabase.from('remote_companies').select(COMPANY_COLUMNS).order('last_confirmed_at', { ascending: false }),
  ]);

  if (jobsRes.error) throw new Error(`v_jobs_public: ${jobsRes.error.message}`);
  if (companiesRes.error) throw new Error(`remote_companies: ${companiesRes.error.message}`);

  return {
    jobs: (jobsRes.data ?? []) as unknown as JobRow[],
    companies: (companiesRes.data ?? []) as unknown as CompanyRow[],
  };
}
