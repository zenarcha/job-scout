// Renders every job in the database into `dashboard-live.html`, reusing
// `dashboard-mock.html`'s stylesheet verbatim.
//
// Why this exists (D-119): the mock shows four hand-written jobs, each fully
// populated. Real data is mostly incomplete — most jobs carry no AI verdict at all —
// and that incomplete state is what the board actually looks like. No amount of
// editing four perfect cards answers how 52 real ones feel.
//
// Deliberately a throwaway generator, not the product. D-110's dashboard is a Next.js
// app on Vercel reading Supabase from the browser; this is a static snapshot so Sakshi
// can look at real rows and redesign before that gets built.
//
// The CSS is READ from `styles/dashboard.css` at build time rather than copied, so the
// styling has exactly one home shared with the mock and the Next.js app.
//
// Same rule for the presentation logic: verdict labels, salary formatting, day counts and
// blockers all live in `lib/dashboardFormat.ts`, which `app/` imports too. This file only
// wraps those values in HTML.
//
// D-115 kept recruiter/hiring-manager fields out of this file entirely, since it "might
// get shared". D-142 (Session 28) reverses that specifically for the Remote Companies
// tab below: the tracker's whole point (D-140) is a permanent, outreach-ready record,
// which means carrying recruiter contact. The PII banner on that tab is the agreed
// mitigation — this file can no longer be shared casually without redacting it first.
import { readFileSync, writeFileSync } from 'node:fs';
import { db } from '../lib/db.js';
import {
  EXPLAIN,
  SENIORITY_LABEL,
  blockers,
  bucketExperience,
  daysAgo,
  remoteBucket,
  salaryLabel,
  verdictKey,
  verdictOf,
} from '../lib/dashboardFormat.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function salaryChip(j: any): string {
  const { text, soft } = salaryLabel(j);
  return `<span class="sal${soft ? ' soft' : ''}">${esc(text)}</span>`;
}

function card(j: any): string {
  const v = verdictOf(j.priority);
  const tags: string[] = [];
  if (j.domain) tags.push(`<span class="tag ind">${esc(j.domain)}</span>`);
  if (j.is_technical)
    tags.push(`<span class="tag">${j.is_technical === 'technical' ? 'Technical' : 'Not very technical'}</span>`);
  if (j.years_experience_min != null) tags.push(`<span class="tag blk">${j.years_experience_min}+ yrs</span>`);
  if (j.institute_requirement === 'iit_iim_required') tags.push('<span class="tag blk">IIT/IIM</span>');

  // An unevaluated job has no summary to show. Say so rather than leaving a gap that
  // reads as "we looked and there was nothing to say" — the D-112 collapse, on screen.
  const summary = j.role_summary
    ? `<p class="summary">${esc(j.role_summary)}</p>`
    : `<p class="summary soft">${j.classify_status === 'not_evaluated' ? 'Not read by the AI yet — the description is still there to read.' : 'No summary produced.'}</p>`;

  // Filter attributes live on the card so filtering is a class toggle, not a re-render.
  // `remoteBucket` is three-valued on purpose and `bucketExperience` puts `null` in 'fit';
  // both rules live in lib/dashboardFormat.ts with the reasoning, and the app applies the
  // same two functions to the same fields.
  const remote = remoteBucket(j.remote_type);
  const exp = bucketExperience(j.years_experience_min);

  return `<button class="card" data-id="${esc(j.id)}" data-verdict="${verdictKey(j.priority)}" data-remote="${remote}" data-exp="${exp}" data-ai="${j.is_ai === 'ai' ? '1' : '0'}" data-tech="${j.is_technical === 'technical' ? '1' : '0'}" data-domain="${esc(j.domain ?? '')}" data-iit="${j.institute_requirement === 'iit_iim_required' ? '1' : '0'}">
      <div class="card-top"><p class="job-title">${esc(j.role_title)}</p><span class="verdict ${v.cls}">${v.label}</span></div>
      ${summary}
      <div class="meta"><span>${esc(j.location || 'Location not stated')}</span><span class="sep">·</span><span>${daysAgo(j.posted_at || j.first_seen_at)}</span><span class="sep">·</span>${salaryChip(j)}</div>
      ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
    </button>`;
}

