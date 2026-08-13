// The remote-companies catalog (D-44): companies CONFIRMED to hire remote from India.
//
// Distinct from `company_watchlist`, which means "companies Sakshi is actively pursuing".
// This is an evidence file, not a to-do list — a company lands here because a real live
// posting proved it, with no commitment attached. Promotion catalog -> watchlist stays a
// deliberate manual act.
//
// D-139/D-142: confirmation used to fire at INGEST time for any job that survived the
// location pre-filter — before the AI had ever looked at `remote_type`, which isn't
// computed until the separate `enrich` run. That made "confirmed" mean "passed a weak
// regex", not "AI-verified remote" (measured: 91% of the catalog was never actually
// AI-confirmed). Callers now only invoke this from `classify`/`remote_check`, and only
// when `remote_type === 'remote_india'` — see those files for the call sites.
import { db } from '../db.js';

// A plain evidence shape, not `NormalizedJob` — the callers now are enrich stages
// working off a `jobs` DB row, not the original ingest-time scrape payload.
export interface RemoteCompanyEvidence {
  company: string | null;
  companySlug: string | null;
  postingUrl?: string | null;
  roleTitle?: string | null;
  // D-140: snapshotted here (not live-joined from `jobs`) because this catalog is meant
  // to survive `jobs` rows being dropped or truncated (as in D-138's reset).
  recruiterName?: string | null;
  recruiterLinkedin?: string | null;
  recruiterEmail?: string | null;
  hiringManager?: string | null;
  // D-140: 'fit' | 'stretch' | 'senior', or null when it can't be derived. Callers
  // compute this — see classify.ts (from years_experience_min) and remoteCheck.ts
  // (always 'senior', since D-133 gates remote_check to senior titles only).
  evidenceSeniority?: string | null;
  // D-144: only set when lib/enrich/salary.ts's regex parser found a real figure
  // (salary_status === 'stated') on a job already known to be remote_india. Not an AI
  // call — parseSalary is deterministic (D-12).
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

/**
 * Record (or re-confirm) a company as a remote-from-India hirer.
 *
 * Idempotent per company_slug: the first sighting sets `added_at`, every later one
 * refreshes `last_confirmed_at` and the evidence to the most recent posting. That is what
 * makes the dashboard's actively-hiring filter possible without storing a staleness-prone
 * boolean.
 *
 * Every field below EXCEPT evidence_url/evidence_note/last_confirmed_at is coalesced
 * against the existing row, not overwritten: a later call for the same job — e.g.
 * classify.ts confirms first, salary.ts confirms again moments later in the same
 * enrichJob() run once the salary stage has run — must not blank out a value the earlier
 * call already set just because this call doesn't happen to supply it. Recruiter contact,
 * seniority, and salary are all meant to be a permanent, outreach-ready record (D-140),
 * not just whatever the single most recent caller happened to know.
 *
 * Deliberately never throws: the catalog is a side-benefit of enrichment, not part of its
 * contract. A failure here must not cost a real job posting its classification — that
 * would trade a real verdict for a nice-to-have company record.
 */
export async function confirmRemoteCompany(evidence: RemoteCompanyEvidence): Promise<void> {
  if (!evidence.company || !evidence.companySlug) return;

  try {
    const { data: existing } = await db()
      .from('remote_companies')
      .select(
        'recruiter_name, recruiter_linkedin, recruiter_email, hiring_manager, evidence_seniority, evidence_salary_min, evidence_salary_max, evidence_salary_currency, evidence_salary_period',
      )
      .eq('company_slug', evidence.companySlug)
      .maybeSingle();

    const now = new Date().toISOString();
    // onConflict on company_slug: `added_at` is deliberately absent from the update set,
    // so a re-confirmation cannot overwrite the first-seen date.
    const { error } = await db()
      .from('remote_companies')
      .upsert(
        {
          company: evidence.company,
          company_slug: evidence.companySlug,
          evidence_url: evidence.postingUrl ?? null,
          evidence_note: evidence.roleTitle ? `Remote posting: ${evidence.roleTitle}` : null,
          evidence_seniority: evidence.evidenceSeniority ?? existing?.evidence_seniority ?? null,
          last_confirmed_at: now,
          recruiter_name: evidence.recruiterName ?? existing?.recruiter_name ?? null,
          recruiter_linkedin: evidence.recruiterLinkedin ?? existing?.recruiter_linkedin ?? null,
          recruiter_email: evidence.recruiterEmail ?? existing?.recruiter_email ?? null,
          hiring_manager: evidence.hiringManager ?? existing?.hiring_manager ?? null,
          evidence_salary_min: evidence.salaryMin ?? existing?.evidence_salary_min ?? null,
          evidence_salary_max: evidence.salaryMax ?? existing?.evidence_salary_max ?? null,
          evidence_salary_currency: evidence.salaryCurrency ?? existing?.evidence_salary_currency ?? null,
          evidence_salary_period: evidence.salaryPeriod ?? existing?.evidence_salary_period ?? null,
        },
        { onConflict: 'company_slug' },
      );
    if (error) throw error;
  } catch (e: any) {
    console.warn(`[remote_companies] could not confirm ${evidence.companySlug}: ${e?.message ?? e}`);
  }
}
