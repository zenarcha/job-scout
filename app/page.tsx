'use client';

// The dashboard, ported from `dashboard-live.html` (D-119's static snapshot) to the real
// Next.js app D-110 specified. The snapshot is the spec: same tabs, same filters, same
// defaults, same wording. What changes is only how it gets there — the browser reads
// Supabase itself through the anon key (see lib/supabaseBrowser.ts) instead of a script
// baking HTML at build time, so the page is never stale.
//
// The snapshot filtered by toggling CSS classes on pre-rendered DOM because it had no
// framework. Here the same rules are React state. The rules themselves are unchanged, and
// the ones that matter are the "absent is not negative" ones (D-73/D-112): a job the AI has
// not read yet is `unknown`, never on-site; a job with no domain is never hidden by an
// Industry chip; a company with no seniority snapshot is never hidden by the Role level filter.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDashboard, type CompanyRow, type JobRow } from '../lib/supabaseBrowser';
import { EXPLAIN, bucketExperience, remoteBucket, verdictKey } from '../lib/dashboardFormat';
import { JobCard } from './components/JobCard';
import { JobDetail } from './components/JobDetail';
import { CompanyCard } from './components/CompanyCard';
import { FilterChip } from './components/FilterChip';

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'jobs' | 'companies'>('jobs');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<[string, string] | null>(null);

  // Jobs-tab filter defaults, copied from the snapshot's chip markup: every verdict on;
  // Remote + Not checked on but On-site off; "Right for me" on but Stretch/Senior off;
  // every Industry chip on. The three exclusions start off — they read as actions, not
  // categories, which is why they are inverted controls.
  const [verdictAllow, setVerdictAllow] = useState<Set<string>>(new Set(['high', 'med', 'low', 'unknown']));
  const [remoteAllow, setRemoteAllow] = useState<Set<string>>(new Set(['remote', 'unknown']));
  const [expAllow, setExpAllow] = useState<Set<string>>(new Set(['fit']));
  // Held as the set of *excluded* domains so "all on" needs no knowledge of which domains
  // exist — the list comes from the data and changes every run.
  const [domainOff, setDomainOff] = useState<Set<string>>(new Set());
  const [hideIit, setHideIit] = useState(false);
  const [onlyAi, setOnlyAi] = useState(false);
  const [hideTech, setHideTech] = useState(false);

  // Companies-tab filters: empty set = show everyone (D-140/D-144).
  const [senioritySel, setSenioritySel] = useState<Set<string>>(new Set());
  const [hiringSel, setHiringSel] = useState<Set<string>>(new Set());
  const [coDomainSel, setCoDomainSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchDashboard()
      .then(({ jobs, companies }) => {
        if (cancelled) return;
        setJobs(jobs);
        setCompanies(companies);
        setLoadedAt(new Date());
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeJob = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modal) setModal(null);
      else closeJob();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeJob, modal]);

  // D-148: the Jobs tab shows junior-titled postings ONLY. A senior-titled job can never get
  // a priority verdict — D-133 excludes it from classify/recommend entirely — so it sat as
  // "Pending" forever, indistinguishable from a junior job that just hasn't been enriched yet.
  const jobsForDisplay = useMemo(() => (jobs ?? []).filter((j) => j.is_junior_title === true), [jobs]);

  // Senior-titled jobs are NOT excluded here: the Remote Companies tab's hiring/domain
  // signals are derived from every posting, not just the ones the Jobs tab renders.
  const companyJobInfo = useMemo(() => {
    const map = new Map<string, { hiring: boolean; domains: Set<string> }>();
    for (const j of jobs ?? []) {
      if (!j.company_slug) continue;
      if (!map.has(j.company_slug)) map.set(j.company_slug, { hiring: false, domains: new Set() });
      const info = map.get(j.company_slug)!;
      // Unknown link_status counts as still-open — the same absent-isn't-negative rule
      // used everywhere else in this project.
      if (!['closed', 'expired', 'not_found'].includes(j.link_status ?? '')) info.hiring = true;
      if (j.domain) info.domains.add(j.domain);
    }
    return map;
  }, [jobs]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobsForDisplay) c[verdictKey(j.priority)] = (c[verdictKey(j.priority)] ?? 0) + 1;
    return c;
  }, [jobsForDisplay]);

  const onsiteCount = useMemo(
    () => jobsForDisplay.filter((j) => j.remote_type === 'not_remote').length,
    [jobsForDisplay],
  );
  const expCount = useCallback(
    (b: string) => jobsForDisplay.filter((j) => bucketExperience(j.years_experience_min) === b).length,
    [jobsForDisplay],
  );
  // Generated from the values actually present: the mock hardcodes three industries, real
  // data has many and they change every run.
  const domains = useMemo(
    () => [...new Set(jobsForDisplay.map((j) => j.domain).filter((d): d is string => !!d))].sort(),
    [jobsForDisplay],
  );

  const isVisible = useCallback(
    (j: JobRow) =>
      verdictAllow.has(verdictKey(j.priority)) &&
      remoteAllow.has(remoteBucket(j.remote_type)) &&
      expAllow.has(bucketExperience(j.years_experience_min)) &&
      // A job with no domain is never hidden by the Industry chips — it has not been
      // categorised, which is not the same as belonging to an excluded category.
      (!j.domain || !domainOff.has(j.domain)) &&
      !(hideIit && j.institute_requirement === 'iit_iim_required') &&
      !(onlyAi && j.is_ai !== 'ai') &&
      !(hideTech && j.is_technical === 'technical'),
    [verdictAllow, remoteAllow, expAllow, domainOff, hideIit, onlyAi, hideTech],
  );

  const visibleJobs = useMemo(() => jobsForDisplay.filter(isVisible), [jobsForDisplay, isVisible]);

  // Grouped by company, preserving newest-first order of first appearance — the mock's
  // structure (D-93). A heading whose jobs are all filtered out disappears with them,
  // rather than leaving a heading for nothing.
  const groups = useMemo(() => {
    const byCompany = new Map<string, JobRow[]>();
    for (const j of visibleJobs) {
      const key = j.company ?? '';
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(j);
    }
    return [...byCompany.entries()];
  }, [visibleJobs]);

  // Total company count in the topbar counts every company with a displayable job, not
  // just the ones surviving the current filters.
  const totalCompanies = useMemo(
    () => new Set(jobsForDisplay.map((j) => j.company ?? '')).size,
    [jobsForDisplay],
  );

  // Deriving the open job from the *visible* list is what closes the detail pane when the
  // job showing in it gets filtered away.
  const selectedJob = visibleJobs.find((j) => j.id === selectedId) ?? null;

  // ...and this makes that closure stick. The snapshot called `closeJob()` outright when the
  // open card was filtered out, so widening the filters again left the pane closed. Deriving
  // alone would silently re-open it, which is a different behaviour: the job would reappear
  // in the pane without the reader having chosen it.
  useEffect(() => {
    if (selectedId && !selectedJob) setSelectedId(null);
  }, [selectedId, selectedJob]);

  const companyRows = useMemo(() => {
    return (companies ?? []).map((c) => {
      const info = c.company_slug ? companyJobInfo.get(c.company_slug) : undefined;
      return { company: c, hiring: info?.hiring ?? false, domains: info ? [...info.domains].sort() : [] };
    });
  }, [companies, companyJobInfo]);

  const visibleCompanies = useMemo(
    () =>
      companyRows.filter(({ company, hiring, domains }) => {
        const s = company.evidence_seniority;
        const seniorOk = senioritySel.size === 0 || !s || senioritySel.has(s);
        const hiringOk = hiringSel.size === 0 || hiringSel.has(hiring ? '1' : '0');
        const domainOk = coDomainSel.size === 0 || domains.length === 0 || domains.some((d) => coDomainSel.has(d));
        return seniorOk && hiringOk && domainOk;
      }),
    [companyRows, senioritySel, hiringSel, coDomainSel],
  );

  const seniorityCount = useCallback(
    (b: string) => (companies ?? []).filter((c) => c.evidence_seniority === b).length,
    [companies],
  );
  const hiringCount = useCallback(
    (v: boolean) => companyRows.filter((r) => r.hiring === v).length,
    [companyRows],
  );
  const companyDomains = useMemo(
    () => [...new Set([...companyJobInfo.values()].flatMap((v) => [...v.domains]))].sort(),
    [companyJobInfo],
  );

  if (error) {
    return (
      <>
        <div className="topbar">
          <h1>
            job<span className="dot">·</span>scout
          </h1>
        </div>
        <p className="empty">Could not load from Supabase — {error}</p>
      </>
    );
  }

  if (!jobs || !companies) {
    return (
      <>
        <div className="topbar">
          <h1>
            job<span className="dot">·</span>scout
          </h1>
        </div>
        <p className="empty">Loading…</p>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>
          job<span className="dot">·</span>scout
        </h1>
        <span className="count">
          {jobsForDisplay.length} jobs · {totalCompanies} companies
        </span>
      </div>

      <nav className="mainnav">
        <button className={tab === 'jobs' ? 'navitem active' : 'navitem'} onClick={() => setTab('jobs')}>
          <span className="navicon" aria-hidden="true">
            💼
          </span>
          Jobs<span className="navcount">{jobsForDisplay.length}</span>
        </button>
        <button className={tab === 'companies' ? 'navitem active' : 'navitem'} onClick={() => setTab('companies')}>
          <span className="navicon" aria-hidden="true">
            🏢
          </span>
          Remote companies<span className="navcount">{companies.length}</span>
        </button>
      </nav>

      <div className={tab === 'jobs' ? 'view' : 'view hidden'}>
        <div className="banner">
          <strong>Live data</strong> — read from Supabase in your browser
          {loadedAt ? ` at ${loadedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}. Yes{' '}
          {counts.high ?? 0} · Maybe {counts.med ?? 0} · Probably not {counts.low ?? 0} ·{' '}
          <b>Pending {counts.unknown ?? 0}</b>. <b>{onsiteCount} are on-site</b> (<code>remote_type=not_remote</code>)
          and hidden by default — nothing downstream currently acts on that field.
        </div>

        <div className="filterbar">
          <div className="fgroup">
            <span className="flabel">Should I apply?</span>
            {(
              [
                ['high', 'Yes'],
                ['med', 'Maybe'],
                ['low', 'Probably not'],
                ['unknown', 'Pending'],
              ] as const
            ).map(([v, label]) => (
              <FilterChip key={v} active={verdictAllow.has(v)} onClick={() => setVerdictAllow((s) => toggle(s, v))}>
                {label}
              </FilterChip>
            ))}
          </div>

          <div className="fgroup">
            <span className="flabel">Location</span>
            <FilterChip active={remoteAllow.has('remote')} onClick={() => setRemoteAllow((s) => toggle(s, 'remote'))}>
              Remote
            </FilterChip>
            <FilterChip active={remoteAllow.has('unknown')} onClick={() => setRemoteAllow((s) => toggle(s, 'unknown'))}>
              Not checked
            </FilterChip>
            <FilterChip active={remoteAllow.has('onsite')} onClick={() => setRemoteAllow((s) => toggle(s, 'onsite'))}>
              On-site ({onsiteCount})
            </FilterChip>
          </div>

          <div className="fgroup">
            <span className="flabel">Experience</span>
            <FilterChip active={expAllow.has('fit')} onClick={() => setExpAllow((s) => toggle(s, 'fit'))}>
              Right for me ({expCount('fit')})
            </FilterChip>
            <FilterChip active={expAllow.has('stretch')} onClick={() => setExpAllow((s) => toggle(s, 'stretch'))}>
              Stretch · 4–6 yrs ({expCount('stretch')})
            </FilterChip>
            <FilterChip active={expAllow.has('senior')} onClick={() => setExpAllow((s) => toggle(s, 'senior'))}>
              Too senior · 7+ ({expCount('senior')})
            </FilterChip>
          </div>

          <div className="fgroup">
            <span className="flabel">AI focus</span>
            <FilterChip active={onlyAi} onClick={() => setOnlyAi((v) => !v)}>
              AI roles only
            </FilterChip>
          </div>

          <div className="fgroup">
            <span className="flabel">Technical</span>
            <FilterChip active={hideTech} onClick={() => setHideTech((v) => !v)}>
              Hide deep-technical
            </FilterChip>
          </div>

          <div className="fgroup" style={{ border: 'none' }}>
            <span className="flabel">IIT/IIM</span>
            <FilterChip active={hideIit} onClick={() => setHideIit((v) => !v)}>
              Hide those
            </FilterChip>
          </div>

          {domains.length > 0 && (
            <div className="fgroup" style={{ border: 'none', flexWrap: 'wrap' }}>
              <span className="flabel">Industry</span>
              {domains.map((d) => (
                <FilterChip key={d} active={!domainOff.has(d)} onClick={() => setDomainOff((s) => toggle(s, d))}>
                  {d}
                </FilterChip>
              ))}
            </div>
          )}

          <span className="fcount">
            {visibleJobs.length} of {jobsForDisplay.length} shown
          </span>
        </div>

        <div className={selectedJob ? 'split' : 'split closed'}>
          <div className="pane listpane">
            {groups.map(([company, list]) => (
              <Fragment key={company}>
                <div className="co-head">
                  <h2>{company}</h2>
                  <span className="line"></span>
                </div>
                {list.map((j) => (
                  <JobCard key={j.id} job={j} selected={j.id === selectedId} onOpen={() => setSelectedId(j.id)} />
                ))}
              </Fragment>
            ))}
            {visibleJobs.length === 0 && <p className="empty">Nothing matches these filters.</p>}
          </div>
          <div className="pane detailpane">
            {selectedJob && (
              <JobDetail
                job={selectedJob}
                onClose={closeJob}
                onExplain={(key) => {
                  const e = EXPLAIN[key];
                  if (e) setModal(e);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className={tab === 'companies' ? 'view' : 'view hidden'}>
        {/* D-142's banner, reworded for D-156: on a public URL the old "do not share this
            file" instruction is no longer true — the page IS shared. It still tells a
            viewer what they are looking at, which is all a banner can do. */}
        <div className="banner pii">
          <strong>Contains recruiter contact info</strong> (D-142) — names, emails and LinkedIn profiles taken from
          public job postings. This tab exists for outreach and is publicly reachable at this URL (D-156).
        </div>

        <div className="filterbar">
          <div className="fgroup">
            <span className="flabel">Role level (optional — off shows every company)</span>
            {(
              [
                ['fit', 'Junior'],
                ['stretch', 'Stretch'],
                ['senior', 'Senior'],
              ] as const
            ).map(([v, label]) => (
              <FilterChip key={v} active={senioritySel.has(v)} onClick={() => setSenioritySel((s) => toggle(s, v))}>
                {label} ({seniorityCount(v)})
              </FilterChip>
            ))}
          </div>

          <div className="fgroup">
            <span className="flabel">Hiring status</span>
            <FilterChip active={hiringSel.has('1')} onClick={() => setHiringSel((s) => toggle(s, '1'))}>
              Currently hiring PM ({hiringCount(true)})
            </FilterChip>
            <FilterChip active={hiringSel.has('0')} onClick={() => setHiringSel((s) => toggle(s, '0'))}>
              No current opening ({hiringCount(false)})
            </FilterChip>
          </div>

          {companyDomains.length > 0 && (
            <div className="fgroup" style={{ border: 'none', flexWrap: 'wrap' }}>
              <span className="flabel">Industry</span>
              {companyDomains.map((d) => (
                <FilterChip key={d} active={coDomainSel.has(d)} onClick={() => setCoDomainSel((s) => toggle(s, d))}>
                  {d}
                </FilterChip>
              ))}
            </div>
          )}

          <span className="fcount">
            {visibleCompanies.length} of {companyRows.length} shown
          </span>
        </div>

        <div className="co-list">
          {companyRows.length === 0 ? (
            <p className="empty">No companies confirmed yet.</p>
          ) : (
            visibleCompanies.map(({ company, hiring, domains }) => (
              <CompanyCard key={company.company_slug ?? company.company} company={company} hiring={hiring} domains={domains} />
            ))
          )}
        </div>
      </div>

      <div className={modal ? 'modal open' : 'modal'}>
        <div className="modal-box">
          <h3>{modal?.[0] ?? ''}</h3>
          <p>{modal?.[1] ?? ''}</p>
          <button className="btn primary" onClick={() => setModal(null)}>
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