function detail(j: any): string {
  const v = verdictOf(j.priority);
  const reasons: string[] = Array.isArray(j.recommend_reasons) ? j.recommend_reasons : [];
  const bl = blockers(j);
  const skills: any[] = Array.isArray(j.skills) ? j.skills : [];

  const why =
    j.classify_status === 'not_evaluated'
      ? 'The AI has not read this posting yet, so there is no verdict — not a poor one. The full description is below.'
      : reasons.length
        ? `Matched on: ${reasons.map(esc).join(' · ')}`
        : 'No matching signals were found in this posting.';

  return `<div class="id-row">
      <div class="logo">${esc((j.company || '??').slice(0, 2).toUpperCase())}</div>
      <div><div class="co">${esc(j.company)}</div><div class="src">via ${esc(j.source)}</div></div>
    </div>
    <h2>${esc(j.role_title)}</h2>
    <p class="subline">${esc(j.location || 'Location not stated')} · ${daysAgo(j.posted_at || j.first_seen_at)}</p>

    <div class="tier1">
      <div class="t1-top"><span class="t1-q">Should I apply?</span><span class="verdict lg ${v.cls}">${v.label}</span></div>
      <p class="t1-why">${esc(why)}</p>
    </div>

    <div class="tier3">
      <div class="actions">
        <a class="btn primary" href="${esc(j.apply_url || j.posting_url || '#')}" target="_blank" rel="noopener">Open posting ↗</a>${j.link_status && j.link_status !== 'ok' ? `<span class="chip soft">link ${esc(j.link_status)}</span>` : ''}
        <button class="btn" data-explain="shortlist">☆ Shortlist</button>
        <button class="btn" data-explain="tailor">Tailor résumé</button>
      </div>
    </div>

    <div class="tier2">
      ${j.role_summary ? `<p class="t2-summary">${esc(j.role_summary)}</p>` : ''}
      <div class="chips">
        ${j.domain ? `<span class="chip ind">${esc(j.domain)}</span>` : ''}
        ${j.remote_type ? `<span class="chip">${esc(j.remote_type.replace('_', ' '))}</span>` : ''}
        <span class="chip mono">${esc(salaryLabel(j).text)}</span>
      </div>
      ${bl.length ? `<p class="skills-head">Watch out for</p><ul class="blockers">${bl.map(([t, d]) => `<li><b>${esc(t)}</b> — ${esc(d)}</li>`).join('')}</ul>` : ''}
      ${
        skills.length
          ? // Flat list, no have/gap split: `profile` has 0 rows, so a "you have this /
            // you lack this" view would be invented rather than computed.
            `<p class="skills-head">Skills asked for</p><div class="skills">${skills
              .map((s: any) => `<span class="sk ${s.required ? 'gap' : ''}">${esc(s.skill)}</span>`)
              .join('')}</div>`
          : ''
      }
    </div>

    <div class="tier4">
      <h3 class="sec">Full job description</h3>
      <div class="jd">${
        // The "no description" case is markup, not text, so it must not go through esc() —
        // it did, and rendered a literal <em> on screen. Caught while porting to app/.
        j.jd_clean
          ? j.jd_clean
              .split(/\n{2,}/)
              .map((p: string) => `<p>${esc(p)}</p>`)
              .join('')
          : '<p><em>No description stored.</em></p>'
      }</div>
    </div>`;
}

