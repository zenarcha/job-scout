# Tasks — Next Week

Two deferred items from Session 31 (2026-08-10), bundled here as a next-week task list. Neither is
being built now — both wait on a decision or observation window first.

---

## Task 1 — Ingest regex redesign: scoped, but staying OFF for now; watch volume/cost for a week first

### Context
This session found two things about `isObviouslyNonRemote()` (the ingest-time pre-filter,
`lib/discovery/normalize.ts`):
1. Its safety override (`remote_signal`) has real, verified gaps — words like "remotely" (fails
   `\bremote\b`'s word boundary), hyphenated "work-from-home", and "telecommute"/"telecommuting" don't
   trip it, so a genuinely remote job phrased that way, sitting behind an on-site/hybrid `location`
   tag, could be silently dropped.
2. The live `.env` has `INGEST_REMOTE_FILTER=on`, which **contradicts D-104's decided default of
   `off`** — a real drift between running config and the actual decision log, found only by manually
   opening the file this session. Not known whether this was a deliberate re-enable (D-104 itself
   names "AI volume needs cutting" as a valid reason to flip it back) or accidental leftover config.

### The redesign (scoped, not built)
Flip the drop condition's burden of proof. Today it's *"drop unless remote language is present"* —
permissive-sounding, but leaky, as shown above. It should be *"drop only if there's an explicit
non-remote marker AND no remote language"* — i.e., require a hard signal to justify dropping ("must
relocate," "in-office required," "no remote option," commute-distance language), not just the absence
of a remote word. This matches how every other ambiguity in this pipeline is already handled — D-73's
fail-open default, D-75's `geo_recheck`, D-76's "assumed eligible" marker — all of them keep the
ambiguous case and let a human or the AI resolve it later, rather than deciding it at the cheapest,
least-informed layer. `isObviouslyNonRemote()` is currently the one place in the pipeline that still
decides ambiguity at the door instead of downstream.

### Decision for now: keep `INGEST_REMOTE_FILTER=off`
Do **not** flip it on, and do not build the redesigned drop-logic yet. Instead:

**Next week's action:** observe real ingest volume and real AI cost (`ai_usage` table, per-stage,
daily) for ~7 days with the filter off, as it already is per D-104's decided default. Use that data to
decide, informed rather than speculative, whether the filter needs to come back on at all:
- If daily junior-titled (`classify`-path) volume + `remote_check` volume stays comfortably under the
  ~100,000 token/day Groq ceiling all week, there's no cost pressure forcing the filter back on — it
  can likely stay off indefinitely, and the redesign becomes moot.
- If the ceiling gets close or hit on any day, that's the trigger to actually build the redesigned
  (burden-flipped) version — not the current leaky one — before switching it back on.

This is the same logic as the AI Ops Panel: don't build monitoring or filtering machinery ahead of
evidence that it's needed. Watch first.

### What to check, daily or every couple of days, this week
A manual query against Supabase (`project_id: gwvrpdkiblozwdwoqsgd`) — same shape as what was run live
this session:
```sql
select stage, count(*) as calls, sum(prompt_tokens + completion_tokens) as total_tokens
from ai_usage
where created_at::date = current_date
group by 1 order by 1;
```
Plus a raw ingest count for the day (`select count(*) from jobs where first_seen_at::date =
current_date`) to see real daily scrape volume alongside the AI cost it produced. No dashboard needed
yet — this is exactly the kind of check that's cheap enough to do by hand for one week before deciding
whether the AI Ops Panel (Task 2) or the regex redesign (this task) are worth building at all.

---

## Task 2 — AI Ops Panel — deferred build, not scheduled yet

See [ai-ops-panel.md](ai-ops-panel.md) for full design.

---

## Task 3 — Market/Supply Analytics Dashboard

See [market-supply-analytics.md](market-supply-analytics.md) for full design.
