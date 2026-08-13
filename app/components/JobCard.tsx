'use client';

import type { JobRow } from '../../lib/supabaseBrowser';
import { daysAgo, salaryLabel, verdictOf } from '../../lib/dashboardFormat';

export function SalaryChip({ job, className = 'sal' }: { job: JobRow; className?: string }) {
  const { text, soft } = salaryLabel(job);
  return <span className={soft ? `${className} soft` : className}>{text}</span>;
}

export function JobCard({ job, selected, onOpen }: { job: JobRow; selected: boolean; onOpen: () => void }) {
  const v = verdictOf(job.priority);

  const tags: React.ReactNode[] = [];
  if (job.domain) tags.push(<span key="d" className="tag ind">{job.domain}</span>);
  if (job.is_technical)
    tags.push(
      <span key="t" className="tag">{job.is_technical === 'technical' ? 'Technical' : 'Not very technical'}</span>,
    );
  if (job.years_experience_min != null)
    tags.push(<span key="y" className="tag blk">{job.years_experience_min}+ yrs</span>);
  if (job.institute_requirement === 'iit_iim_required')
    tags.push(<span key="i" className="tag blk">IIT/IIM</span>);

  return (
    <button className={selected ? 'card selected' : 'card'} onClick={onOpen}>
      <div className="card-top">
        <p className="job-title">{job.role_title}</p>
        <span className={`verdict ${v.cls}`}>{v.label}</span>
      </div>
      {/* An unevaluated job has no summary to show. Say so rather than leaving a gap that
          reads as "we looked and there was nothing to say" — the D-112 collapse, on screen. */}
      {job.role_summary ? (
        <p className="summary">{job.role_summary}</p>
      ) : (
        <p className="summary soft">
          {job.classify_status === 'not_evaluated'
            ? 'Not read by the AI yet — the description is still there to read.'
            : 'No summary produced.'}
        </p>
      )}
      <div className="meta">
        <span>{job.location || 'Location not stated'}</span>
        <span className="sep">·</span>
        <span>{daysAgo(job.posted_at || job.first_seen_at)}</span>
        <span className="sep">·</span>
        <SalaryChip job={job} />
      </div>
      {tags.length > 0 && <div className="tags">{tags}</div>}
    </button>
  );
}