// D-140: a permanent archive, no live join to `jobs` — everything shown here was
// snapshotted onto `remote_companies` at confirmation time (see lib/discovery/
// remoteCompanies.ts), so a row still renders correctly even after `jobs` is truncated
// (as in D-138's reset). `evidence_seniority` absent (never AI-confirmed with a
// derivable bucket, or a pre-migration row) is shown as unlabeled and is never hidden
// by the seniority filter — "not stated" staying visible, not defaulting to filtered
// out, is the same D-73/D-112 rule the jobs tab follows.
function companyCard(c: any, jobInfo?: { hiring: boolean; domains: Set<string> }): string {
  const seniority = c.evidence_seniority && SENIORITY_LABEL[c.evidence_seniority] ? c.evidence_seniority : '';
  const hiring = jobInfo?.hiring ?? false;
  const domains = jobInfo ? [...jobInfo.domains].sort() : [];

  const contactBits: string[] = [];
  if (c.recruiter_name) contactBits.push(`<span>${esc(c.recruiter_name)}</span>`);
  if (c.hiring_manager && c.hiring_manager !== c.recruiter_name)
    contactBits.push(`<span>${esc(c.hiring_manager)} (hiring manager)</span>`);
  if (c.recruiter_email) contactBits.push(`<a href="mailto:${esc(c.recruiter_email)}">${esc(c.recruiter_email)}</a>`);
  if (c.recruiter_linkedin)
    contactBits.push(`<a href="${esc(c.recruiter_linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>`);
  const contact = contactBits.length
    ? `<div class="co-contact">${contactBits.join('<span class="sep">·</span>')}</div>`
    : `<div class="co-contact soft">No recruiter contact captured yet.</div>`;

  // D-144: salary is a snapshot on `remote_companies` itself (evidence_salary_*, set by
  // lib/enrich/salary.ts when a confirming job states a figure) — not derived from `jobs`
  // like hiring/domains are, so it survives `jobs` being truncated (D-138) same as the rest
  // of the archive. Reuses the Jobs tab's own salaryChip() by mapping onto the shape it expects.
  const salary =
    c.evidence_salary_min != null || c.evidence_salary_max != null
      ? salaryChip({
          salary_status: 'stated',
          salary_min: c.evidence_salary_min,
          salary_max: c.evidence_salary_max,
          salary_currency: c.evidence_salary_currency,
          salary_period: c.evidence_salary_period,
        })
      : '';

  return `<div class="co-row" data-seniority="${esc(seniority)}" data-hiring="${hiring ? '1' : '0'}" data-domains="${esc(domains.join(','))}">
      <div class="co-row-top">
        <span class="co-name">${esc(c.company)}</span>
        <div class="co-tags">
          ${hiring ? '<span class="tag hiring">Hiring now</span>' : ''}
          ${domains.map((d) => `<span class="tag">${esc(d)}</span>`).join('')}
          ${seniority ? `<span class="tag">${SENIORITY_LABEL[seniority]}</span>` : ''}
        </div>
      </div>
      <div class="co-meta">First confirmed ${daysAgo(c.added_at)} · Last confirmed ${daysAgo(c.last_confirmed_at)}</div>
      ${
        c.evidence_note
          ? `<p class="co-evidence">${esc(c.evidence_note)}${c.evidence_url ? ` — <a href="${esc(c.evidence_url)}" target="_blank" rel="noopener">view posting ↗</a>` : ''}</p>`
          : ''
      }
      ${salary ? `<div class="co-salary">${salary}</div>` : ''}
      ${contact}
    </div>`;
}

