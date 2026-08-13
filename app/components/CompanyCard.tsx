'use client';

import { Fragment } from 'react';
import type { CompanyRow } from '../../lib/supabaseBrowser';
import { SENIORITY_LABEL, daysAgo, salaryLabel } from '../../lib/dashboardFormat';

// D-140: a permanent archive, no live join to `jobs` — everything shown here was
// snapshotted onto `remote_companies` at confirmation time (see lib/discovery/
// remoteCompanies.ts), so a row still renders correctly even after `jobs` is truncated
// (as in D-138's reset). `evidence_seniority` absent (never AI-confirmed with a derivable
// bucket, or a pre-migration row) is shown unlabeled and is never hidden by the seniority
// filter — "not stated" staying visible, not defaulting to filtered out, is the same
// D-73/D-112 rule the jobs tab follows.
//
// D-142/D-156: recruiter contact is rendered here deliberately, and this page is public.
export function CompanyCard({ company, hiring, domains }: { company: CompanyRow; hiring: boolean; domains: string[] }) {
  const seniority = company.evidence_seniority && SENIORITY_LABEL[company.evidence_seniority] ? company.evidence_seniority : '';

  const contactBits: React.ReactNode[] = [];
  if (company.recruiter_name) contactBits.push(<span key="n">{company.recruiter_name}</span>);
  if (company.hiring_manager && company.hiring_manager !== company.recruiter_name)
    contactBits.push(<span key="h">{company.hiring_manager} (hiring manager)</span>);
  if (company.recruiter_email)
    contactBits.push(
      <a key="e" href={`mailto:${company.recruiter_email}`}>
        {company.recruiter_email}
      </a>,
    );
  if (company.recruiter_linkedin)
    contactBits.push(
      <a key="l" href={company.recruiter_linkedin} target="_blank" rel="noopener noreferrer">
        LinkedIn ↗
      </a>,
    );

  // D-144: salary is a snapshot on `remote_companies` itself (evidence_salary_*, set by
  // lib/enrich/salary.ts when a confirming job states a figure) — not derived from `jobs`
  // like hiring/domains are, so it survives `jobs` being truncated (D-138) same as the rest
  // of the archive. Reuses the Jobs tab's own salaryLabel() by mapping onto the shape it expects.
  const salary =
    company.evidence_salary_min != null || company.evidence_salary_max != null
      ? salaryLabel({
          salary_status: 'stated',
          salary_min: company.evidence_salary_min,
          salary_max: company.evidence_salary_max,
          salary_currency: company.evidence_salary_currency,
          salary_period: company.evidence_salary_period,
        })
      : null;

  return (
    <div className="co-row">
      <div className="co-row-top">
        <span className="co-name">{company.company}</span>
        <div className="co-tags">
          {hiring && <span className="tag hiring">Hiring now</span>}
          {domains.map((d) => (
            <span key={d} className="tag">
              {d}
            </span>
          ))}
          {seniority && <span className="tag">{SENIORITY_LABEL[seniority]}</span>}
        </div>
      </div>
      <div className="co-meta">
        First confirmed {daysAgo(company.added_at)} · Last confirmed {daysAgo(company.last_confirmed_at)}
      </div>
      {company.evidence_note && (
        <p className="co-evidence">
          {company.evidence_note}
          {company.evidence_url && (
            <>
              {' — '}
              <a href={company.evidence_url} target="_blank" rel="noopener noreferrer">
                view posting ↗
              </a>
            </>
          )}
        </p>
      )}
      {salary && (
        <div className="co-salary">
          <span className={salary.soft ? 'sal soft' : 'sal'}>{salary.text}</span>
        </div>
      )}
      {contactBits.length > 0 ? (
        <div className="co-contact">
          {/* A Fragment, not a wrapper element: `.co-contact` is a flex row and the
              separators are its direct children, exactly as in the snapshot's markup. */}
          {contactBits.map((bit, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="sep">·</span>}
              {bit}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="co-contact soft">No recruiter contact captured yet.</div>
      )}
    </div>
  );
}
