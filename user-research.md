# User Research — job-tracker origin & alignment

Interview conducted 2026-08-04, Sakshi as subject/interviewer-target, Claude as
interviewer. One question at a time, live. Quotes are lightly cleaned for
readability but not paraphrased. Cross-checks against `decisions.md` /
`scope.md` are called out inline as "**Connects to:**" or "**New / not yet in
scope.md:**" — the latter means it surfaced here for the first time.

---

## Block 1 — Origin story / Block 2 — Manual process before (combined; she answered both together)

**Core reason:** "Applying for jobs is a very time-consuming task. There were
various things that I was doing manually that made me want to automate it."

**The manual process, in her words:**

- When motivated, she'd do this "religiously every day for one hour": look
  at jobs, analyze match, then ask for referrals.
- Referral targeting: people who share her previous company (Infosys) or her
  educational alumni networks (St. Xavier's, Wellingkar).
  **Connects to:** D-39/D-67 (`background_match` closed vocabulary fed by
  work history/education) — this is the exact real-world behavior those
  decisions were designed to encode. Direct confirmation, not a conflict.
- Finding referral targets was itself hard: go to the alumni tab, the people
  tab, figure out who's relevant, then visit each profile individually and
  draft a *different* message per person based on the specific connection
  (ex-Infosys vs. alumni). LinkedIn caps messages at 300 words, so there's no
  guarantee of a read even after all that.
- Tried single-referral-at-a-time first — too slow, jobs went stale/closed
  before a referral came through. Switched to asking multiple people at
  once — still time-consuming, and now added a new problem: **tracking**
  who she'd asked, per company, in Notion, and remembering to switch Notion
  views to check who needed a follow-up.
- Follow-ups got missed — sometimes from the volume, sometimes because she
  got sick or lost motivation for 2-3 days. Jobs fill fast, so a few days'
  gap is costly.
  **Connects to:** Session 7 summary — "she has two follow-up dates and a
  notification need; the schema has neither" — this is the lived version of
  that gap.

**Why remote specifically, and why consolidation matters:**

- Remote roles are rare, so she wants to be informed the moment they appear
  rather than scanning multiple boards herself.
- She has a small child — remote is a hard preference, not a nice-to-have
  (this is new personal context; the existing docs state the remote+India
  filter as a product rule (D-3) but never the personal reason behind it).
- She doesn't want LinkedIn's own email notifications either — competing
  notifications across channels caused her to lose track of postings.
  **Connects to:** D-40 (Gmail alerts used for coverage-checking, not
  discovery) and D-58/59 (Telegram-only delivery, Notion dropped as a
  delivery surface) — this is the real problem those decisions solve:
  fragmented attention across channels, not just "which tool is prettiest."

**New / not yet in scope.md — resume tailoring + hallucination problem:**

- She used to upload the JD to Claude and ask if her resume was a match —
  usually not, since she's transitioning roles — then ask Claude to rewrite
  points to fit.
- Problem: "Claude would invent details" — fabricated experience she never
  had. She explicitly does not want AI reinventing her experience or adding
  anything untrue to her resume. This is the motivation behind what she
  calls the "GD-to-resume module" (JD-to-resume). She says it exists in the
  codebase already but "not working as I wanted to."
  **Connects to:** the caution pattern behind D-12 (salary parse-only, never
  estimated) and D-50 (no LLM-as-judge) — same underlying trust principle
  ("don't let the model invent facts"), but this is the first time a
  *concrete* incident behind that caution has been named. `decisions.md`
  states the principle abstractly; this is the lived incident that produced
  it.

**New / not yet in scope.md — skill-gap → portfolio action:**

- She wants the system to capture what's *missing* from what a job asks for
  vs. her actual resume — and if it's a skill gap, she wants to act on it:
  work on that skill, build something to demonstrate it, and add it to her
  portfolio/resume.
  **Connects to, partially:** "skill-gap analytics" appears in `scope.md`'s
  v2 list, but only as an analytics item — the *action step* ("go build a
  portfolio piece to close this specific gap") is not represented anywhere
  in scope.md today. Worth a direct question later on whether that action
  step is v1/v2/v3 or explicitly out of scope for this tool (vs. something
  she'd always do manually).

---

## Block 3 (partial) — AI-trust incident, follow-up

Clarification on the JD-to-resume module: it's already built in the codebase
specifically to solve the "Claude invents details" problem, but "it is not
working as it should" — i.e. the fix itself hasn't held up, this is an
**active, unresolved pain point**, not a past incident she moved on from.

The skill-gap → portfolio idea is confirmed as brand new — "it just came to
me while I was thinking" during this session, not a pre-existing plan.

**New / not yet in scope.md — status correction:** the resume-tailoring
problem isn't just "missing scope," it's a built-but-broken module currently
producing bad output. Worth surfacing to `backlog.md` or a defect note
separately from this research doc once the interview wraps — this is a
functional gap, not a philosophical one.

---

## Block 3 — concrete AI-fabrication example

"What Claude or any AI chat assistant does is it tries to stuff keywords
that are present on the JD. For example, I have not done UAT, but if UAT is
a requirement or a skill on the JD, it would fabricate experience because I
said to adapt my resume as per the JD."

This is the named mechanism: instruction ("adapt resume to JD") + keyword-
stuffing behavior of general chat assistants → fabricated experience she
never had (UAT, specifically). This is the concrete version of the
abstract "trust" language behind D-12/D-50 — now with a named failure mode
(keyword-stuffing under an adapt-to-JD instruction), not just "AI might get
it wrong."

## Block 5 — the $0 constraint (D-5)

**"The reason the $0 constraint is there is because this is a portfolio
project, and I don't want to spend money."**

**Major new signal — reframes the whole project's purpose.** Every existing
doc (README.md, plans.md, decisions.md) frames this as a personal job-search
tool with the AI-Job-Application-OS vision layered on top. None of them
state that it is, first, **a portfolio project** — something built partly to
demonstrate her own capability (likely to future employers), not purely a
private utility optimized only for her job-search efficiency. D-5 previously
just recorded "$0 is Sakshi's hard constraint" with no reason given; now
there is one, and it's a scope-shaping one — "portfolio project" implies
audience (someone will look at this), not just self-use.

This directly overlaps Block 10 (personal use vs. product for others) —
pulling that question forward since it's now live.

---

## Block 10 — personal use vs. product for others (pulled forward)

**She's genuinely unsure, not just deferring the question:**

> "I am not sure if people will actually check this... do hiring managers
> have the time?"

This is a live, unresolved doubt, not an answer — recording it as-is rather
than resolving it on her behalf. Worth distinguishing two different things
both currently labeled "portfolio project":

1. **Literal artifact review** — a hiring manager opening the repo,
   reading `decisions.md`, evaluating the architecture directly. She
   doubts this actually happens in practice.
2. **Interview talking-point value** — being able to *narrate* this project
   in an interview (what she scoped, what trade-offs she made, what she
   deferred and why) as evidence of PM thinking, independent of whether
   anyone ever opens the repo themselves.

These two have very different implications for what "portfolio-ready"
means (polish/presentability of the artifact itself, vs. her own clarity
on the story) — flagged as a hypothesis to put back to her, not settled.

**Resolved:** she confirmed #2 (narrative/talking-point value), not #1.

> "I will have a portfolio page with details on how I used AI maybe."

So the portfolio artifact is planned to be a **separate page/writeup about
the project**, not the repo itself being read cold by a stranger. This
deprioritizes "code readability for an unknown reader" as a v1 concern.

## Block 7 — definition of done (answered as part of Block 10)

In her own words, what needs to be true:

1. **"It needs a clear story you can tell"** — she can narrate what she
   built, why, and what she chose not to build.
2. **"It needs to have actually helped you land something"** — a real job
   outcome, not just a working demo.

**New / not yet in scope.md:** this is the first explicit success
definition anywhere in the docs. It's notable that neither criterion is
"the pipeline runs end-to-end" or "v1 scope is fully built" — both are
about a real-world outcome (the story, the landed job), not implementation
completeness. Worth weighing against `scope.md`'s v1 list directly in the
alignment pass later: does everything in v1 serve one of these two things?

---

## Block 6 — outcomes so far

**"I am doing it manually."**

Confirms directly: the job search is still running entirely on the old
manual process (referral hunting, Notion tracking, resume tailoring by
hand) while the tool is being built. No part of the tool has been used in
a real application yet. This matches the pattern across `session-summary.md`
Sessions 7-9 ("the pipeline has never run once") — now confirmed from her
side as a lived fact, not just a technical status note.

---

## Block 8 — the verification gap (root cause, in her words)

> "I have designed for architecture for future but realized I let Claude
> plan details that I didn't want or need right now. So I am doing a schema
> recheck and a product re-check (is this the product I am building)."

**This is the key finding of the session.** The pipeline hasn't gone live
not because of a narrow technical blocker, but because she let Claude design
ahead of actual need, and is now stepping back to re-verify the product
itself before continuing. This is the same failure mode `CLAUDE.md`'s
process rule was written for after D-30 (a setup doc stating unreviewed
choices as settled fact) — except this time it happened at the
architecture/schema level, one layer higher than a config doc.

**Connects to:** [[learning_inherited_not_decided]] memory note — "check
decisions.md before treating existing code/prompts as settled; this repo
has already gotten it wrong three times." This is (at least) a fourth
instance, self-identified by her before any external flag caught it.

**This user-research session is itself part of her "product re-check."**
The point of this document is to give her a way to test scope against real,
named need — which is exactly the corrective she's already reaching for.

---

## Block 8 (continued) — named examples of over-planned detail

Three things, in her words:

1. **"The lane logic we spent a lot of session on that"**
2. **"The stages"**
3. **"How notif would work"**

**Cross-check against `decisions.md`/`scope.md`:**

- **Lane logic** — this is the Lane Engine (D-18, D-20, D-24, D-53,
  D-62-64). **Already deferred to v2** in `scope.md` ("needs real data —
  D-24/D-37/D-60"). Her flagging it now *agrees with* the existing scope
  decision — good independent confirmation that deferring it was right, not
  a new conflict.
- **"The stages"** — this is very likely the Job → Qualification →
  Application object model (D-17), which Session 2 spent D-17 through D-28
  building out, ending in **"architecture frozen" (D-28)**. **This is a
  live tension worth naming plainly:** unlike the lane engine, this model is
  currently treated as foundational/locked, not deferred. If she's flagging
  it as also over-planned, that's new information `scope.md` doesn't
  currently reflect — worth a direct clarifying question rather than
  assuming which way to resolve it.
- **Notification design** — already been through some trimming (D-58 "no
  instant/digest split," D-65 "notify high+med only"), but the underlying
  design (D-16 idempotency, D-40 Gmail-as-benchmark) had multiple sessions
  of iteration too.

---

## Block 8 (continued) — clarifying "the stages"

**"Initially there were 5 stages and the modules Claude decided."**

Reads as: not fully resolved even now — she's naming that the original
stage count (5) and the module boundaries were Claude's proposal, not
something she deliberately arrived at herself. This is likely still the
live, in-progress subject of her "schema recheck," not a settled memory of
a past mistake.

**Logged as an open item, not resolved in this session** — designing the
right stage count/module boundaries is implementation work, not user
research, and doing it live here would risk exactly the failure mode she
just named (Claude deciding structure she didn't ask for, inside a session
not scoped for that decision). Flagging for a dedicated session:

> **Open follow-up (separate from this doc):** re-derive stage count and
> module boundaries from what she actually needs today (tracking + basic
> classify/skills/salary per `scope.md` v1), rather than from what was
> previously designed — and log the outcome properly in `decisions.md`,
> not silently in code.

---

## Block 9 — competing tools/workflows tried or rejected

**JD-to-resume tools:** "The current JD-to-resume builders are all paid and
very expensive subscriptions." Her actual pre-tool workaround: paste the JD
and her resume into Claude directly and ask it to adapt the resume — the
same workaround that produced the fabrication problem in Block 3.
**Connects to:** reinforces the $0 constraint (Block 5) from a second
angle — not just "portfolio project, don't want to spend," but also "the
paid alternatives are expensive and this is a viable free substitute."

**Manual search habit:** repeatedly typing searches like "associate product
manager remote" into LinkedIn directly and checking results by hand — a
recurring, repetitive action, not a one-time setup. **Connects to:**
`session-summary.md` Session 5's finding that LinkedIn's own keyword search
returns noisy results (plain "Product Manager" postings mixed in) — this is
the manual version of the same imprecision she was working around by hand
before the scraper existed.

**Real Notion tracker, screenshotted (Purplle example):** confirms the
actual field set she maintains by hand today:
`Applied` (date) · `Background Match` (tags, e.g. "Role Match – Support
Work", "HR Tech", "CPG company", "Support Company") · `Chance of Selection`
(High/Mid/Low) · `Contact` · `Follow up` (date) · `Job Link` · `Last Follow
Up` · `Notes` (a running dated activity log — outreach sent, referral
status, recruiter InMails, connection requests, responses awaited) ·
`Pending Task` · `Remote` · `Status` (e.g. "Referral Pending") · `Top
Choice`.

**Connects to, with exact confirmation:**
- `Background Match` tag values **exactly match** the real-world source
  D-67 cites for the closed vocabulary ("HR Tech," "Support Company," "CPG
  company").
- `Chance of Selection` is the literal field D-37/D-61 refer to as
  "filled in by hand in Notion today" — now seen directly, and per D-61 a
  *manual* chance-of-selection field was explicitly rejected for v1 (deterministic
  priority rule instead, D-62-64). Worth watching whether that
  substitution actually satisfies what this field currently does for her.
- `Notes`' free-text outreach log (who or when contacted, referral status,
  recruiter follow-ups) is exactly the granular tracking Block 1/2 described
  as most time-consuming, and is close to what D-43 (manual click-to-save
  conversation capture) is meant to replace — but D-43 captures *conversations*,
  while this Notes field is closer to a manual *activity/status log*. Worth
  checking in the alignment pass whether both are covered or only one.

**Closing line, ties Block 5/7/9 together:**

> "I don't have all day to just look for jobs. I would rather work on my
> portfolio."

The time saved by automating search isn't just about search efficiency —
it's explicitly redirected toward portfolio-building, which per Block 7 is
part of her actual definition of done. Automating the tracker and the
portfolio-building goal are not two separate goals; time saved on one
directly funds the other.

---

## Block 11 — automation check-in

**Verified against `decisions.md` before treating as settled** (per prior
project feedback on this — don't say "we decided X" without checking):
her recollection is accurate. `D-43` (2026-08-03) confirms it directly:
"Sakshi keeps referral/outreach conversations as **dated Notion comment
entries** by hand," and the chosen design stores captures "on the same
append-only per-job timeline as typed notes and auto-appended status
changes — **one chronological record per job**." So yes — a dated
activity-log design **was** decided, even though the exact Notion field
name ("Notes") isn't what's used in the schema.

**Her direct answer to the automation check-in: "All of them are manual in
Notion."** `Applied`, `Background Match`, `Chance of Selection`, `Status`,
`Follow up`/`Last Follow Up`, `Notes` — every field in her real, current
tracker is still hand-filled. This sharpens Block 6/8: it's not just that
"the pipeline has never run" as an abstract technical status — **zero
automation has reached her actual daily workflow**, despite Phases 0-3
being marked done in `README.md`. The gap is between built-and-tested vs.
integrated-into-her-real-routine, not between designed vs. undesigned.

---

## Block 12 — feature-by-feature v1 alignment pass (asked, not yet answered)

Question put to her (2026-08-04, before session wrap): does each of the
following `scope.md` v1 groups trace to something she actually described
in this interview, or does it feel like it's solving a problem the system
invented?

1. **Discovery** — LinkedIn-only via Apify, 5 entry-level PM title
   variants, dedup across sources, Gmail alerts as a coverage check.
2. **Tagging** — `classify` (technical/domain/`background_match` from her
   closed Notion-tag vocabulary) → `skills` → `salary` (parse-only).
3. **Recommend** — deterministic priority rule replacing her manual
   "Chance of Selection" field, with reasons generated automatically.
4. **Notify** — Telegram only, `high`+`med` sent, `low` stored silently.
5. **Feedback loop** — thumbs up/down + correction per field, validated
   against 20-30 hand-tagged JDs.

**Her answer:** items 1, 2, 5 (Discovery, Tagging, Feedback loop) feel
solidly grounded to her — no pushback. She asked for critique on the rest
anyway rather than taking that as final.

**Claude's critique, offered as analysis, not settled fact:**

- **3 (Recommend)** — grounded in principle (she does fill "Chance of
  Selection" by hand today) but **never validated in practice**. `D-71`
  validates `classify` against 20-30 hand-tagged JDs; nothing backtests the
  `recommend` rule (`D-62`-`64`) against the Chance-of-Selection values
  already sitting in her real Notion history. Recommended as a cheap,
  concrete pre-trust check: run the rule against her existing rows and see
  how often it agrees with her own past judgment.
- **4 (Notify/Telegram)** — flagged as an untested assumption before she
  confirmed it. **She checks WhatsApp, not Telegram** — direct evidence
  that Telegram-only (`D-58`/`D-59`) does not match where her attention
  already is.

## Block 12 (continued) — WhatsApp cost check and the tracker-module question

**"But WhatsApp is not free"** — checked via web search rather than assumed
(2026-08-04): WhatsApp Business Platform itself has no subscription fee,
and user-initiated conversations are free, but the notification bot's own
messages to her would be **business-initiated** — billed per
category/country under template pricing, with **no monthly free
allotment**, and the 2026 trend is toward *more* message types becoming
chargeable (utility templates inside the service window become billable
starting Oct 1, 2026). Conclusion: not free the way Telegram's bot API is
free, and meaningfully more operational overhead (business verification,
template approval) even before cost. This directly conflicts with the D-5
$0 hard constraint, so it doesn't resolve the Notify-channel problem — it
rules out the "just switch to WhatsApp" fix as easy, without ruling out
that the channel choice itself needs revisiting.
Sources: [Authgear](https://www.authgear.com/post/whatsapp-api-pricing/),
[Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026),
[BooSend](https://boosend.ai/blog/whatsapp-business-api-pricing-2026).

**"Should tracker be a separate module?"** — she asked for critique here
too. Verified against `WORKSPACE.md` (not assumed): the tracker's
separate-module status traces to `D-7`, but the *reason* modules exist at
all traces further back to `D-1` (2026-07-28), whose stated premise was
"modules are contract-only-coupled and built in **parallel isolated Claude
sessions**." Claude's critique: the conceptual split (discover-and-assess
vs. track-and-follow-up) is reasonable; the *infrastructural* split
(separate Supabase project → lost referential integrity, duplicated
Telegram integration, a from-scratch repo for the module that owns her
single biggest named pain point) is expensive for a solo builder with no
independent-scaling need, and looks like the same "Claude decided structure
I didn't ask for" pattern one level up from the schema question in Block 8.

**Her response — the premise doesn't match how she actually builds:**

> "The module split was there because I wanted to build different modules
> independently, but I have realised, as a solo builder, that the module
> split is not working because... I'm really not building one module at a
> time."

This directly falsifies `D-1`'s own stated premise. **Notably, `D-1`
already pre-approved this exact reversal**: "Reversible to a monorepo via
subtree-merge if the workflow assumptions change," and the Integration
Rules section names the precise trigger — "revisit only if one dev
routinely edits many modules at once" — which is exactly what she
described. This is not a new architecture debate; it's the workspace's own
documented escape hatch, now triggered.

**Claude's recommendation (analysis/opinion, not executed or logged as a
settled decision):** collapse the *infrastructure* separation — one repo
(`packages/resume-builder`, `packages/job-scout`, `packages/tracker`),
likely one Supabase project — while **keeping the conceptual module
names/boundaries**, since those still map to real distinct capabilities
and support the "clear story to tell" from her own definition of done
(Block 7). Impact: job-scout has zero commits, cheap to fold in; the
tracker doesn't exist yet, free; resume-builder is the real cost (live
repo + Vercel deploy) and wasn't independently inspected in this session —
`WORKSPACE.md` calls the merge path "low-risk," and resume-builder entered
the workspace via a zero-source-edit `mv`, suggesting the reverse is likely
mechanical, but that should be verified against the actual repo before
committing, not assumed.

**Deliberately not decided or executed in this session** — same
discipline as the Block 8 stage-count question: this is real
infrastructure/migration work, and doing it inside a research session
would repeat the exact pattern under discussion. **Status: recommended,
not yet confirmed by Sakshi as a final decision** — logged as an open item
in `backlog.md` and flagged (not committed) against `D-1` in
`WORKSPACE.md`. Needs an explicit go-ahead and a dedicated migration
session before any code moves.

---

## Block 4 — why Notion specifically, historically (closing the one thread left thin)

Asked after the interview was otherwise wrapped, since it was flagged as
the one planned question never chased deeply.

**Why Notion:** long-time user, and specifically because of Notion's
**database + views** feature — the same underlying data, filtered into
different working views:
- Companies where company action is pending
- Referral companies (where she'd asked for a referral)
- Just the "HR Tech" tag
- Just the "Support" tag

**Why this matters going forward, not just historically:** this is a
concrete, already-proven interaction model she relies on daily — one
dataset, multiple saved filtered views by status/tag — not a preference
that needs inventing from scratch. Worth checking any future
tracker/dashboard UI against this directly: does it support saved filtered
views over one underlying table (matching what she already trusts), or
does it force a single fixed list/board (a regression from what she has
today in Notion)?

---

## Session synthesis (interview complete)

What this session established, in priority order:

1. **The real problem is time + attention fragmentation**, not lack of a
   tool — manual JD-reading, per-person referral drafting, follow-up
   tracking, and duplicate notification channels were all named as the
   actual daily cost (Blocks 1-2, 9).
2. **This is explicitly a portfolio project** (Block 5) whose definition of
   done is narrative + outcome, not pipeline completeness (Block 7) —
   "a clear story to tell, and it actually helped you land something."
3. **Zero automation has reached her real workflow yet** — she is running
   her job search entirely manually in parallel with building the tool
   (Blocks 6, 11).
4. **The recurring root cause, self-identified twice this session:**
   structure was designed around assumptions ("Claude decided," "built in
   parallel isolated sessions") that don't match how she actually builds
   solo and non-linearly — first at the stage-count/schema level (Block 8),
   then at the workspace-module level (Block 12). Both are logged as open
   items requiring dedicated sessions, not resolved here.
5. **v1 discovery/tagging/feedback (items 1, 2, 5) are well-grounded and
   need no rework.** Recommend (3) needs a pre-trust validation step;
   Notify (4) needs a real channel decision — Telegram doesn't match her
   actual attention and WhatsApp isn't free.

---

*(Session paused 2026-08-04 for context-window wrap-up mid-interview, then
resumed and Block 12 completed in the same day — see `session-summary.md`
Session 10.)*
