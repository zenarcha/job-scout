# Market/Supply Analytics — Plan

Task 3 of [tasks.md](tasks.md). Session 31 (2026-08-10).

## Context
Separate from the AI Ops Panel ([ai-ops-panel.md](ai-ops-panel.md), which monitors the *pipeline*) and
from personal-funnel analytics (which monitors Sakshi's own application outcomes and isn't buildable
yet — no capture mechanism exists). This dashboard monitors the *job market itself* — what's out
there, week to week — using `classify` output and rollup tables that already exist but are currently
inert ("Kept pending the v2 analytics conversation," per the schema comment on
`rollup_company`/`rollup_skills`/`rollup_funnel`, `supabase/migrations/0001_schema.sql`). This session
is that conversation, for the market-facing half of it.

Six metrics selected, all sourced from existing columns — `jobs`, `job_enrichments` (classify's
output: `remote_type`, `geo_explicit`, `domain`, `business_model`, `background_match`,
`years_experience_min/max`, `skills`), and the pre-scaffolded `rollup_company`/`rollup_skills` tables.

## The six metrics

### 1. Volume trend by title bucket, per week
**Purpose:** is the market heating up or going quiet, for the titles Sakshi actually applies to.
**Source:** `jobs.first_seen_at`, `jobs.role_title`, existing `is_junior_title()` (already used by
`v_jobs_enriched`, D-133/D-148).
```sql
select date_trunc('week', first_seen_at) as week,
       is_junior_title(role_title) as is_junior,
       count(*)
from jobs
where dropped_reason is null and canonical_job_id is null
group by 1, 2
order by 1 desc;
```

### 2. Skill demand, trending
**Purpose:** what to actually put at the top of the resume this month — not a static list.
**Source:** `job_enrichments.skills` (jsonb array of `{skill, required}`, written by `classify`).
`rollup_skills` already has the right shape (`skill`, `count_100`) but has no writer — this metric
either needs that rollup wired up, or a direct query over the last N `classify` rows:
```sql
select skill_obj->>'skill' as skill,
       count(*) filter (where (skill_obj->>'required')::boolean) as required_count,
       count(*) as total_count
from job_enrichments, jsonb_array_elements(skills) as skill_obj
where stage = 'classify' and is_active = true
group by 1
order by total_count desc
limit 20;
```
Trending: run this over a rolling 4-week window and compare week-over-week, not just a single-window
snapshot.

### 3. Background-match rate over time
**Purpose:** the single most useful market signal — is Sakshi's existing background actually fitting
what's out there, and is that improving or declining.
**Source:** `job_enrichments.background_match` and `background_match_suggested` — both native
Postgres `text[]`, not jsonb (confirmed against `supabase/migrations/0001_schema.sql`).
```sql
select date_trunc('week', j.first_seen_at) as week,
       count(*) filter (where cardinality(e.background_match) > 0) as matched,
       count(*) filter (where cardinality(e.background_match_suggested) > 0) as suggested_only,
       count(*) as total
from jobs j join job_enrichments e on e.job_id = j.id and e.stage = 'classify' and e.is_active
where j.dropped_reason is null
group by 1
order by 1 desc;
```

### 4. Domain / business-model distribution
**Purpose:** where to focus outreach given Sakshi's background, not just where raw volume is highest.
**Source:** `job_enrichments.domain`, `job_enrichments.business_model`.
```sql
select domain, business_model, count(*)
from job_enrichments
where stage = 'classify' and is_active
group by 1, 2
order by 3 desc;
```

### 5. Company activity (repeat posters)
**Purpose:** companies posting repeatedly are actively hiring — worth prioritizing for direct outreach
over a one-off listing.
**Source:** `rollup_company` (scaffolded, `company_slug`, `open_roles`) — same situation as
`rollup_skills`: right shape, no writer yet. Direct-query alternative:
```sql
select company, company_slug, count(*) as open_roles
from jobs
where dropped_reason is null and canonical_job_id is null
group by 1, 2
order by 3 desc
limit 20;
```

### 6. Experience-requirement distribution
**Purpose:** is the market skewing toward more experience than Sakshi has right now — calibrates which
roles are realistic vs. a stretch.
**Source:** `job_enrichments.years_experience_min/max`.
```sql
select
  case
    when years_experience_min is null then 'not stated'
    when years_experience_min <= 3 then '0-3 (right for me)'
    when years_experience_min <= 6 then '4-6 (stretch)'
    else '7+ (too senior)'
  end as bucket,
  count(*)
from job_enrichments
where stage = 'classify' and is_active
group by 1;
```
(Matches the existing dashboard bucket logic already used elsewhere — "Right for me" ≤3 or not stated,
"Stretch" 4-6, "Too senior" 7+.)

## Build approach
Same shape as the AI Ops Panel — a new section on the existing `dashboard-live.html` /
`scripts/build-dashboard.ts`, reusing `job_enrichments`/`jobs` directly rather than waiting on
`rollup_company`/`rollup_skills` to get real writers (that's a separate, smaller decision: wire up the
existing rollup tables vs. query live each time — live queries are simpler and correct-by-construction
at this data volume; rollups only start mattering at a scale this project isn't at).

## Explicitly separate from this task
Personal-funnel analytics (applied/interview/offer/rejected) — `rollup_funnel` exists but has no
writer and no capture mechanism (no `status` field on `jobs` at all). Needs its own decision on how
Sakshi would actually log application outcomes before any dashboard over it is possible. Not part of
this plan.

## Verification
- Run each query directly against Supabase (`project_id: gwvrpdkiblozwdwoqsgd`) once real data
  accumulates past this session's small post-reset batch (52 jobs) — current volume is too thin for
  trends 1, 3, and 6 to be meaningful yet; volume/skill-distribution snapshots (2, 4, 5) are usable
  immediately.
- All queries above verified against the real schema this session (`supabase/migrations/0001_schema.sql`):
  current-version flag is `is_active` (boolean, not the `active` placeholder first drafted);
  `background_match`/`background_match_suggested` are native `text[]` (use `cardinality()`, not
  `jsonb_array_length()`); `skills` is genuinely `jsonb`. Every `job_enrichments` query filters
  `is_active` to avoid double-counting superseded rows (D-6/D-9: old versions are kept, never deleted).
