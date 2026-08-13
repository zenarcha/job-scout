'use client';

import type { JobRow } from '../../lib/supabaseBrowser';
import { blockers, daysAgo, salaryLabel, verdictOf } from '../../lib/dashboardFormat';

export function JobDetail({
  job,
  onClose,
  onExplain,
}: {
  job: JobRow;
  onClose: () => void;
  onExplain: (key: string) => void;
}) {
  const v = verdictOf(job.priority);
  const reasons = Array.isArray(job.recommend_reasons) ? job.recommend_reasons : [];
  const bl = blockers(job);
  const skills = Array.isArray(job.skills) ? job.skills : [];

  const why =
    job.classify_status === 'not_evaluated'
      ? 'The AI has not read this posting yet, so there is no verdict — not a poor one. The full description is below.'
      : reasons.length
        ? `Matched on: ${reasons.join(' · ')}`
        : 'No matching signals were found in this posting.';

  // Paragraphs are split on blank lines, the same way the stored `jd_clean` is written.
  const paragraphs = job.jd_clean ? job.jd_clean.split(/\n{2,}/) : null;

  return (
    <>
      <div className="dp-bar">
        <button className="dp-close" onClick={onClose}>
          Close ✕
        </button>
      </div>

      <div className="id-row">
        <div className="logo">{(job.company || '??').slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="co">{job.company}</div>
          <div className="src">via {job.source}</div>
        </div>
      </div>
      <h2>{job.role_title}</h2>
      <p className="subline">
        {job.location || 'Location not stated'} · {daysAgo(job.posted_at || job.first_seen_at)}
      </p>

      <div className="tier1">
        <div className="t1-top">
          <span className="t1-q">Should I apply?</span>
          <span className={`verdict lg ${v.cls}`}>{v.label}</span>
        </div>
        <p className="t1-why">{why}</p>
      </div>

      <div className="tier3">
        <div className="actions">
          <a
            className="btn primary"
            href={job.apply_url || job.posting_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open posting ↗
          </a>
          {job.link_status && job.link_status !== 'ok' && <span className="chip soft">link {job.link_status}</span>}
          <button className="btn" onClick={() => onExplain('shortlist')}>
            ☆ Shortlist
          </button>
          <button className="btn" onClick={() => onExplain('tailor')}>
            Tailor résumé
          </button>
        </div>
      </div>

      <div className="tier2">
        {job.role_summary && <p className="t2-summary">{job.role_summary}</p>}
        <div className="chips">
          {job.domain && <span className="chip ind">{job.domain}</span>}
          {job.remote_type && <span className="chip">{job.remote_type.replace('_', ' ')}</span>}
          <span className="chip mono">{salaryLabel(job).text}</span>
        </div>
        {bl.length > 0 && (
          <>
            <p className="skills-head">Watch out for</p>
            <ul className="blockers">
              {bl.map(([t, d]) => (
                <li key={t}>
                  <b>{t}</b> — {d}
                </li>
              ))}
            </ul>
          </>
        )}
        {/* Flat list, no have/gap split: `profile` has 0 rows, so a "you have this / you
            lack this" view would be invented rather than computed. */}
        {skills.length > 0 && (
          <>
            <p className="skills-head">Skills asked for</p>
            <div className="skills">
              {skills.map((s, i) => (
                <span key={`${s.skill}-${i}`} className={s.required ? 'sk gap' : 'sk'}>
                  {s.skill}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="tier4">
        <h3 className="sec">Full job description</h3>
        <div className="jd">
          {paragraphs ? (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p>
              <em>No description stored.</em>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