async function main() {
  const { data, error } = await db()
    .from('v_jobs_enriched')
    .select(
      'id, company, company_slug, role_title, location, posting_url, apply_url, link_status, source, posted_at, first_seen_at, jd_clean,' +
        'priority, classify_status, recommend_reasons, role_summary, domain, is_technical, is_ai,' +
        'technical_depth, institute_requirement, years_experience_min, years_experience_max,' +
        'remote_type, skills, salary_min, salary_max, salary_currency, salary_period, salary_status, is_junior_title',
    )
    .order('first_seen_at', { ascending: false });
  if (error) throw new Error(`build-dashboard: ${error.message}`);

  // D-140/D-142: the Remote Companies tab's data, entirely separate from `jobs` — no
  // live join, by design (see companyCard's comment).
  const { data: companyData, error: companyError } = await db()
    .from('remote_companies')
    .select(
      'company, company_slug, evidence_url, evidence_note, evidence_seniority, added_at, ' +
        'last_confirmed_at, recruiter_name, recruiter_linkedin, recruiter_email, hiring_manager, ' +
        'evidence_salary_min, evidence_salary_max, evidence_salary_currency, evidence_salary_period',
    )
    .order('last_confirmed_at', { ascending: false });
  if (companyError) throw new Error(`build-dashboard: remote_companies: ${companyError.message}`);
  const companies = companyData ?? [];

  const jobs = data ?? [];
  // D-148: the Jobs tab shows junior-titled postings ONLY. A senior-titled job can never get a
  // priority verdict — D-133 excludes it from classify/recommend entirely — so it sat as
  // "Pending" forever, indistinguishable on screen from a junior job that just hasn't been
  // enriched yet. Sakshi: "I don't want any pending jobs which are senior to be in the job
  // scout dashboard." `is_junior_title` (0012) reuses the same SQL predicate D-133 already
  // uses to gate the enrich pipeline, so this can never drift from what actually got enriched.
  // Senior-titled jobs are NOT excluded from `jobs` itself below — the Remote Companies tab's
  // hiring/domain signals (`jobInfoByCompanySlug`) still need all of them.
  const jobsForDisplay = (jobs as any[]).filter((j: any) => j.is_junior_title === true);
  const counts = jobsForDisplay.reduce<Record<string, number>>((a, j: any) => {
    a[j.priority] = (a[j.priority] ?? 0) + 1;
    return a;
  }, {});

  // Group by company, preserving the newest-first order of first appearance — the
  // mock's structure (D-93), applied to real rows.
  const byCompany = new Map<string, any[]>();
  for (const j of jobsForDisplay) {
    if (!byCompany.has(j.company)) byCompany.set(j.company, []);
    byCompany.get(j.company)!.push(j);
  }

  // One home for the stylesheet: the mock links it, the app imports it, this inlines it
  // (a snapshot has to be a single self-contained file to be openable from disk).
  const css = `<style>\n${readFileSync('styles/dashboard.css', 'utf8')}\n</style>`;

  const list = [...byCompany.entries()]
    .map(
      ([co, js]) =>
        `<div class="co-head"><h2>${esc(co)}</h2><span class="line"></span></div>${js.map(card).join('')}`,
    )
    .join('');

  const onsite = jobsForDisplay.filter((j) => j.remote_type === 'not_remote').length;
  const expCount = (b: string) => jobsForDisplay.filter((j) => bucketExperience(j.years_experience_min) === b).length;
  // Domain chips are generated from the values actually present. The mock hardcodes
  // three industries; real data has many and they change every run.
  const domains = [...new Set(jobsForDisplay.map((j) => j.domain).filter(Boolean))].sort();

  // D-144: Industry + hiring-status filters for the companies tab — computed HERE, at build
  // time, from the `jobs` already fetched above. Nothing derived here is written back to
  // `remote_companies` — the archive table itself stays exactly as D-140 designed it (no
  // live coupling), this is presentation-only and gets recomputed fresh every build.
  // `v_jobs_enriched` already filters to dropped_reason is null AND canonical_job_id is null
  // (0002_canonical_read_path.sql), so any company_slug appearing here is a live, canonical
  // posting — "hiring" additionally excludes known-dead links (closed/expired/not_found);
  // unknown link_status counts as still-open, same absent-isn't-negative rule used everywhere
  // else in this project.
  const jobInfoByCompanySlug = new Map<string, { hiring: boolean; domains: Set<string> }>();
  for (const j of jobs as any[]) {
    if (!j.company_slug) continue;
    if (!jobInfoByCompanySlug.has(j.company_slug)) jobInfoByCompanySlug.set(j.company_slug, { hiring: false, domains: new Set() });
    const info = jobInfoByCompanySlug.get(j.company_slug)!;
    if (!['closed', 'expired', 'not_found'].includes(j.link_status)) info.hiring = true;
    if (j.domain) info.domains.add(j.domain);
  }

  const companyList = companies.length
    ? companies.map((c: any) => companyCard(c, jobInfoByCompanySlug.get(c.company_slug))).join('')
    : '<p class="empty">No companies confirmed yet.</p>';
  const seniorityCount = (b: string) => companies.filter((c: any) => c.evidence_seniority === b).length;
  const hiringCount = (v: boolean) =>
    companies.filter((c: any) => (jobInfoByCompanySlug.get(c.company_slug)?.hiring ?? false) === v).length;
  // Same set as the Jobs tab's own `domains`, computed independently here since it's scoped
  // to companies that made it into the archive, not every job ever ingested.
  const companyDomains = [...new Set([...jobInfoByCompanySlug.values()].flatMap((v) => [...v.domains]))].sort();

  const html = `${css}
<div class="topbar">
  <h1>job<span class="dot">·</span>scout</h1>
  <span class="count">${jobsForDisplay.length} jobs · ${byCompany.size} companies</span>
</div>
<nav class="mainnav">
  <button class="navitem active" data-tab="jobs"><span class="navicon" aria-hidden="true">💼</span>Jobs<span class="navcount">${jobsForDisplay.length}</span></button>
  <button class="navitem" data-tab="companies"><span class="navicon" aria-hidden="true">🏢</span>Remote companies<span class="navcount">${companies.length}</span></button>
</nav>
<div class="view" id="view-jobs">
  <div class="banner">
    <strong>Live data</strong> — generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from Supabase.
    Yes ${counts.high ?? 0} · Maybe ${counts.med ?? 0} · Probably not ${counts.low ?? 0} · <b>Pending ${counts.unknown ?? 0}</b>.
    <b>${onsite} are on-site</b> (<code>remote_type=not_remote</code>) and hidden by default — nothing downstream currently acts on that field.
  </div>
  <div class="filterbar">
    <div class="fgroup"><span class="flabel">Should I apply?</span>
      <button class="fchip active" data-f="verdict" data-v="high">Yes</button>
      <button class="fchip active" data-f="verdict" data-v="med">Maybe</button>
      <button class="fchip active" data-f="verdict" data-v="low">Probably not</button>
      <button class="fchip active" data-f="verdict" data-v="unknown">Pending</button></div>
    <div class="fgroup"><span class="flabel">Location</span>
      <button class="fchip active" data-f="remote" data-v="remote">Remote</button>
      <button class="fchip active" data-f="remote" data-v="unknown">Not checked</button>
      <button class="fchip" data-f="remote" data-v="onsite">On-site (${onsite})</button></div>
    <div class="fgroup"><span class="flabel">Experience</span>
      <button class="fchip active" data-f="exp" data-v="fit">Right for me (${expCount('fit')})</button>
      <button class="fchip" data-f="exp" data-v="stretch">Stretch · 4–6 yrs (${expCount('stretch')})</button>
      <button class="fchip" data-f="exp" data-v="senior">Too senior · 7+ (${expCount('senior')})</button></div>
    <div class="fgroup"><span class="flabel">AI focus</span>
      <button class="fchip" data-f="ai" data-v="1">AI roles only</button></div>
    <div class="fgroup"><span class="flabel">Technical</span>
      <button class="fchip" data-f="tech" data-v="1">Hide deep-technical</button></div>
    <div class="fgroup" style="border:none"><span class="flabel">IIT/IIM</span>
      <button class="fchip" data-f="iit" data-v="1">Hide those</button></div>
    ${domains.length ? `<div class="fgroup" style="border:none;flex-wrap:wrap"><span class="flabel">Industry</span>
      ${domains.map((d) => `<button class="fchip active" data-f="domain" data-v="${esc(d)}">${esc(d)}</button>`).join('')}</div>` : ''}
    <span class="fcount" id="fcount"></span>
  </div>
  <div class="split closed" id="split">
    <div class="pane listpane">${list}<p class="empty" id="empty" hidden>Nothing matches these filters.</p></div>
    <div class="pane detailpane" id="dp"></div>
  </div>
</div>
<div class="view hidden" id="view-companies">
  <div class="banner pii">
    <strong>Contains recruiter contact info</strong> (D-142) — this tab exists for outreach, so
    unlike the Jobs tab this file should NOT be shared without redacting it first.
  </div>
  <div class="filterbar">
    <div class="fgroup"><span class="flabel">Role level (optional — off shows every company)</span>
      <button class="fchip" data-cf="senior" data-v="fit">Junior (${seniorityCount('fit')})</button>
      <button class="fchip" data-cf="senior" data-v="stretch">Stretch (${seniorityCount('stretch')})</button>
      <button class="fchip" data-cf="senior" data-v="senior">Senior (${seniorityCount('senior')})</button></div>
    <div class="fgroup"><span class="flabel">Hiring status</span>
      <button class="fchip" data-cf="hiring" data-v="1">Currently hiring PM (${hiringCount(true)})</button>
      <button class="fchip" data-cf="hiring" data-v="0">No current opening (${hiringCount(false)})</button></div>
    ${companyDomains.length ? `<div class="fgroup" style="border:none;flex-wrap:wrap"><span class="flabel">Industry</span>
      ${companyDomains.map((d) => `<button class="fchip" data-cf="domain" data-v="${esc(d)}">${esc(d)}</button>`).join('')}</div>` : ''}
    <span class="fcount" id="cofcount"></span>
  </div>
  <div class="co-list" id="colist">${companyList}</div>
</div>
<div class="modal" id="modal">
  <div class="modal-box"><h3 id="mt">Not built yet</h3><p id="mb"></p><button class="btn primary" id="mc">Got it</button></div>
</div>
<script>
const DETAIL = ${JSON.stringify(Object.fromEntries(jobsForDisplay.map((j) => [j.id, detail(j)])))};
const EXPLAIN = ${JSON.stringify(EXPLAIN)};
var dp = document.getElementById('dp');
var split = document.getElementById('split');
var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));

// ── detail pane: closed until a job is chosen ───────────────────────────
function openJob(c) {
  cards.forEach(function (x) { x.classList.remove('selected'); });
  c.classList.add('selected');
  dp.innerHTML = '<div class="dp-bar"><button class="dp-close" id="dpx">Close ✕</button></div>' + DETAIL[c.dataset.id];
  split.classList.remove('closed');
  dp.scrollTop = 0;
  document.getElementById('dpx').addEventListener('click', closeJob);
  wire();
}
function closeJob() {
  split.classList.add('closed');
  dp.innerHTML = '';
  cards.forEach(function (x) { x.classList.remove('selected'); });
}
cards.forEach(function (c) { c.addEventListener('click', function () { openJob(c); }); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeJob(); });

// ── filters ─────────────────────────────────────────────────────────────
// Each group is a set of ALLOWED values; a chip toggles its value in or out.
// "Hide IIT/IIM" is the one inverted control — it excludes rather than includes,
// which is why it starts inactive and reads as an action rather than a category.
var allow = { verdict: {}, remote: {}, exp: {}, domain: {} };
var EXCLUSIVE = { iit: false, ai: false, tech: false };
document.querySelectorAll('.fchip[data-f]').forEach(function (b) {
  var f = b.dataset.f;
  if (!(f in EXCLUSIVE)) allow[f][b.dataset.v] = b.classList.contains('active');
  b.addEventListener('click', function () {
    b.classList.toggle('active');
    if (f in EXCLUSIVE) EXCLUSIVE[f] = b.classList.contains('active');
    else allow[f][b.dataset.v] = b.classList.contains('active');
    apply();
  });
});

function apply() {
  var shown = 0;
  cards.forEach(function (c) {
    // A job with no domain is never hidden by the Industry chips — it has not been
    // categorised, which is not the same as belonging to an excluded category.
    var domainOk = !c.dataset.domain || allow.domain[c.dataset.domain] !== false;
    var ok = allow.verdict[c.dataset.verdict] &&
             allow.remote[c.dataset.remote] &&
             allow.exp[c.dataset.exp] &&
             domainOk &&
             !(EXCLUSIVE.iit && c.dataset.iit === '1') &&
             !(EXCLUSIVE.ai && c.dataset.ai !== '1') &&
             !(EXCLUSIVE.tech && c.dataset.tech === '1');
    c.classList.toggle('hidden', !ok);
    if (ok) shown++;
  });
  // A company heading whose jobs are all filtered out must go too, or the list fills
  // with headings for nothing.
  document.querySelectorAll('.co-head').forEach(function (h) {
    var any = false, n = h.nextElementSibling;
    while (n && n.classList.contains('card')) { if (!n.classList.contains('hidden')) any = true; n = n.nextElementSibling; }
    h.classList.toggle('hidden', !any);
  });
  document.getElementById('fcount').textContent = shown + ' of ' + cards.length + ' shown';
  document.getElementById('empty').hidden = shown > 0;
  // If the open job just got filtered away, stop showing it.
  var sel = document.querySelector('.card.selected');
  if (sel && sel.classList.contains('hidden')) closeJob();
}

function wire() {
  document.querySelectorAll('[data-explain]').forEach(function (b) {
    b.addEventListener('click', function () {
      var e = EXPLAIN[b.dataset.explain];
      document.getElementById('mt').textContent = e[0];
      document.getElementById('mb').textContent = e[1];
      document.getElementById('modal').classList.add('open');
    });
  });
}
document.getElementById('mc').addEventListener('click', function () {
  document.getElementById('modal').classList.remove('open');
});
apply();

// ── tabs: Jobs / Remote Companies (D-142) ────────────────────────────────
document.querySelectorAll('.navitem[data-tab]').forEach(function (t) {
  t.addEventListener('click', function () {
    document.querySelectorAll('.navitem[data-tab]').forEach(function (x) { x.classList.remove('active'); });
    t.classList.add('active');
    document.getElementById('view-jobs').classList.toggle('hidden', t.dataset.tab !== 'jobs');
    document.getElementById('view-companies').classList.toggle('hidden', t.dataset.tab !== 'companies');
  });
});

// ── companies tab: optional, off-by-default "Role level" filter (D-140) ──
// Internal names (seniority/evidence_seniority) kept as-is — this is a display-label-only
// rename; "Fit" was rejected as ambiguous with computeRecommendation's unrelated background-
// match "fit", and reads as a holistic judgment this bucket doesn't actually make.
// Empty set = show everything, including rows with no seniority snapshot at all — an
// active filter only ever narrows within KNOWN buckets, it never hides "not stated".
var coRows = Array.prototype.slice.call(document.querySelectorAll('.co-row'));
var senioritySet = {};
var hiringSet = {};
var domainSet = {};
// D-144: Hiring status and Industry work the same "empty set = show everyone" way as Role
// level — an active filter narrows within KNOWN values, never hides a company the filter
// can't evaluate. Hiring status is always knowable (computed at build time from jobs, see
// main()), but Industry is not — a company with no domain data is never hidden by it.
document.querySelectorAll('.fchip[data-cf]').forEach(function (b) {
  var f = b.dataset.cf;
  var set = f === 'senior' ? senioritySet : f === 'hiring' ? hiringSet : domainSet;
  b.addEventListener('click', function () {
    b.classList.toggle('active');
    if (b.classList.contains('active')) set[b.dataset.v] = true;
    else delete set[b.dataset.v];
    applyCompanies();
  });
});
function applyCompanies() {
  var seniorActive = Object.keys(senioritySet).length > 0;
  var hiringActive = Object.keys(hiringSet).length > 0;
  var domainActive = Object.keys(domainSet).length > 0;
  var shown = 0;
  coRows.forEach(function (r) {
    var s = r.dataset.seniority;
    var seniorOk = !seniorActive || !s || senioritySet[s];
    var hiringOk = !hiringActive || hiringSet[r.dataset.hiring];
    var rowDomains = r.dataset.domains ? r.dataset.domains.split(',') : [];
    var domainOk = !domainActive || !rowDomains.length || rowDomains.some(function (d) { return domainSet[d]; });
    var ok = seniorOk && hiringOk && domainOk;
    r.classList.toggle('hidden', !ok);
    if (ok) shown++;
  });
  document.getElementById('cofcount').textContent = shown + ' of ' + coRows.length + ' shown';
}
applyCompanies();
</script>`;

  writeFileSync('dashboard-live.html', html);
  console.log(
    `dashboard-live.html — ${jobsForDisplay.length} jobs (of ${jobs.length} ingested), ${byCompany.size} companies · ` +
      `${companies.length} remote companies tracked\n` +
      `  Yes ${counts.high ?? 0} · Maybe ${counts.med ?? 0} · Probably not ${counts.low ?? 0} · Pending ${counts.unknown ?? 0}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
