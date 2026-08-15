# Learnings — Remote PM Job Tracker

Technical choices explained in plain language, with the concrete tradeoff of the road not taken.

---

## Why some extraction can be a keyword search and some genuinely needs an AI
**What it is:** A regex (keyword search) looks for words you listed in advance. An LLM reads the text
and answers a question about it. They're good at different things, and we sorted every extraction in
the pipeline into one bucket or the other this session.
**The test that decides it:** *is there a specific word that, if present, gives you the answer?*
- **"Does this job require IIT/IIM?"** — yes. The words "IIT", "IIM", "tier-1 institute" appear
  literally or they don't. Small, closed, unchanging vocabulary. **Regex wins** — it's free, instant,
  and can't hallucinate.
- **"How technical is this role, 1 to 5?"** — no. There is no word in a job description that means
  "this is a 4". It's a judgment formed by reading the whole thing. **Needs the AI.**
- **"What skills does this job mention?"** — no, for a different reason. A regex could only find
  skills someone already thought to put on a list, so it would silently miss anything new, and miss
  rephrasing ("stakeholder management" vs "managing stakeholders"). The vocabulary is **open-ended**.
  **Needs the AI.**
**The borderline case, and why we left it alone:** "is this an AI-focused role?" *looks* like a
keyword job (search for AI/ML/LLM), but it false-positives on boilerplate — a company blurb saying
"we use AI internally" doesn't make the *role* AI-focused. Cheaper but noisier, so we kept it on the
AI until real data shows whether the noise matters.
**Why it's worth the effort:** every field moved out of the AI call is one less thing that can be
wrong, one less thing to pay for, and one less thing needing human review — but moving the wrong field
out buys a silent accuracy loss for a trivial saving.

## Supabase renamed its API keys — "anon key" is now "publishable key"
**What it is:** Supabase used to issue a long JWT-format "anon key" (public, safe for client-side use)
and a "service_role key" (secret, server-only, full DB access). Newer Supabase projects instead issue a
`sb_publishable_...` key (same role as the old anon key) and a `sb_secret_...` key (same role as the
old service_role key) — different format, same two-key security model.
**Why it matters here:** our code (`lib/config.ts`) just reads `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` as opaque strings, so the new-format keys are a drop-in — no code change
needed. But because the shapes look so different from what `.env`'s own inline comments describe (they
still say "copy the anon key"), it's easy to paste one on top of the other by hand instead of replacing
it. That happened this session — a stale JWT anon key and a new publishable key got concatenated onto
one line with no separator, silently producing an invalid key until caught by re-reading the file.
**Takeaway:** after any manual paste into `.env`, read the line back to confirm it's exactly the new
value, not old+new concatenated.
**It happened a second time, differently (2026-08-06).** The `sb_secret_...` key was pasted into
`SUPABASE_ANON_KEY`, overwriting the publishable key, while `SUPABASE_SERVICE_ROLE_KEY` stayed empty.
Correct value, wrong variable — so "read the line back" would not have caught it; the line looked fine
in isolation. Two distinct hazards, one root cause: **the two key names no longer resemble the two key
formats**, so there is nothing in the pasted string to remind you which slot it belongs in. The
practical check is to confirm the *pairing* after any key paste — `sb_publishable_...` belongs to
`SUPABASE_ANON_KEY`, `sb_secret_...` to `SUPABASE_SERVICE_ROLE_KEY` — not just that each line looks
well-formed. Getting it backwards is also a mild security smell: a secret sitting in a variable whose
name invites client-side use.

## Separating "the job" from "what the AI thinks about the job"
**What it is:** We keep two tables. `jobs` holds the raw posting exactly as scraped (never changed).
`job_enrichments` holds everything the AI decides about it — technical or not, AI-focused or not,
salary, resume match — as separate rows, each stamped with which version of the prompt/model produced
it.
**Why chosen:** You can re-run the AI later (better prompt, different model) and keep the old answer
next to the new one to compare, without ever touching the original job. Wrong tags can be debugged
because the exact model response is stored.
**Alternative (rejected):** Putting the AI's answers directly onto the job row. Then every re-run
would overwrite the source data, you'd lose the history, and you could never tell whether a change in
quality came from a new prompt or a new model.

## Event-driven stages instead of one big function
**What it is:** Instead of one function that classifies + matches + scores + notifies in sequence,
each step is independent and announces "I'm done" by writing to an events log. The next step listens
for that.
**Why chosen:** If the salary step fails, only it retries — the classification isn't redone. The
events log also becomes a full audit trail, so questions like "why wasn't I notified about this job?"
have a concrete answer.
**Alternative (rejected):** One monolithic step. A failure anywhere means redoing everything, you
can't swap the model for just one task, and there's no per-step record of what happened.

## An `AIService` layer that hides which AI provider is used
**What it is:** All AI calls go through one small module. Gemini is the default, but Cerebras or Grok
can be swapped in per task by changing an environment variable — no code changes.
**Why chosen:** Free tiers have daily limits; if one runs out or a model gets worse, we switch
providers in seconds. All three speak nearly the same "JSON in, JSON out" contract.
**Alternative (rejected):** Calling Gemini directly everywhere. If its free quota hit a wall or its
quality dropped, we'd have to hunt down and rewrite every call site.

## One TypeScript codebase instead of two runtimes
**What it is:** All the backend logic lives in one place, written in one language (TypeScript), run
with a tool called `tsx`. Supabase is used purely as the database.
**Why chosen:** The obvious "cloud-native" path (Supabase Edge Functions) runs on a different engine
(Deno) than the dashboard (Node), which would force writing shared logic twice and deploying two
things. One codebase is much easier for a solo builder to run for free and maintain.
**Alternative (rejected):** Deno Edge Functions for the pipeline + Node for the dashboard. More
moving parts, duplicated code, two deploy targets — overkill for a personal tool.

## Salary is parsed, never guessed
**What it is:** We read salary out of the job text with pattern-matching (e.g. "₹18–24 LPA",
"$120k–160k"). If it isn't stated, we leave it blank rather than asking the AI to estimate.
**Why chosen:** A made-up salary number that turns out wrong makes you distrust the whole tool.
Deterministic parsing is also free and instant.
**Alternative (rejected):** Letting the AI estimate missing salaries. It looks more "complete" but
introduces confident-sounding guesses that can mislead an actual job decision.

## Confidence gating and a review queue
**What it is:** The AI reports how sure it is (0–1). Above 0.9 we trust it; below 0.6 we flag the job
for manual review instead of silently applying the tags.
**Why chosen:** Classifiers are sometimes wrong; surfacing the shaky ones keeps the automatic tags
trustworthy.
**Alternative (rejected):** Trusting every AI answer equally — one confident-but-wrong tag quietly
corrupts your filters.

## Two SQL/tooling gotchas hit and fixed this session
- **`= any(subquery)` vs `= any(array)`** — In Postgres, `x = any((select skills ...))` is read as
  "compare against the *rows* of a subquery," which failed because a skill (text) can't equal an
  array. Fix: wrap the scalar subquery so it's clearly an array —
  `x = any(coalesce((select skills ...), '{}'::text[]))`. Lesson: when the right side of `any()` is a
  single array value fetched via a subquery, force it into array form.
- **`p-retry` v6 exports `AbortError` as a named export**, not `pRetry.AbortError`. Use
  `import pRetry, { AbortError } from 'p-retry'`. This bit us in three adapters before the fix.

## Filtering "who gets scraped" at the source, not after
**What it is:** Company-based Apify tasks were originally set to pull *every* open role at a
watchlisted company, unfiltered, on the theory that the AI classifier would sort out relevance
afterward. Checking `lib/enrich/pipeline.ts` this session showed that "sorting out afterward" means
every single ingested job — regardless of source — runs the full 5-stage AI enrichment pipeline, with
no cheap pre-check anywhere. So a large company with hundreds of open roles meant hundreds of AI calls
to find the one or two relevant ones. Fixed by applying the same title filter used for role-based
search to company tasks too, so Apify itself only returns plausibly-relevant postings.
**Why chosen:** Filtering at the source (in Apify's own task config) saves *two* separate costs at
once — Apify's own fetch/result quota, and the downstream AI enrichment quota — since neither system
ever sees the irrelevant 95% of a company's job board.
**Alternative (rejected):** A cheap keyword-blocklist pre-filter inside our own code (skip AI
enrichment if a title obviously says "Engineer"/"Sales"/"Legal") instead of filtering at the source.
Rejected for two reasons: PM job titles routinely contain domain words describing scope, not
disqualifying the role (e.g. "Product Manager, Sales Tools," "Product Manager — Platform
Engineering"), so a blocklist would misfire and drop legitimate roles; and it doesn't save Apify's own
fetch cost at all, since Apify still returns everything regardless of what the code does with it
afterward — only a source-level filter avoids that first cost.

---

## Store signals, let a separate engine make the decision
**What it is:** Instead of asking the AI to output a final answer like "this job is Lane A," the AI
outputs a set of neutral *measurements* (how well your background matches, how "builder-culture" the
company is, referral value, etc.). A separate, plain rules module — the **Lane Engine** — reads those
measurements and decides the lane. The measurements are stored; the lane is re-derivable.
**Why chosen:** Your job-search strategy will change (referral-first this year, portfolio-first next).
When it does, you only edit the lane *rules*, and every stored job re-sorts. You can also ask "why was
this Lane C in March but Lane A now?" because the measurements and the rule version are both recorded.
**Alternative (rejected):** Letting the AI emit the lane directly. Then the strategy is frozen inside
past AI outputs — you can't re-sort old jobs when your priorities shift, and you can't tell whether a
lane changed because the job changed or because your rules did.

## "Design for evolution now, implement later" — additive prep with zero behavior change
**What it is:** Before building the lane/qualification feature, we added the *empty shells* it will
need — new nullable columns (`signals`, `lane`, `urgency`, `opportunity_score`, version fields), a
config table, an `inbox` status value — and loosened a database rule so new pipeline stages won't need
a schema change later. Nothing reads or writes them yet, so today's behavior is byte-for-byte identical.
**Why chosen:** It means the big feature (Phase 2) won't require a risky database migration mid-build;
the ground is already prepared. It also let us keep shipping-momentum without redesigning anything.
**Alternative (rejected):** Adding these columns *when* we build the feature. That bundles a schema
migration into feature work — more to go wrong at once, and on a live database that's the riskiest
moment to change table shape.

## Loosening a strict database rule to avoid future migrations
**What it is:** The `job_enrichments` table had a rule listing the exact allowed pipeline stages
(`classify`, `resume_match`, …). Adding a new stage later would have required a database change. We
removed that hard rule and now validate stage names in the app code (the TypeScript type) instead.
**Why chosen:** New stages (like `qualify`) can be added with only a code change, never a migration —
aligns with the "avoid expensive future migrations" freeze principle.
**Alternative (rejected):** Keeping the strict list and expanding it each time. Every new stage would
need a migration on the live DB — small but repeated risk and friction.

## Reusing an existing field instead of inventing schema (the Inbox)
**What it is:** "Inbox" (jobs captured but not yet processed) is just a new value — `'inbox'` — of the
status field every job already has, not a new table or workflow engine.
**Why chosen:** It matches the real need ("save now, review later") with zero new structure; the
dashboard and pipeline already understand `status`.
**Alternative (rejected):** A dedicated inbox table or a separate state machine — extra moving parts
for what is really one more value in an existing list.

---

## Multiple small independent projects instead of one big shared codebase (discovered, not chosen, this session)
**What it is:** Job Tracker now lives inside a workspace (`ApplicationOS/`) alongside a second,
already-built project (Resume Builder) and a small shared package (`app-os-contracts`) that will hold
only the handful of concepts both projects genuinely need in common — like the idea of "a job" or "an
application." Each project keeps its own codebase, its own database, and its own deployment. They are
**not** combined into one shared codebase (a "monorepo"); the only thing they're allowed to share is
that small contracts package, and even that only for concepts proven to be needed by more than one
project.
**Why this shape:** each project was (or will be) built in its own separate work session, so keeping
them independent means one project's work never risks breaking another's, and each can be deployed on
its own schedule. It also forces a discipline: don't invent a "shared" version of something until a
second project actually needs it — avoids guessing at abstractions too early.
**What the alternative would have cost:** combining everything into one shared codebase (a monorepo)
would mean any change to shared code needs testing across every project at once, and it would require
absorbing Resume Builder's already-independently-deployed codebase into a new structure — extra risk
for no immediate benefit. This project's own earlier decision to keep enrichment "signals" separate
from "decisions" (see above) is the same instinct applied at the database-schema level; the workspace
structure applies it at the whole-project level.

**Reversed 2026-08-04 — see the entry below.** The premise this entry states ("each project was built
in its own separate work session") turned out to be false in practice — see `WORKSPACE.md` D-9.

---

## Reversing "separate projects" once the reason for it stops being true (2026-08-04)
**What it is:** the decision above (keep Job Tracker and Resume Builder as fully separate codebases,
databases, and deployments) got reversed. The plan now is to fold both into one shared codebase — a
"monorepo" — with each project as its own folder inside it (`packages/resume-builder`,
`packages/job-scout`), while still keeping them conceptually distinct. This is a technique called a
**subtree merge**: it lets you combine two separate codebases into one while keeping each one's full
history of past changes intact, as if they'd always lived together.

**Why this option was chosen:** the original reason for keeping them separate was "each project gets
built in its own isolated work session, so a shared codebase would get in the way." That reason turned
out to never have been true — checking the actual dates each project's code was written showed Resume
Builder was finished a full month before Job Tracker was even started. They were built one after
another by the same person, not side-by-side in parallel sessions. Once the stated reason for keeping
them apart is confirmed false, the cost of staying apart (duplicating the notification setup, a
job's résumé data and its application-tracking data living in two databases that can't reference each
other) stops being worth paying.

**What would have happened with the alternative (staying separate):** every future feature that needs
both projects' data at once (for example, tracking which résumé version was used for which
application) would keep hitting the same wall — two separate databases with no way to guarantee one
side's data still matches the other's, plus double the setup work for anything both projects need
(like sending notifications). Staying separate "for now" also gets more expensive the longer it's
delayed: the tracker module and the notification system haven't been built yet, so merging now avoids
building them twice.

**One real risk found, not a code problem:** Resume Builder is already live on the internet at a
specific web address, and that address is written into job-hunt portfolio material meant for
recruiters and hiring managers to click. Moving the project into a shared codebase is safe for the
code itself, but the live web address must be kept pointing at the same place throughout — switching
to a new one accidentally would break links already shared with people. This is a checklist item, not
a reason not to merge.

---

## Doing work automatically for everything vs. only when asked (2026-08-03)
**What it is:** The system does several AI jobs on each posting — describing it, listing its skills,
reading its salary, scoring it against your résumé. Until now all of them ran automatically on every
single job the moment it arrived. Résumé scoring has been changed to run **only when you ask for it**,
on a job you're actually considering.
**Why chosen:** the AI has a free monthly allowance, and scoring every job spends it on jobs you'd
never have applied to. Asking on demand means the cost follows your real interest: cheap descriptive
tags happen automatically for everything, scoring happens for the handful you're weighing, and the
most expensive step (tailoring a résumé) happens for the few you actually pursue. Nothing structural
had to change to allow this — the score is still recorded the same way, it just isn't triggered by the
automatic run any more.
**What the alternative would have cost:** leaving it automatic burns the monthly allowance on
irrelevant jobs, and would have kept a much bigger dependency alive — scoring is the only step that
needs your full résumé text stored inside this project, duplicating what the Résumé Builder already
holds. Removing it removed that duplication from the current version entirely.

## Why you can't score a job against a résumé you tailored for that job (2026-08-03)
**What it is:** When résumé scoring returns, it will compare the job against your **master** résumé —
the general one — not against a version tailored for that specific job.
**Why chosen:** a tailored résumé has been deliberately rewritten to echo that job's wording and
foreground the matching experience. Scoring it against the same job is close to marking your own
homework — it would come back high for almost everything, so the number couldn't help you decide what
to pursue. The question worth answering at that moment is "does my actual background fit this role,"
which is a fact about you and the job, independent of any document. Tailoring is what you do *after* a
good score, not before it.
**What the alternative would have cost:** generating a tailored résumé first would cost extra AI calls
*and* produce a meaningless score — the worst combination. It would also have inverted the natural
order, spending the most expensive step on jobs before knowing whether they were worth pursuing.

## One field holding a list of alternatives can silently throw data away (2026-08-03)
**What it is:** The code that reads scraped job data asks for the job's web address by trying several
possible field names in order and taking the first one it finds. LinkedIn postings can carry *two*
different addresses — the LinkedIn page itself, and the company's own application page that the Apply
button redirects to. Because the LinkedIn one is tried first, the company address was being found and
then discarded, invisibly.
**Why it matters:** the two addresses have genuinely different uses — you send the LinkedIn link to
someone you're asking for a referral, but you apply at the company link, and the company link keeps
working after LinkedIn removes the posting. The fix is to stop treating them as one field and capture
both separately.
**The trap in fixing it:** the same address doubles as the fallback identifier used to recognise
duplicate postings when the scraper provides no id of its own. That fallback must keep using the
LinkedIn address — the company address isn't a stable per-posting identifier, so switching it would
quietly change how duplicates are detected.
**General lesson:** a "try these names in order" lookup is fine when the alternatives are different
*names for the same thing*. It silently loses data the moment two of them are actually different
things.

## Storing "we know X" and "we assumed X" in the same field hides your own failures (2026-08-04)
**What it is:** Several places in this schema record a conclusion without recording how confident the
system was entitled to be. `salary_status` says `stated` or `unknown` — but "unknown" covers both *the
posting mentioned no salary* and *it mentioned pay and the parser couldn't read it*. `remote_type`
says `remote_india` both when the posting explicitly welcomes Indian candidates and when it said
nothing about location and the classifier fell back to a permissive default. In each case two very
different situations end up looking identical in the database.
**Why it matters:** the difference is the only thing that tells you where the system is weak. If
"parser failed" and "no salary given" are the same value, you can never measure how often the parser
fails, so you can never tell whether improving it is worth the effort. Same for location: without
separating them you cannot answer "how often is the assumption wrong?" — and a metric you cannot
compute is a problem you cannot fix.
**Why this option was chosen:** adding a second small field (`geo_explicit`, or a third salary status)
costs almost nothing — one column, no new logic — and converts an invisible failure into a countable
one. It also gives the user interface something honest to show: "Remote-India (assumed)" rather than a
confident claim the system hasn't earned.
**What the alternative would have cost:** leaving them merged means the only way to discover a bad
assumption is to hit it personally — apply for a role and be rejected on location. That is the most
expensive possible feedback loop, and it teaches the system nothing because the outcome never gets
recorded anywhere.
**Where it showed up:** three separate times in one session (`salary_status`, `remote_type`,
`background_match` suggestions), which is what turned it from a fix into a principle.

## Letting an AI invent its own labels makes results unrepeatable (2026-08-04)
**What it is:** `background_match` asks a model to say *why* a job connects to Sakshi's background.
There are two ways to build that: let the model write whatever phrase it thinks fits, or give it a
fixed list to choose from. We chose the fixed list — seeded from tags she has genuinely been using by
hand for months.
**Why it matters:** a model asked for free text will describe the same idea three different ways —
"Support Company", "Customer Support Org", "Support-focused". A human reads those as one thing; a
database reads them as three. That breaks counting ("how many support-company roles have I seen?"),
breaks filtering, and — worst — makes the **priority ranking unstable**, because the same job can be
scored differently after an unrelated prompt tweak. A recommendation you cannot reproduce is one you
cannot debug.
**Why this option was chosen:** a fixed list makes the output countable, filterable, and reproducible,
and it makes checking the model trivial — did it pick the tags Sakshi would have picked? A closed list
also can't quietly drift as the model changes underneath you.
**What the alternative would have cost:** free-form labels would have needed a cleanup step later
(grouping synonyms after the fact), which is harder than preventing the problem, and any historical
data collected before the cleanup would be inconsistent with everything after it.
**The escape hatch, and why it's kept separate:** the model can still propose a *new* tag, but it
writes it into a different field that the ranking never reads. Sakshi promotes good suggestions into
the real list herself. Keeping the two apart is what stops free-form drift from leaking back into the
ranking through a side door — the vocabulary grows deliberately, not automatically.

## A saved query and a stored total solve the same problem; you rarely need both (2026-08-04)
**What it is:** the database has two ways of answering "what did AI cost today?". A **view**
(`v_ai_cost`) is a saved question — nothing is stored, and every time you ask, the database re-adds the
numbers from scratch. A **rollup table** (`rollup_ai_cost`) is a real table holding the running totals,
which code has to keep updated by hand: read today's row, add the new call, write it back. This project
built both, for the same numbers, and uses neither.
**Why it matters:** stored totals exist for one reason — the underlying data got too big to add up on
demand. That is not this project's situation. At one or two jobs a day, the source table gains a few
thousand rows a year, which a database totals in milliseconds. Meanwhile the stored version charges two
extra database round-trips on *every single AI call*, and carries a correctness risk: read-add-write is
not atomic, so two calls finishing at the same moment can overwrite each other and silently lose an
increment.
**Why the view is the right default:** it cannot drift out of sync, because there is nothing to sync —
the answer is computed from the source data each time you ask.
**What the alternative would have cost:** keeping the stored totals means every new metric needs
matching update code written and maintained, and any bug in that code produces numbers that look
plausible but are quietly wrong — the hardest kind of error to notice.

## Vocabulary inherited from code shapes decisions nobody re-examined (2026-08-04)
**What it is:** this project's AI work is organised into five "stages" — classify, resume_match,
skills, salary, recommend. Checking the history this session showed **nobody ever chose that list**. It
came from the first build. The only actual decision (D-6) was about how to *store* AI results: one row
per job per step, so results can be versioned and replaced. "Stage" was simply that column's name, and
it graduated into being the word everyone reasoned with.
**Why it matters:** the word implies five comparable steps in a sequence. In reality four of them
*describe* a job — they read the posting and write down facts — while `recommend` decides **which jobs
reach the user at all**. When an earlier decision (D-37) trimmed the pipeline by reasoning over that
list as if the five were equivalent, it moved `recommend` to a later version — which would have left
the notification filter with nothing to filter on and delivered **zero** alerts. A later decision
caught it in time.
**The same pattern, twice more in one session:** the priority rule inherited "technical roles are
better" from the original prompt — never decided, and wrong for a non-technical candidate. And seven
database columns for an unbuilt "lanes" feature were nearly carried forward despite the concept behind
them never having been defined.
**General lesson:** when a name comes from an implementation rather than a decision, it still ends up
framing every later argument. Worth asking, of any category you're reasoning inside: *who chose this,
and did they choose it for this purpose?*

## A saved view can block you from changing the table underneath it (2026-08-05)
**What it is:** a "view" is a saved question — "show me each job with all its AI tags attached." It
isn't a copy of the data; it's a recipe the database re-runs each time you ask. Because the recipe
names specific columns, the database quietly records that the view *depends on* those columns.
**Why it matters:** that dependency has teeth. When we tried to plan a change that removed some columns
and changed the type of another, the database would have refused outright — you cannot drop or retype a
column that a saved view mentions. There is a "force it anyway" option, and it is a trap: it doesn't
fix the view, it **deletes** the view. You'd get a successful-looking change and discover weeks later
that the thing feeding your dashboard is gone.
**Why this option was chosen:** rather than carefully drop each view, change the tables, then rebuild
each view in the right order — a sequence where getting the order wrong is easy and the failure is
quiet — we rewrote the whole schema as one fresh description of the final state. Nothing is altered or
dropped, so there is nothing for a view to block.
**What the alternative would have cost:** the step-by-step version would have worked, but it needed
three drop-and-recreate dances to be ordered correctly, and one wrong `CASCADE` would have silently
destroyed the main read model the entire product depends on.

## Migration history is fiction until something has actually run (2026-08-05)
**What it is:** database changes are normally recorded as a numbered sequence of files — 0001, 0002,
0003 — each describing a change on top of the last, never edited afterwards. That "never edit history"
rule exists because real databases out there have already applied the earlier files; rewriting them
would leave those databases in a state no file describes.
**Why it matters here:** none of that applied. Checking directly showed the live database had **never
had any of it applied** — the files described a history that had never happened. Meanwhile the next
file would have been mostly *undo*: adding seven columns in one file and removing them in the next,
loosening a rule and then restoring it, creating a table shape and then replacing it.
**Why this option was chosen:** we collapsed everything into one file that simply says what the schema
*is*. Someone reading it learns the current design in one pass instead of mentally replaying three
files' worth of changed minds.
**What the alternative would have cost:** a third file that was roughly 60% deletions, and a schema you
could only understand by executing it in your head. The reasoning for each removal isn't lost — that's
what the decision log is for; it was never the migration file's job.
**The condition that made it safe, and it expires:** this is only free because nothing has run. Once
real jobs are in the database, the same move would mean migrating live data, and the incremental
approach becomes the correct one again.

## A failing test sometimes means the design is wrong, not the test (2026-08-05)
**What it is:** we split "no salary information" into two distinct outcomes — the posting never
mentioned pay, versus it mentioned pay but our parser couldn't read the number. The whole point was to
measure how often the parser is failing.
**What happened:** an existing test failed, and the obvious move was to update the test to expect the
new answer. Reading it properly showed the opposite — the *code* was wrong. The posting said
"Competitive salary and great benefits", which mentions pay but contains no number at all. The parser
hadn't failed; there was nothing to parse. Counting it as a parser failure would have inflated the
exact number the split was created to measure.
**Why this option was chosen:** detection now requires an actual digit near the pay wording. "Salary:
₹18 LPA" that we fail to read counts as a failure; "competitive salary" doesn't.
**What the alternative would have cost:** a failure-rate metric permanently inflated by every posting
that says "competitive salary" — which is most of them — making the number useless for the one
question it exists to answer.

## Storing the same fact twice is a bug waiting for its moment (2026-08-05)
**What it is:** when recording feedback ("this tag was wrong"), the obvious design is to note both
which job it concerns and which specific AI attempt it judged. But the attempt already knows which job
it belongs to — so writing the job down again stores the same fact in two places.
**Why it matters:** two copies can disagree. Not today, but eventually — some later change updates one
and misses the other, and now the database contains two answers to the same question with nothing
saying which is right.
**Why this option was chosen:** record only the attempt. The job is one hop away whenever it's needed.
This also matched how a widely-used tool for exactly this problem does it — worth checking rather than
reasoning from first principles, and in this case the check overturned the recommendation that had
been made minutes earlier.
**What the alternative would have cost:** slightly faster lookups, in exchange for a class of bug that
is invisible until it isn't. At one or two jobs a day, that speed is worth nothing.

## "Anyone can edit it" is a design choice with a build cost, not a free property (2026-08-05)
**What it is:** the list of background-match tags could live in the code, or as a row in the database.
Every similar fixed list in this project lives in the code.
**Why it matters:** where it lives decides who can change it. In code, adding a tag needs an editing
session. In the database, it's editing one row in a web dashboard — no developer, no deploy.
**Why this option was chosen:** Sakshi will genuinely want to add tags as her job search teaches her
what matters, and needing to book a session for that is friction that would stop it happening.
**What the alternative would have cost — and what this one costs:** keeping it in code was simpler and
consistent with everything else. Moving it out required building something that didn't exist: the code
now has to go *fetch* the list before every classification. That plumbing is real work, and the table
it uses had been sitting unread since the day it was created. Worth paying once for a list that will
actually change; not worth paying for lists that won't.

## When merging two databases, move the empty one toward the full one, not the other way (2026-08-06)
**What it is:** two separate Supabase (database) projects existed — one behind Sakshi's live,
deployed résumé tool, one created for this project and never used. Consolidating meant picking which
one becomes "the" database going forward.
**Why it matters:** the two weren't equivalent options. One already held real data and served a live
website whose address is printed in documents she hands to recruiters. The other was empty — no rows,
no deploy depending on it. Treating this as a coin-flip between "Project A" and "Project B" would have
missed that only one direction is actually cheap.
**Why this option was chosen:** point the empty project's design at the live one, not the reverse.
Adding a new set of tables to an existing database is a same-day, zero-data-risk change. The opposite
— exporting real data out of a live product and re-pointing its deployment at a new database — is a
migration with real failure modes, undertaken for no benefit, on a product actively being shown to
recruiters.
**What the alternative would have cost:** a prior planning session had leaned toward the newer,
purpose-built project as "the" one, before either project had actually been inspected — an intuitive
default (newer / dedicated-looking) that didn't hold up once someone checked what was actually running
where. Following it would have meant migrating live data for a cosmetic reason.

## A page that needs JavaScript to show its content will sometimes show nothing (2026-08-06)
**What it is:** a web page can put its content directly in the file, or it can arrive nearly empty and
have a small program (JavaScript) fill it in the moment the page opens. The second is normal and
usually invisible — until something blocks that program from running.
**What happened:** the job detail panel was built the second way. Viewed in a pane that blocks scripts
for safety, the panel rendered completely blank. The content was written correctly; it just never got
put on the page. My first guess was wrong — I blamed a sizing rule — and I only found the real cause by
opening the page and looking at it rather than reasoning about it.
**Why this option was chosen:** the first job's details now sit in the file as ordinary text, so the
page is useful the instant it opens. The program is still there, but only to *switch* between jobs. If
it never runs, you lose the switching, not the content.
**What the alternative would have cost:** a page that looks broken in any context that blocks scripts —
some previews, some email clients, a slow connection, a script error anywhere on the page. Worse, it
fails silently: nothing errors, there is simply nothing there, which is the hardest kind of fault to
diagnose.
**The habit worth keeping:** ask what the page shows if the program never runs. If the answer is
"nothing", the important part belongs in the file itself.

## Two apps can talk over HTTP without sharing any code (2026-08-06)
**What it is:** when two applications need to work together, there is an instinct to first build shared
plumbing — a common package of agreed definitions both sides import. That was the plan here
(`@app-os/contracts`), and it was treated as a prerequisite.
**Why it wasn't needed:** the résumé builder already accepts a job description over the web at a normal
address, and hands back an identifier. Job-scout can send it a job description and get that identifier
straight back. Neither app needs to know anything about the other's code, database, or language — only
the shape of that one message.
**Why this option was chosen:** it works today with no new infrastructure, and the message is a single
piece of text. Building a shared package to send one string would have been building the scaffolding
for a building nobody is putting up yet.
**What the alternative would have cost:** the fallback proposed twice was copying the job description
to the clipboard and pasting it into the other app by hand. Sakshi rejected it correctly — the reason
given ("we need the shared package first") was never actually true, and checking the other app's code
took two minutes and disproved it.
**The general point:** sharing code and exchanging messages are different kinds of connection. The
second is looser, and looser is usually better — either side can be rebuilt entirely as long as the
message keeps its shape.

## A cached "can't reach it" note is a claim about the past, not the present (2026-08-06)
**What it is:** a memory file written earlier the same session stated flatly that the Supabase MCP
connector "has never seen either active project" and that both projects in its one visible org were
`INACTIVE`. That was trusted as fact for a while. A live `list_projects` call said otherwise: both were
`ACTIVE_HEALTHY`, and one of them — a project a different note called "superseded" — turned out to
already carry a full (if stale) schema.
**Why it wasn't true anymore:** access state is exactly the kind of fact that changes without anything
in the repo changing. Projects auto-pause and un-pause, logins get reconnected, org visibility shifts —
none of that leaves a trace anywhere a file-read would catch. A note that was accurate when written
becomes a guess the moment time passes, and nothing marks the expiry.
**Why this option was chosen:** re-running the actual tool call cost one round trip and settled the
question outright, instead of building a plan on top of an assumption that had already been flagged,
in writing, as likely to go stale ("verify this against decisions.md... it changes fast").
**What the alternative would have cost:** proceeding on the cached claim would have meant recommending
a brand-new Supabase project as the only option, when a live, already-schema'd, zero-cost one was sitting
one tool call away.
**The general point:** for anything that describes *reachability* or *access* rather than code or
schema, treat a note — including one written minutes earlier in the same session — as a claim to
re-verify, not a fact to build on. The cost of checking live is almost always smaller than the cost of
being wrong about it.

## "How many rows are in there" has a fast wrong answer and a slow right one (2026-08-06)
**What it is:** before deleting all the tables in the database, the count of what was in them was
checked, and the tool used reported every table as empty. On that basis the deletion was described as
risk-free and approved. A second check — asking the database to actually count the rows one by one
instead of reporting its own summary — found two tables that were **not** empty.
**Why the first answer was wrong:** databases keep a rough running tally so that questions like "roughly
how big is this table" can be answered instantly without reading it. That tally is updated on a
housekeeping schedule, not on every write. If rows were added and the housekeeping never ran, the tally
still says zero forever. It is not stale in the sense of being slightly behind — it can be permanently,
confidently wrong.
**Why this option was chosen:** an exact count reads the table properly and cannot disagree with
reality. On tables this small it costs nothing. The rough tally is only worth using for questions where
being off by a bit doesn't matter — and "is it safe to delete this" is the opposite of such a question.
**What the alternative would have cost:** the deletion would have gone ahead believing it was destroying
nothing. As it happens the rows turned out to be discardable — an old seed list a prior decision (D-32)
had already ordered removed, plus three settings from a superseded migration — so the outcome would have
been the same. That is luck, not a good process. The same mistake against a table of real applications
would have been unrecoverable, and nobody would have known to look for it afterwards.
**The general point:** when a check exists to justify a destructive act, the check has to be the
expensive accurate one. A summary figure that a system volunteers for speed is not evidence of absence —
and "the tool said zero" is not the same claim as "I counted zero."

## A checkpoint that asks the wrong question will tell you the work is finished (2026-08-06)
**What it is:** the system decides which jobs still need processing by checking whether the *last* step
produced a result. The last step is a plain calculation done in ordinary code — it does not call out to
anything, so it succeeds no matter what happened earlier. When the outside service every earlier step
depends on was unavailable, those steps all failed, the final calculation ran anyway on the empty
results, and every job was marked finished. Asking the system to retry did nothing: it believed there
was nothing left to do.
**Why it wasn't caught sooner:** on paper the check is reasonable — "did the pipeline reach the end?"
It only breaks when a step can reach the end *without* the earlier steps having worked, which requires
the last step to be the one that can't fail. Reading the code does not make this obvious. Running it
during an outage makes it obvious immediately.
**Why this option was chosen (for now):** nothing was changed yet, deliberately. The obvious fix —
require every expected step to have a result — is wrong as stated, because one step is *meant* to be
skipped in most cases. Picking the right rule needs a decision, not a patch, so it was logged as open.
**What the alternative would have cost:** silently. That is the whole problem. Every job processed
during any provider outage would sit in the database looking complete and carrying nothing, with no
error visible anywhere in normal use and no reason for anyone to go looking.
**The general point:** a "have we finished?" check must depend on the parts that can actually fail. If
the thing you are measuring is the one thing guaranteed to succeed, you have built a progress bar that
always reads 100%.

## The same input, asked twice, gave two different answers (2026-08-06)
**What it is:** the test data deliberately contains one job listed twice, with titles differing by a
single comma. The system correctly recognised them as the same job and linked them. It then went ahead
and analysed *both copies separately* — and got different results: different depth rating, different
view on whether a particular degree is expected, different set of skills, and a different final
recommendation for what is, in fact, one job.
**Why this happened:** the language model is not a lookup table. Given near-identical text it produces
near-identical, not identical, output. Nothing was wrong with either answer in isolation; they simply
disagree.
**Why it matters more than it looks:** the plan is to hand-check the system's recommendations against
real jobs to find out how much they can be trusted. That exercise silently assumes asking twice gives
the same answer. This is direct evidence it does not — which means some of the disagreement found in
that future check will be the model arguing with itself, not being wrong about the job.
**What the alternative would have cost:** left alone, the same job also consumes its quota twice and
appears twice in the list it was supposed to be deduplicated out of.
**The general point:** deduplicate before the expensive, non-deterministic step, not after. Doing work
twice on the same thing is not merely wasteful — it manufactures contradictions that then have to be
explained.

## A third-party model id is perishable stock, not a constant (2026-08-06)
**What it is:** the AI model this project names in its configuration was withdrawn by its provider
partway through the project. Every call to it now fails outright with "no longer available to new
users." Nothing in this codebase changed; the thing it points at was retired.
**The detail worth remembering:** the provider's own list-what's-available endpoint *still includes the
retired model*. Checking the catalogue would have said everything was fine. Only actually trying to use
it revealed the truth — the same lesson as the row-count estimate above, in a different costume.
**Why a fixed version was chosen over an always-latest alias:** an alias would prevent this breaking
again, but would let the model change silently underneath a version number the project treats as
meaning "the same behaviour." Since the plan is to hand-score accuracy against a fixed version, a
silent swap would corrupt the comparison. A loud failure is easier to live with than a quiet drift.
**What the alternative would have cost:** with an alias, results would shift one day for no recorded
reason, and the accuracy work would be measuring two different systems while believing it measured one.
**The general point:** treat any external model name as something that expires. Test it by calling it,
not by asking whether it exists.

## A finished-checkbox that nothing ever ticks (2026-08-06)
**What it is:** the pipeline runs five steps on each job. Four ask an external AI service; the fifth is
a plain rule written in this project's own code, needing nothing external. The system decided "is this
job done?" by asking whether that fifth step had left a record. But that step succeeds no matter what —
it has nothing to fail against. So a job could lose all four AI steps and still be filed as complete.
**How it actually bit:** when the AI provider retired the model, the four AI steps failed and the fifth
ran fine, so two jobs were recorded as finished while holding no analysis at all. Asking the system to
retry produced "0 jobs to process," because it sincerely believed there was nothing left to do.
Recovering meant typing out each job's identifier by hand.
**Why "just require all five steps" was the wrong fix**, even though it sounds obviously right: one of
the five is *meant* to be skipped most of the time. It's a targeted second opinion that only runs on
jobs whose geography was ambiguous. On a healthy job it correctly produces four records, not five. A
rule demanding five would have flagged almost every healthy job as broken.
**What was built instead:** the pipeline now writes down what each run actually did — which steps
worked, which failed. "Skipped on purpose" is recorded as a success, so it can never be mistaken for a
failure, and a run with any real failure comes back automatically on the next pass.
**What the alternative would have cost:** the simpler "did the AI's first step succeed?" check would
have caught the big outage but stayed silent when only one middle step failed — the same class of hole,
just narrower.
**The general point:** don't infer that work finished by looking for a side effect of it finishing.
Record the outcome. A checkbox ticked by something that cannot fail is not a checkbox.

## Deduplication that groups correctly and still shows you two of everything (2026-08-06)
**What it is:** the same job gets posted in more than one place. The system spots this correctly and
marks one copy as the real one and the other as a duplicate of it. That part worked perfectly. But the
query the dashboard would read never *looked* at that marking — so it would have shown the job twice.
**The part that made it more than a display bug:** because nothing stopped it, the AI read and judged
both copies independently. One job, two AI runs, two answers that disagreed — one copy rated medium
priority, the other low. So the dashboard would have shown the same role twice, contradicting itself.
**Why fixing only the display would have been a trap:** hiding the second copy makes the symptom vanish
while the machine keeps paying for a second reading of every duplicate and keeps storing a second,
conflicting verdict. The waste and the contradiction stay, just out of sight.
**What was built instead:** duplicates are hidden from the read path *and* never analysed in the first
place. One job, one reading, one answer.
**The revealing detail:** two other parts of the same system already excluded duplicates correctly.
Only the main read path — the one everything user-facing would sit on — had been missed. A convention
followed in three places out of four is not a convention; it's three coincidences and a bug.
**The general point:** when one component in a set disagrees with its siblings, suspect the odd one out
before suspecting the rule.

## Verifying a fix by causing the original failure on purpose (2026-08-06)
**What it is:** rather than reading the new code and judging it correct, the broken condition was
deliberately recreated — the configuration was pointed back at the retired AI model — to watch the
system meet the same failure again and see whether it now handled it.
**Why that was worth the trouble:** the original defect was invisible to code review. It had been read
past for weeks. Its whole nature was *looking* fine. Inspecting a fix for an invisible bug with the
same eyes that missed the bug is not much of a test.
**What it actually caught:** the reproduction ran green, then failed, then healed itself — the intended
result. But performing it exposed a second, brand-new bug in the fix: the retry budget counted every
run a job had ever had, rather than consecutive failures. A perfectly healthy job that had legitimately
been re-analysed a few times would have quietly used up its allowance, then refused to retry the first
time it genuinely broke. Reading the code had not revealed this. Running it three times did.
**What the alternative would have cost:** shipping a retry mechanism that silently stops retrying the
jobs that have been worked on most — the exact failure it was written to prevent, reintroduced inside
the fix for it.
**The general point:** a fix for a silent failure should be tested by staging the silent failure. And
budget for the possibility that the test finds a fault in the repair rather than confirming it.

## Giving up on a job should be a pause, not a door that locks behind it (2026-08-06)

**The concept.** The system periodically picks up job postings that haven't been analysed yet and sends
them to the AI. Sometimes that fails. It tries again next cycle. A *retry cap* is the number of failed
tries after which it stops bothering — there to stop a permanently broken posting burning free AI quota
forever.

**What was wrong with the version we shipped.** The cap stopped trying, and that was all it did. Once a
job used up its tries it vanished from the "still needs analysing" list for good. The counter was
supposed to reset after a successful run — but a successful run could never happen, because the job was
no longer being picked up. A closed loop. The only way out was running it by hand with its ID, which was
the exact manual step the whole fix had been built to eliminate.

Sakshi found this by asking one question the design had no answer for: *"how would retry happen if AI is
down and 5 is done?"* The scenario is not hypothetical — Google retiring the Gemini model last session
broke every job at once. An outage lasting longer than the cap would park the entire feed and leave it
parked **after the AI came back**.

**Why the number turned out to be the least interesting part.** At one or two jobs a day, the wasted
quota is trivial whether the cap is 3, 5 or 10. What protects the feed is that giving up is *temporary
and visible* instead of *permanent and silent*. That is how queueing systems handle this in practice:
Amazon's SQS parks a failed message somewhere you can go and look at it; Sidekiq doesn't stop retrying
at all, it just spreads retries further and further apart over about three weeks. Neither one lets a
failed item silently cease to exist.

So the fix is three parts: a place that lists jobs which gave up and why · automatic re-eligibility a
day later, so an outage heals itself without Sakshi doing anything · and a button for when she already
knows the AI is back and doesn't want to wait.

**A correction worth recording.** The first version of this recommendation argued that *visibility* was
where the real protection lay. That was wrong. Seeing "5 jobs gave up" tells you it happened; it does not
bring them back. Visibility and recovery are two different properties and the design needed both.

**What was considered and rejected, and why the reason matters.** The textbook answer to an outage is a
*circuit breaker* — notice that everything is failing at once and stop charging failures to individual
jobs. It was rejected here on **scale**, not complexity: at one or two jobs a day, "every job in this run
failed" is usually "the one job in this run failed", which is indistinguishable from a single genuinely
broken posting. The detection would be least trustworthy at exactly the volume it would run at. Filed in
`backlog.md` in case volume ever makes it meaningful.

## A filter you can see on the screen isn't necessarily in the link you copied (2026-08-06)

**The concept.** The scraper we pay to run LinkedIn searches doesn't accept "job title", "location" or
"remote" as settings. It accepts one thing: a LinkedIn search web address. Everything about the search
has to already be baked into that address. So the address bar is the entire configuration file.

**What went wrong three times running.** Sakshi filtered on screen, saw the right jobs, and copied the
link — and the link kept arriving with filters missing. First attempt: "remote" and "posted in the past
week" had been typed into the *keyword box* as words. LinkedIn treats those as text to search for, not
as filters, and it matches that text against the job description too — so "remote" would have matched a
posting saying "no remote work available". Second and third attempts: keywords were clean and the date
filter was there, but the **Remote** filter was absent from all four links and the **location** was
present on only one.

**Why this is worth writing down rather than just fixing.** The failure is silent in both directions.
A link missing its Remote filter doesn't error — it returns onsite jobs, cheerfully, and we pay per
result to pull jobs the pipeline then discards at the door. And a link with a *wrong* filter parameter
sends an unauthenticated scraper to a login wall, which comes back looking like "no jobs today" rather
than like a fault. Neither one announces itself.

**The practical rule.** Apply the filter, wait for the page to reload, then check the address bar
actually changed before copying. If it looks the same as before, the filter didn't take. Never
hand-write these addresses from remembered parameter names — LinkedIn's are undocumented and change
without notice, and this project has already lost time twice to a third-party detail that had quietly
gone stale (the retired Gemini model, D-97; the actor pricing, D-100).

## "Nothing said" and "zero" are different answers, and code has to keep them apart (2026-08-06)

**The concept.** The AI now reads how many years of experience a posting asks for. Some postings say
"3–6 years". Some say "3+". Plenty say nothing at all. That last group is not a gap in the data — it is
a real, common answer, and it means something different from the others.

**Why it matters here.** If "not stated" quietly becomes `0`, the job reads as *requires no experience*
— the most welcoming possible interpretation. That is the wrong direction to fail for a field whose
entire purpose is warning Sakshi off roles she is not eligible for. She would be shown jobs as open to
her precisely when the system knew least about them.

**Where this nearly broke.** The validation library has a convenience mode that converts whatever it
receives into a number. Handed nothing, that kind of conversion classically produces zero. It was worth
ten minutes to actually run it rather than assume: given an explicit "no value", it passes the nothing
straight through untouched; given the text "not stated", it falls back to nothing rather than guessing.
Both correct — but confirmed by running it, not by trusting the documentation in my head.

**A related choice: drop the absurd, don't round it.** If the AI ever returns "2024" for years of
experience, it has picked up a date, not a requirement. Squashing that to a maximum of 50 would turn an
obvious parsing accident into a plausible-looking requirement that nobody would ever question. So
implausible values are discarded back to "not stated" instead — the honest answer is that we don't know.

## A short pointer only prevents context loss if someone actually reads it (2026-08-06)

**The concept.** Instead of pasting a whole session's write-up into the next session, a small
automated hook now injects just the essentials — what's next, what was decided — plus a note
saying "the full story is at this exact line range, read it if this matters." That's cheaper on
every session start, but it only actually works if whoever's reading follows the pointer when the
short version isn't enough. If they don't, the information isn't wrong or missing from disk — it's
just never looked at, which looks identical to it not existing.

**Why this option was chosen.** The alternative — always injecting the full write-up — guarantees
nothing is missed, but pays that cost on every single session, including the vast majority where
none of it is relevant. This project's own memory system already runs on the cheaper bet (an index
plus files read on demand) rather than loading everything, everywhere, always.

**Where this nearly went untested.** It would have been easy to ship the short-pointer design on
the strength of the argument alone. Instead, one fresh agent was given only the short pointer and
another was given the full pasted text, and both were asked questions that only the full write-up
could answer. The short-pointer agent got every answer right — but only because it chose to open
the referenced file first, on its own, rather than guessing from what it had. That's the actual
mechanism the design depends on working, and it was worth confirming it does before trusting it,
rather than assuming a well-written nudge is the same thing as a nudge that gets followed.

---

## Driving the browser myself found in one pass what four rounds of instructions could not
**2026-08-07 (Session 18)**

Four separate attempts to have the LinkedIn search URLs captured by hand produced four unusable
sets — the Remote filter was missing from every one. The instructions were not wrong. The interface
was: ticking **Remote** in LinkedIn's dropdown changes nothing until **Show results** is clicked
*inside that dropdown*, and there is no visible confirmation either way. A person following correct
instructions gets a URL that looks finished and silently isn't.

What actually broke the loop was not better instructions but a different verification step: reading
the address bar after *every individual filter* and refusing to continue if it hadn't grown. That
turns an invisible failure into an immediate one. `f_WT=2` either appears or it doesn't.

A second detail would have defeated a scripted click-through too: **applying a filter reorders the
filter bar**, moving the active pill to the front. A remembered click position is stale the moment
the first filter lands — which is exactly what happened mid-session, reopening Remote instead of
opening Date posted.

**The generalisation:** when a handoff step fails repeatedly and the instructions read correctly,
stop rewriting the instructions. The failure is usually an interface that does not confirm its own
state, and the fix is a check that makes the missing state visible — not a clearer sentence.

---

## `source .env` silently produced an empty token, and the API's error blamed the wrong thing
**2026-08-07 (Session 18)**

The first two attempts to start the Apify run failed with `x402-payment-required: x402 payment
header missing. Add your PAYMENT-SIGNATURE or Apify token to proceed.` That error reads like a
billing or plan problem. It wasn't. `set -a && source .env` had produced an **empty** `APIFY_TOKEN`
(`${#APIFY_TOKEN}` = 0) even though the variable is present and 46 characters long in the file —
`source` aborts partway through on an unquoted value, and every variable after that point is simply
never set. `APIFY_TOKEN` sits at line 31, well past the offending line.

Two things worth keeping:
- **An unauthenticated request was reported as a payment problem.** Had the response been taken at
  face value, the next step would have been investigating the Apify plan or adding a payment method —
  for a token-parsing bug. Confirming identity first (`/users/me` returned `username`, `plan: FREE`)
  cost one call and pointed straight at the real cause.
- **Don't use `source` to read a `.env`.** It is a shell script evaluator, not a parser, and it fails
  quietly and *partially*. Parsing the file explicitly is both safer and, unlike `source`, tells you
  when a line is malformed.

Related: the same run's `x402` failures did **not** start a billed run, which was worth confirming
before retrying — a retry loop against a half-authenticated billing endpoint is how duplicate charges
happen.

---

## The first run's most valuable output was a number nobody was looking for
**2026-08-07 (Session 18)**

The run was scheduled to verify field mappings and price a cadence decision. It did both. But the
finding that actually changes the project's shape was incidental: **the AI provider's free-tier
daily quota, not scraping cost, is what limits throughput** — by roughly two orders of magnitude
(see D-105). $0.05 buys 50 postings in under a minute; the free AI tier enriches about ten a day.

Every prior discussion of cadence had been framed as "how often can we afford to scrape". That
question had a comfortable answer and was therefore never the constraint. The binding one was
invisible until 44 real jobs hit the pipeline at once and 39 of them came back `429`.

**Two smaller findings landed the same way** — as side effects of real data rather than things
anyone set out to check:
- `mapApifyItem` had been looking for `recruiterName`/`posterName`/`hiringPerson`. The actor emits
  `jobPosterName`. That field had resolved to `undefined` for every posting the project has ever
  ingested, and nothing failed — the tolerant `pick()` chain returns `undefined` as readily for a
  wrong guess as for a genuinely absent field.
- `apply_url` comes back `''` on **all 50** items, which quietly invalidates a comment in the code
  asserting that a null `apply_url` means "Easy Apply". It now means "we didn't ask".

**The generalisation:** a first real run is worth more than its stated objective, and the way to
collect that surplus is to look at everything it touched — not just the thing it was run to prove.
Both mapping bugs were invisible to typechecking, code review, and fixtures, because all three
confirm that the code does what it says while saying nothing about whether the outside world agrees.

## A rate limit and an outage need opposite responses, and one retry rule can't serve both (2026-08-07)

**The concept.** When a request to an outside service fails, code usually retries. But "failed" covers
two completely different situations. Sometimes the service is briefly broken (a 5xx error) — retrying
in under a second is exactly right, because the blip has probably already passed. Sometimes the
service is telling you *you are asking too fast* (a 429) — and retrying in under a second is the
worst possible move, because you're re-asking inside the same window you were just told you'd
exceeded. Our code used one rule for both: wait 800 milliseconds, try again, up to four attempts.

**What it cost.** The enrichment run needed 88 requests. It sent roughly 400. Almost all the extra
were retries knocking on a door that had just been closed, and each one made the burst look worse to
Google. The run then failed 39 of 44 jobs.

**Why we chose to fix the timing rather than find more quota.** The obvious reading was "we ran out
of our daily allowance, get more allowance" — a second account, or a second AI provider. Sakshi's
usage dashboard ruled that out: the failures recovered to 100% success *later the same day*. A daily
allowance doesn't come back until midnight. Only a per-minute limit clears on its own like that. So
the problem was never the size of the allowance; it was the shape of how we spent it.

**What the alternative would have cost.** Adding a second account would have "worked" in the sense
that the run would get further — while leaving a retry storm firing 4x the necessary requests at any
provider we pointed it at, and putting us in a gray area of the provider's terms for a problem we
didn't have. Merging two AI calls into one (also on the table) would have halved the requests without
fixing the bursting, so the same wall would arrive at twice the volume.

**The fix, in two parts.** Every AI call now passes through a single gate that enforces a minimum gap
between calls (default 4 seconds, tunable). And a 429 gets its own long wait (default 65 seconds,
or whatever the provider's own `Retry-After` header asks for), separately from the short retry that
5xx still gets. Both numbers are configurable because no provider publishes the real per-minute
ceiling — Google's own docs say to read it off your account's dashboard.

## Reading a page while logged out can be worse than not reading it (2026-08-07)

**The concept.** We wanted to know how many remote PM jobs exist at senior levels, to decide whether
to add a broader search. The check was done by loading LinkedIn's search URLs in a browser that
wasn't signed in. The numbers came back: 1,000+, 1,000+, 740, 870 — a huge, obviously-worth-it pool.

Signed in, the same four URLs return **72, 53, 57, 64**.

**What happened.** The "remote" filter in those URLs (`f_WT=2`) is simply ignored by LinkedIn's
public, logged-out search page. It returns every job matching the title regardless of whether it's
remote — and it does so silently. Nothing errors, nothing warns; you just get a number that is 15–20x
too high and looks perfectly credible.

**Why this matters beyond LinkedIn.** The failure mode is a *plausible wrong answer*, which is far
more dangerous than an error message. The decision being made was "is this worth adding" — and 1,000+
made it look like an obvious yes for the wrong reason, while the real answer (a pool comparable in
size to the searches we already run) is a much more modest yes on different grounds. Sakshi offering
her signed-in session is what caught it.

**The rule now written into `apify/task-config.md`:** any count not gathered from a signed-in session
is not a remote count. This is the third time this project has been misled by a third-party detail
that failed quietly rather than loudly (the retired Gemini model, D-97; the actor's pricing, D-100;
now the logged-out filter).

## A filter that patches its known failures is still the same bug (2026-08-07)

**The concept.** The ingest step had a check meant to throw away obviously office-based jobs before
spending AI on them. It searched the whole job posting for words like "onsite" or "hybrid". On real
data it was wrong half the time — it threw away three genuinely remote jobs because one listed
*Microsoft Office 365* as a skill, one mentioned an *onsite gym* as a perk, and one offered
*"hybrid, onsite or virtual"* as a menu of choices where remote was on the menu.

**What was tried first, and why it was removed.** The first fix kept the word search but demanded the
word sit near a work-related noun ("on-site **role**", "**position** is on-site"). It passed all three
known failures. Then it was re-checked against the actual American Express row and failed again: the
real sentence is *"flexible working model with hybrid, onsite or virtual arrangements"* — "working"
sits four words from "onsite", so any proximity rule fires. Sakshi's response was the correct one:
*"we decided no regex but use AI."*

**Why the smarter regex was the wrong shape, not just wrongly tuned.** All three original failures
came from prose — a skills list, a perks list, an options list. The word was never the problem;
reading prose without understanding it was. A proximity rule patches three known postings and waits
to be wrong on a fourth, which is precisely the thing the decision was meant to end.

**What it does now.** The pre-filter is **off by default**. Nothing is discarded at ingest, and the
AI classification step decides whether a job is remote — it can actually read a sentence. The keyword
check survives behind a flag, reduced to LinkedIn's own structured *location* tag (a real field, not
marketing copy) in case AI volume ever needs cutting.

**What the alternative would have cost.** Keeping any prose-reading version means the false-positive
rate is unknown-but-nonzero forever, and every failure is invisible: a discarded job produces no
notification and no gap you'd notice. The cost of the chosen path is real but bounded and
measurable — a few more AI calls per run, which Sakshi asked to be tracked over the next three runs.

**A quiet second find.** The word "virtual" was missing from the list of things that count as a
remote signal, even though it's ordinary job-posting language for remote. That omission is what left
the American Express posting undefended against its own "onsite" mention. Adding it only ever makes
the filter more permissive — it fails in the direction of keeping a job rather than silently dropping
one.

## An error message you don't print is evidence you don't have (2026-08-07)

**The concept.** When a service refuses your request, it sends back two things: a status code (a
number, like 429 = "too many requests") and a body (a paragraph explaining *which* limit you hit).
Our code caught the number, printed `rate limited (attempt 2)`, and threw the paragraph away.

That paragraph was the whole answer. Google's 429 body says, in plain text,
`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20` — a **daily** limit of
20 requests. Two sessions were spent debating whether the limit was per-minute or per-day. Every
single failure had been carrying the answer, and we discarded it on the way to the log file.

**Why it went wrong for so long.** The same response *also* says "Please retry in 46.855s". If you
only see the timing, a daily quota looks exactly like a short per-minute one — waiting 46 seconds is
what you'd do in both cases. The timing hint is ambiguous; the quota name is not. We kept the
ambiguous half and dropped the decisive half.

**What the alternative would have cost — and did.** Printing the full message is one line. Not
printing it cost a wrong diagnosis (D-107), a day of work building a fix for a problem we didn't
have, and a live test run that failed before it enriched a single job. The rule worth keeping: when
you catch an error to handle it, log what it *said*, not just that it happened. A category
("rate limited") is your interpretation; the message is the evidence. Interpretations can be wrong,
which is exactly when you need the evidence.

## "We couldn't check" and "we checked and it's bad" must never be the same value (2026-08-07)

**The concept.** Our pipeline scores each job `high`, `med`, or `low`. The scoring step is plain
arithmetic — it reads what the AI extracted (is this an AI role? does it match her background?) and
applies fixed rules. When the AI step failed, those fields were simply empty. And empty means "no
matching signals", which scores `low`. So 33 jobs got a confident-looking `low` for the sole reason
that nothing had ever looked at them.

Nobody sees an error. The job has a score. The score is wrong in a way that is invisible, because a
genuine `low` and a never-evaluated `low` are the same character in the same column.

**How other industries handle it.** Credit bureaus hit this exact problem with people who have no
borrowing history. They deliberately do *not* issue a low score — they return a separate outcome
called "thin file" or "unscorable", because a low score means "we looked and it's bad" while
unscorable means "we couldn't look." Around 45 million US adults sit in that category, and lenders
route them to manual review instead of an automatic decline. Medical testing does the same: "not
tested" is never filed as "negative".

**Why we put "unknown" in the view and not in the table.** The database has a rule that a stored
score must be `high`, `med`, or `low` — that rule is what keeps stored verdicts honest, so we didn't
want to weaken it just to fit a fourth value in. Instead the scoring step now refuses to write
anything at all when its inputs are missing, and the *read* layer (the query the dashboard uses)
reports that absence as `unknown`. Storage says "no verdict exists"; the screen says "not evaluated
yet". Both are true, and neither can be mistaken for a real judgement.

**What the alternative would have cost.** Two were rejected. Writing `unknown` into the table means
relaxing the database rule, after which nothing stops a future bug from storing `unknown` as if it
were a real verdict. Adding a "not evaluated" option to *every* field instead (is_ai, remote_type,
is_technical, and five more) means writing one fact — "the AI never ran" — in eight separate places
that can drift out of agreement, and changing the type of every field plus everything that reads
them. One fact belongs in one place.

**The uncomfortable part.** This is the third time this project has hit the same shape of bug —
`remote_type` first, then `salary_status` (where one `unknown` hid both "the posting didn't say" and
"our parser failed", making the parser's error rate unmeasurable), now scoring. The pattern is always
the same: a value that means "absent" quietly doubling as a value that means "we know it's nothing."
Worth checking for by default rather than rediscovering a fourth time.

## Quotas count requests, not tokens — and projects, not keys (2026-08-07)
**The concept.** When you call an AI provider, two different things get counted. One is *how much
text* goes back and forth (tokens). The other is *how many times you knock on the door* (requests).
Google's free tier for this model caps the second at 20 per day and barely cares about the first.

**Why that inverts the obvious fix.** Sending shorter prompts saves nothing. Asking one call to do
*more* work — nine outputs instead of eight — costs nothing extra and halves how often you knock.
That is why merging `classify` and `skills` into a single call doubles how many jobs get judged per
day, for free, with no change to the answers.

**Why extra API keys don't help.** Google's docs say limits apply per *project*, not per key. A key
is a password to a project, not a separate allowance — ten keys to one house is still one house.

**Why the proper solution turned out to be locked.** The industry answer to "I need lots of AI work
done cheaply" is a *Batch API*: hand over hundreds of separate requests, collect the answers within
24 hours, pay half. Each item still gets its own full-quality request — you trade speed for cost, and
speed is the one thing this project has to spare. The docs said batch has its own limits, separate
from the 20/day. A one-request probe said `FAILED_PRECONDITION`, which Google's error reference
defines as a missing prerequisite such as disabled billing. **Batch requires a paid account.** The
free-tier row missing from the batch limits table was the answer all along.

**What the alternatives would have cost.** Creating three extra Google projects gives 3× throughput,
plus an unresolved terms-of-service question and three sets of credentials to manage. Cramming five
jobs into one prompt gives more than that, but risks one job's details bleeding into another's answer
— silently, producing well-formed wrong results. Merging two calls into one gives 2× with neither
problem, which is why it went first.

## A mock made only of happy-path cards hides the state you will actually be in (2026-08-07)
**The concept.** A design mock is hand-made, so it naturally shows the product working perfectly —
every field filled, every card complete. Real data is mostly *incomplete*, and the incomplete version
is what people spend most of their time looking at.

**What it hid here.** `dashboard-mock.html` shows four jobs, each with a verdict, a summary, tags and
skills. In the live database, 38 of 52 jobs have none of that. And because the AI can only judge
about 8 new jobs a day, there will *always* be an unjudged tail sitting at the top of the list — the
newest arrivals, which are also the ones most worth applying to. The state the mock never drew is the
state the majority of the board is in, permanently.

**Why this is the same bug as D-112, one layer up.** In the database, "not evaluated" was collapsing
into "evaluated, found nothing" — a job nobody had looked at came out ranked *low*. A blank card does
exactly the same thing to a human eye. Fixing the data without fixing the screen would have
reproduced the bug in a quieter costume.

**The alternative that looked tidier.** Hiding unjudged jobs behind a filter would have made the
board look cleaner and silently omitted three-quarters of what the system found — which is precisely
the failure that stayed invisible for two sessions the first time round.

## Read the error, not the documentation (2026-08-08)
**The concept.** Every service publishes limits on a docs page and enforces them in its error
messages. When those disagree, the error message is right — it is the system describing itself, while
the docs are a description someone wrote once.

**Four times in one session the documented answer was wrong.** LinkedIn's remote filter (`f_WT=2`)
was in the URL and silently ignored, because the scraper reads the logged-out page. Four Gemini API
keys were assumed to give 4 × 20 requests because the quota is documented per project; the arithmetic
said otherwise. GitHub Models was recommended off comparison articles and had been shut down eight
days earlier. Groq was adopted for its documented 1,000 requests/day, and the real ceiling turned out
to be 100,000 tokens/day — about 43 jobs, not 1,000.

**Each was caught the same way: by counting something.** Not by reasoning harder. The Groq limit was
sitting in plain text inside a 429 body the whole time.

**Why this project keeps meeting it.** Free tiers are where providers put their least-maintained
documentation and their most-adjusted limits. Everything here runs on free tiers.

**How to apply.** Before adopting a capability, make one real call and read what comes back. Before
believing a limit, find the error that enforces it. A capability that has only been read about has
not been verified.

## A slow process and a hung process look identical from outside (2026-08-08)
**The concept.** A program waiting on purpose and a program stuck forever both show the same
symptoms: alive, no CPU, no output, no progress. Nothing about the outside view distinguishes them.

**What happened.** An enrichment run sat unchanged for twenty minutes. The diagnosis was "a network
request with no timeout is hanging" — plausible, and the code genuinely had no timeout anywhere. A
timeout was added, the run restarted, and it hung again. That disproved the theory. The real cause was
in the error message: the AI provider had said *"try again in 9 minutes 17 seconds"*, and with several
retries per job that is over half an hour of legitimate waiting. The run later finished correctly.

**Two things made it worse, both about observation rather than the bug.** Piping output through
`tail` buffers everything until the program exits, so "no output" meant nothing — that misled twice in
one session. And the check that would have settled it in one query — when was the last successful
call, and what did the last failure say — was the last thing tried rather than the first.

**The fix was kept anyway, and labelled honestly.** A dead connection really would hang forever, so
the timeout is correct code. It just wasn't the fix for this. Recording it as "right code, wrong
reason" matters more than it sounds: a future reader who sees it described as the cure for this hang
would trust it to prevent something it cannot.

**How to apply.** When something appears stuck, ask what it would be waiting *for* before assuming it
is waiting for nothing. Check the timestamp of the last real progress and the text of the last error
before forming a theory.

## A missing field in a select() list looks exactly like a real answer of "none" (2026-08-08)
**The concept.** A database column that exists, is populated, and is read correctly by the rendering
code can still never reach the screen if the query that fetches the row simply never asked for that
column. There is no error for this — the field is just `undefined`, and code that does
`value === 'x' ? '1' : '0'` turns "we never asked" and "the real answer is no" into the identical
output.

**What happened.** `dashboard-live.html`'s "AI roles only" filter always showed zero jobs, for every
combination of other filters. The rendering line was correct. The database had the right data — 20 of
31 jobs are actually AI-focused. The `.select()` call in `build-dashboard.ts` simply never listed
`is_ai` in its column string, so every job object arrived without that key, and the ternary quietly
resolved to "no" every time. Caught only by clicking the filter by hand and noticing 0 didn't match a
DB count of 20 — nothing in the pipeline raised an error.

**Why this is the fourth time, not the first.** `remote_type`, `salary_status`, and `priority` have
each previously collapsed "not evaluated" into "evaluated, found nothing" somewhere in this codebase.
This is the same failure one layer earlier — not a bad default *value*, but a column silently absent
from the query that was supposed to carry it forward at all.

**How to apply.** When a filter, chip, or count reads as a suspicious zero, don't just check the
rendering logic — check whether the field it depends on was actually requested from the database in
the first place. A `select()` list is as much a place for this bug to hide as a null-coalescing
default is.

## A default you never set is still a choice — check the schema before diagnosing the data (2026-08-08)
An Apify actor search kept returning exactly 10 jobs, no matter how the time window was changed, and
a different 10 jobs each time for the same search. The natural read was "the actor's crawl coverage
for this niche is bad" — and there was real supporting evidence for that theory: eyeballing LinkedIn
directly (logged in, so the numbers were trustworthy) showed 89 real matching jobs for the same
search, and 4 of the 10 Apify results were confirmed to be genuinely present in that 89. So the data
Apify returned was accurate, just apparently incomplete — a coverage-gap story that held together.

It was wrong. The actor had an input field called `limit` ("Maximum Jobs per API call") with a
default value of 10, and every request sent that session simply never included it. Every symptom —
always exactly 10, a different 10 each time — was explained by "grab the first 10 matches found,"
not by "this niche only has ~10 real jobs." Setting `limit: 150` fixed it in one request; the real
number was 45.

**How to apply.** When a third-party tool's output looks capped, inconsistent, or suspiciously round,
check its actual input schema for a default value before building a theory about *why* the data is
short. A parameter you never set is still doing something — usually falling back to whatever the
tool's author considered a safe minimum, which is rarely what you actually wanted.

## Where a filter lives changes what kind of mistake it can make (2026-08-08)
Two very similar-looking requests this session landed in opposite places for a reason worth naming
plainly. Both were "stop spending AI credits on jobs Sakshi wouldn't apply to, based on the job
title." The first version (D-126, an earlier session) was rejected. A near-identical request later
the same night (D-133) was accepted. The difference wasn't the goal — it was *where in the pipeline*
the filter would sit.

D-126's version filtered at ingest: a job whose title looked wrong would never be stored at all. If
the title-matching logic was wrong about a specific job — and title-keyword matching is measurably
wrong about half the time — that job is gone. No record, no visibility, no way to notice the mistake
later, let alone fix it.

D-133's version filters one step later, at enrichment. The job is still stored. It still shows up on
the dashboard, honestly labeled "not yet evaluated." The AI just doesn't automatically spend a call
on it. If the title-matching guess turns out wrong for some job, it's still sitting there, inspectable,
and can be enriched manually at any time.

**How to apply.** "Should we filter this?" is often the wrong first question when the filter's logic
is itself imperfect. The better question is "if this filter is wrong about a specific case, can we
tell, and can we undo it?" A mistake that's visible and reversible is a very different kind of risk
than one that quietly erases the evidence it happened.

## A soft-delete can orphan things that point at it, if nothing checks (2026-08-08)
Marking 88 old jobs as "excluded" (a `dropped_reason` field, not an actual delete) was meant to be a
clean, reversible way to retire bad data while a new source took over. It mostly worked — every part
of the app that reads jobs already knew to skip anything with `dropped_reason` set.

What it missed: a separate feature, built earlier for a different reason, links duplicate postings of
the same real job together by pointing the newer one at the older one ("this is the same job, go look
there"). That link only checks whether the *newer* job itself is excluded — it never checks whether
the *older job it points to* has since become excluded. So brand-new, perfectly good postings that
happened to match an old company+title combination silently inherited a pointer to a now-hidden job,
and inherited its invisibility along with it. This wasn't caught by any error — the jobs just never
appeared anywhere, the same "confident wrong silence" pattern this project has hit several times
before with missing/absent values.

**How to apply.** When something gets soft-deleted or excluded, it's not enough to check that direct
readers respect the exclusion flag — anything that *references* the excluded thing needs to be
checked too. A link to a now-hidden record doesn't announce itself as broken; it just quietly hides
whatever points at it.

## When a boundary was drawn on purpose, extend it with a new door, not a hole in the wall (2026-08-09)
A prior decision (D-133) had deliberately kept senior-titled jobs out of the AI enrichment pipeline
entirely — the whole point was to stop spending AI quota on roles Sakshi wouldn't apply to. Then a
real need showed up for *part* of that pipeline (just remote-status checking) to run on those same
senior-titled jobs anyway, on a lower priority.

The tempting shortcut: add an `if (isSeniorTitle) { onlyCheckRemote() }` branch inside the existing
enrichment function. That would have worked, but it would have put the title-based decision back
inside the one function D-133 was specifically written to keep title-blind — the next person editing
that function would have no way to tell, just by reading it, that its behavior secretly depends on
who's calling it and with what job. The fix that was actually built instead: a **fully separate**,
parallel function for the new narrow case, reusing the same building blocks (the same "write a
result row," "record what it cost," "retry if it failed" pieces) without merging the two code paths
into one. The original function is provably unchanged — nothing about it needed to be re-read or
re-verified to trust that the old behavior still holds.

**What the alternative would have cost.** Every future person editing the "real" pipeline would first
have to work out whether their change also silently affects the narrow side-case living inside the
same function — an invisible tax on every future change, for the life of the code. Paid once now
(a bit more duplicated scaffolding) instead of paid repeatedly later (every reviewer re-deriving
"does this branch affect the other case too?").

**How to apply.** When a rule was written specifically to keep two things separate, a new requirement
that touches both is a signal to add a new, parallel path — not to reopen the original and teach it a
special case. If you can't describe the original function's behavior without mentioning the new
case, the boundary has already been broken, even if the tests still pass.

## Two things that look alike ("a provider ran out of AI quota for the day") can need entirely different fixes if their internal shape differs (2026-08-09)
Two AI providers this project has used both have a hard daily cap, and both needed the same kind of
handling: notice the cap was hit, stop retrying into it, and let the job wait for tomorrow. It would
have been tempting to reuse the exact same tracking code for both. That would have been wrong, and
here's why: one provider (Gemini) hands out several separate keys, each with its own small daily
allowance of *requests* — so the fix there is "rotate to the next unused key." The other provider
(Groq) has just one key, and its cap is on total *tokens* used that day, not request count — there is
no second key to rotate to; the only fix is "stop entirely until tomorrow." Code written to rotate
keys has nothing to rotate to for the second provider, and code written to count tokens has no
concept of "which key" for the first. Reusing one module for both would have meant bending one shape
to fit a resource that doesn't actually work that way — a "cap exhausted" event that looks identical
from the outside can still demand a structurally different fix underneath.

**How to apply.** Before reusing an existing "we hit a limit" tracker for a new provider or resource,
check what's actually being rationed (requests? tokens? per key or per account?) and how many
independent allowances exist. If the shape differs, write a small parallel tracker rather than
force-fitting the new case into the old one's assumptions — it's a few more lines now, in exchange for
not silently mis-modeling the actual limit later.

## Replacing something isn't finished until the old thing is actually gone (2026-08-09)
Two days ago this project switched which service it uses to fetch job listings, because the old one
couldn't filter for remote jobs properly. The switch was made, the new service was used, everything
worked — and the old service's code was simply left sitting in the codebase, unused. Or so it
appeared.

It wasn't entirely unused. There's a piece of code whose job is to receive job listings
automatically whenever a scheduled scrape finishes — and *that* piece was never updated. It was
still expecting the old service's data format. The two formats have nothing in common: they don't
share a single field name. So if that automatic scrape had ever actually run, this code would have
looked at every incoming job, failed to recognize any of it, thrown all of it away, and then
reported **success**. No error, no warning, just zero jobs saved and a green light.

The only reason this never caused visible damage is luck of timing: the automatic schedule it
depends on was never switched on, so nothing has ever arrived at that endpoint for real. It has been
quietly broken and waiting.

**How to apply.** When you migrate from A to B, "we're using B now" is not the same as "A is gone."
Until A is actually deleted, some caller can still be pointed at it — and a caller nobody is
currently exercising won't tell you it's wrong. The cheap check is to delete the old thing and see
what the compiler screams about; every scream is a place still wired to it. Leaving the old code
"just in case" feels safe and is the opposite: an unused second path is precisely the kind of thing
that rots without anyone noticing, because nothing is watching it.

## Prove the new thing works before you delete the old thing (2026-08-09)
When removing retired code, the instinct is to delete it and then fix whatever breaks. Sakshi's
instruction was the reverse: *don't delete anything until you confirm the new code works.* So the
order became — write the new test data, port the tests to the new code, fix the broken caller, run
everything green — and only then start deleting.

That ordering immediately earned its keep. During the deletion step, a small helper function was
removed on the reasoning that only the old code used it. That was wrong: the new code uses it too,
just written slightly differently (`pick<string>(...)` instead of `pick(...)`), which is why a quick
search for it had missed it. The type checker caught the mistake in seconds — and it was
*unambiguous*, because everything else was already known to be working. The error could only be from
the deletion.

**What the alternative would have cost.** Deleting first means the code is broken from the very first
step, so every error afterwards is ambiguous: is this because I deleted something, or because the
replacement isn't finished? You end up debugging two things at once and can't tell them apart. Doing
it in the safe order means there is always exactly one suspect.

**How to apply.** For any removal, get to a green state that no longer depends on the old thing
first, then delete. The rule generalizes: never let "does this work?" and "did I break it?" be open
questions at the same time.

## "Confirmed" only means as much as the step that writes it — check when that step actually runs (2026-08-09)
This project has a list of companies it's confirmed hire remote workers from India. For two days,
that list looked trustworthy: 82 companies, each supposedly backed by a real remote job posting.
Checked properly, only 9% of them had ever actually been verified as remote by the system's own AI
judgment. The other 91% just had a job survive an early, much weaker check — a company got added to
the "confirmed remote" list the moment *any* job of theirs made it through a rough first filter, long
before anything had actually looked closely enough to say "yes, this one is genuinely remote."

The two steps — "does this look plausible enough to keep" and "is this actually remote" — happen at
completely different times, days apart in the pipeline, run by separate commands. The code that
writes "confirmed" to the list runs at the *first*, weaker step. It was never wired to wait for the
second, real answer — not because anyone decided that was fine, but because the second answer simply
doesn't exist yet at the moment the writing code runs. The word "confirmed" ended up meaning
something much thinner than it sounds.

**How to apply.** When something gets labeled "confirmed," "verified," or "checked," find the exact
line of code that writes that label and ask what already had to be true at that exact moment for it
to be honest. If the real verification happens in a separate, later step, a label written earlier can
only ever mean "survived the earlier, weaker step" — no amount of trusting the label's name changes
that. This is the same shape as the "absent is not the same as negative" pattern already found in
this project (`remote_type`, `salary_status`, `priority` all "not evaluated" quietly reading as
"evaluated, found nothing") — the connecting thread is a status field being read as more meaningful
than the code that actually sets it can support.

## Writing a database query across multiple lines can silently break its type-checking (2026-08-09)
This project talks to its database (Supabase) by writing, for each query, a plain text list of which
columns to fetch — e.g. `"role_title, company, location"`. Because that list is just written directly
in the code (not built up from variables), the type-checker is able to read the literal text and
confirm every column name in it is real, catching typos before the code ever runs.

That only works if the column list is written as one single, unbroken piece of text. This session, a
query's column list was split across two lines for readability, joined with a `+` (e.g. `"role_title,
company, " + "location"`). The type-checker cannot read text built by joining two pieces together the
same way it reads one plain piece of text — as far as it's concerned, the result is just "some text,
shape unknown," not that specific list of columns. It didn't error at the join; it silently gave up on
checking anything about the columns at all, and every place that used the query's result then failed
to type-check too, with an error message that named none of this.

**How to apply.** When a database query's column list needs to be readable across multiple lines, keep
it as one continuous quoted string (breaking the *line* is fine, breaking the *string* with a `+` is
not). If a query written this way starts producing type errors that don't mention the query itself,
check whether the column list got joined from pieces rather than written as one literal — that mismatch
was the actual cause here, not whatever the error message pointed at.

## A single PASS/FAIL column is enough to compute most eval metrics — the fancier-sounding ones are usually just that same column, grouped differently (2026-08-13)
**What it is:** when grading whether an AI got something right against a hand-labeled answer, it's
tempting to think "accuracy," "precision," "recall," and "false-negative rate" are separate things
that each need their own setup. For a field with one clear right answer per test case (like "is this
job remote: yes/no"), they mostly aren't separate — they're the same underlying pass/fail data,
counted with a different grouping. Overall accuracy = pass count ÷ total. False-negative rate = pass
count ÷ total, but only within the rows where the correct answer was "yes." Same raw column, different
filter.
**Where it stops being true:** three cases where you genuinely need more than pass/fail, not just
different grouping — an ordinal score (1–5) needs the actual predicted number to compute "how far off"
(MAE), a list-valued field (multiple tags at once) needs precision/recall over the set, not a single
pass/fail, and a full confusion matrix (which wrong answer it gave, not just that it was wrong) needs
the actual predicted class kept alongside the pass/fail flag, not instead of it.
**How to apply:** don't build separate infrastructure for "precision," "recall," and "accuracy" up
front — start from one graded PASS/FAIL column plus whatever tags describe each test case (here:
`severity`, `field_under_test`, `input_pattern`, `root_cause`), and get most of the useful metrics by
grouping/filtering that one column different ways. Only reach for something heavier (MAE, set-based
P/R, a confusion matrix) when the field type genuinely can't be reduced to yes/no — and even then, keep
the raw predicted value next to the pass/fail flag rather than discarding it, since the heavier metric
needs it later.

## This machine's default `python3` (3.9) can't run tooling written for newer Python, and LibreOffice isn't preinstalled (2026-08-13)
**What it is:** the `xlsx` skill's formula-verification script (`recalc.py`) needs a Python feature
only added in 3.10, but this Mac's `/usr/bin/python3` is 3.9 — running it directly fails with a
`TypeError` about an unrecognized argument, not an obviously-Python-version-shaped error. Separately,
the same script shells out to `soffice` (LibreOffice) to actually recalculate the spreadsheet — a real
Excel-compatible engine — and LibreOffice isn't installed on this machine at all, unlike the
skill's own sandboxed/cloud environments where it's auto-configured.
**Why this matters:** a workbook edited with `openpyxl` has formulas written as plain text with no
computed values cached inside — until something actually recalculates it, every formula cell reads
back as blank/`None` to any tool checking it, so skipping this step means handing over a file that
*looks* unpopulated even if the formulas are correct, or worse, shipping a formula typo that nothing
ever caught.
**How to apply:** on this machine specifically, point the skill's Python tooling at
`/opt/homebrew/bin/python3.12` (via a throwaway venv with `openpyxl` installed) rather than the
default `python3`, and expect to install LibreOffice via `brew install --cask libreoffice` (~1GB, not
fast) the first time a session needs to verify formulas in an xlsx file — it won't already be there.

## Where you put the "why" in an AI's answer changes whether it's a real reason or an excuse (2026-08-10)
This project asks an AI a structured question — is this job remote, is it technical, and so on — and
gets back an answer plus one sentence explaining that answer. The AI writes its response one word at
a time, left to right, in the order the fields were asked for. This project's own question always
asked for the answer first and the explanation last.

That ordering matters more than it sounds like it should. When the AI has to write the answer before
it's allowed to write anything else, it commits to a decision using nothing but a quick first
impression — the explanation that follows isn't really *why* it decided; it's a sentence invented
afterward to sound like a reason. Checked two real cases where the AI got the answer wrong: both had
a clear, correct answer sitting right in the text it was given, but because it had already written
"not remote" before it ever got to explain itself, the explanation it produced didn't actually
grapple with that text at all.

**How to apply.** When asking an AI for both a decision and a reason, ask for the reason first. Making
it write out its reasoning before it's allowed to commit to an answer forces the reasoning to actually
be load-bearing, instead of becoming a justification invented after the fact for a decision already
made. This is a known, standard pattern (often called "reasoning before answering") — worth reaching
for by default any time a structured AI answer includes an explanation field, not just when something
has already gone wrong.

## Why a public website can't be trusted to "just not ask" for private data (2026-08-14)
The dashboard is a website that talks to the database directly from your browser — no middleman
server. That shape was chosen deliberately (D-110) because it's simpler and Sakshi can explain it.
But it has one hard consequence: **the key the website uses is visible to anyone who views the page
source.** Browsers can't keep secrets. So "the website only asks for safe columns" protects nothing —
anyone can take that key and ask for whatever they like.

That means the *database itself* has to be the thing that refuses. Two ways to build that refusal,
and this session used the weaker one and then found a reason to want the stronger one:

- **One wall (what's live now).** The public key can't touch the `jobs` table at all. It can only read
  through a single purpose-built window (`v_jobs_public`) that was constructed without the recruiter
  columns in it. Safe today — but *all* the safety is in that one window being built right.
- **Two walls (what shipped).** Same window, plus the recruiter columns are individually locked at
  the table level, so even if someone later opens the table up, those specific columns stay shut.

**What tipped it toward wanting two walls:** while building the window, a second copy of the recruiter
emails turned up somewhere nobody had documented — a "raw AI response" field that stores whatever the
AI returned, and the AI returns recruiter contact details as part of its answer. Every prior decision
about this data (D-115, D-142, D-155) reasons about *one* copy. Nothing is leaking, because the door
is locked — but with one wall, that second copy's safety depends entirely on nobody ever unlocking the
door for an unrelated reason.

**Why not just keep one wall?** It works, and it contradicts nothing about today's behaviour. What it
costs is that a future change — someone granting the public key table access because "the view is safe
anyway" — would expose recruiter data with no error and no warning. That silence is the problem: you
would not find out from a crash, you would find out from someone else. Two walls makes that same
mistake harmless, so two walls is what was built.

**Also worth knowing, found the same session:** Supabase hands the public key *full* write permission
on every table by default. Nothing has been writable only because a separate switch (RLS, turned on in
D-143) refuses every request that no rule explicitly allows. That's one switch standing between a
public key and delete access on everything — worth knowing rather than discovering later.

## `openpyxl`'s `ws.cell(row, col, value=None)` silently does nothing — clearing a cell needs `.value = None` directly

Editing a spreadsheet with code, "set this cell's value to `X`" and "clear this cell" look like they
should be the same operation with `X=None`. They aren't, in the library this project uses
(`openpyxl`).

`ws.cell(row=2, column=18, value=None)` reads like "set the cell at row 2, column 18 to empty." What
it actually does is nothing — the library treats a `None` argument as "no value was given," not as
"clear it," so it fetches the cell and hands it back completely unchanged. The library's own source
confirms this in one line: it only writes the value in when the value **is not** `None`.

This surfaced during D-159's smoke test, where the plan was: fill in some test `PASS`/`FAIL` values,
confirm the sheet's formulas compute correctly, then clear those test values back out so the file
doesn't look like a real run happened. The "clear" step used exactly this pattern in a loop, reported
success, and the file *looked* reverted on a quick check — but the stale test values were still there,
caught only by a closer re-inspection.

**The fix:** grab the cell object first, then set `.value = None` directly on it
(`ws.cell(row=2, column=18).value = None`) — that bypasses the guard and genuinely clears it.

**Why this matters beyond this one bug:** any script in this project that tries to blank out a range of
cells — clearing a stale run, resetting a template, undoing a test — needs to use the direct-attribute
form. The constructor-style call silently protects against exactly the operation you're trying to do,
and it fails without any error, so nothing tells you it didn't work. The only way to catch it is to
actually re-read the file afterward and check.

## LibreOffice's recalc step silently turns literal `TRUE`/`FALSE` cells into `=TRUE()`/`=FALSE()` formulas

This project's xlsx files get recalculated by opening them in LibreOffice and saving them back out
(`recalc.py`, needed because the library that writes formulas doesn't compute their results itself).
That resave step has a side effect worth knowing about: a cell that was written as a plain boolean
value — not a formula, just the literal answer `true` or `false` — comes back out the other side as
the formula text `=TRUE()` or `=FALSE()`.

Found while adding golden-dataset rows for a boolean field (`geo_explicit`): the `expected_value`
column is supposed to hold a plain fact ("the correct answer is `true`"), not a live formula, and
after a recalc pass it had quietly become one.

**Why this is a known-harmless quirk, not a bug that needs chasing:** the formula `=TRUE()` always
evaluates to the same thing the literal `true` would have — reading the cell's *computed value* (as
opposed to its raw formula text) gives back the correct `True`/`False` every time, and anything that
compares against it (a spreadsheet formula, a script reading the file) sees the right answer either
way. It's a cosmetic surprise, not a data-correctness problem, and it happens on every recalc pass in
this environment regardless of what did the writing — nothing about how the cell was created causes
or prevents it.

## A grant check and a read are not the same verification

`v_jobs_public` was built, granted, and verified — and had never once returned a row to `anon`. The
verification looked at the privilege *listing* and confirmed the right columns were absent. What it
could not see is that a column omitted from the grant was still being read by the view's own `WHERE`
clause, which under `security_invoker` runs with the caller's privileges. Every anon request failed
with `permission denied for table jobs`. The gap sat there until an app actually queried it.

The general shape: **checking that a property holds is not the same as exercising the thing the
property is supposed to enable.** "No PII columns appear in anon's privileges" is a statement about
what is absent. "anon can read the dashboard" is a statement about what works, and only the second
one is what the surface was built for. The first was true the whole time.

Cheap habit that would have caught it in seconds: after any grant/policy/view change, issue one real
request as the target role — `curl` against `/rest/v1/<surface>` with the anon key — before declaring
it verified. Same family as "read the error, not the docs": exercise it, don't reason about it.

## Why the dashboard's shared code returns data instead of HTML

Three different things now draw the same job board: the hand-made design mock, a script that bakes a
one-off HTML file from the database, and the real web app. All three need the same small answers —
what colour and label a verdict gets, how a salary is written out, how "posted 13 days ago" is
phrased, which warnings a job earns.

Those answers now live in one file (`lib/dashboardFormat.ts`) that all three call. The choice worth
recording is that this file hands back **plain facts** — the words `"Probably not"` and the style
name `"no"` — and never hands back finished HTML.

**Why that matters.** The old script built its answers as ready-made snippets of HTML, e.g. the
literal text `<span class="sal soft">not stated</span>`. That is convenient for something that
writes an HTML file and useless to the web app, which builds its screen a completely different way.
Had the shared file kept returning HTML, the app would have had to keep its own second copy of every
one of those rules — and a second copy is a copy that drifts. Six months later the file says
"Probably not" and the app says "Unlikely" and nobody knows which is right.

**The tradeoff, honestly.** Returning plain facts is slightly more work at each of the three call
sites: each has to wrap the words in its own markup rather than pasting a finished snippet. That is
the cost, and it is paid once per place. What it buys is that there is exactly one file to change
when a label changes, and no way for the three renderings to disagree.

**How this was checked rather than assumed.** After moving the script onto the shared file, the
one-off HTML snapshot was regenerated and compared against the committed one. The only differences
were timestamps, day counts and a rename that had already happened elsewhere — no structural change
at all. That comparison is the evidence the move didn't quietly alter anything; without it, "I only
refactored it" would just be a claim.

## A spreadsheet's column headers can lie about what a formula actually reads — and the mismatch can stay invisible for a long time (2026-08-14)

While rewriting the `why_this_test_exists` column in `golden-dataset-template.xlsx` in plain language
(D-163), a check of whether the sheet's `Summary` tab reads that column turned up a real, pre-existing
bug: the "Case-level detail" table's columns are shifted one column to the left of what their own
headers claim. The header on one column reads "output (baseline_v4_prompt-2026-08-13)" — but the
formula underneath it actually pulls from the `why_this_test_exists` column, not the column that
actually holds the model's output. Every column after it in that row is off by the same one-column
shift.

**Why this stayed hidden.** A spreadsheet formula like `='Golden Dataset'!P2` doesn't know or care what
its own column header says — it just returns whatever is sitting in cell P2, no matter what that cell
happens to contain. As long as column P held short, mostly-blank-looking text, a formula quietly
pulling from the wrong column produced output that still looked roughly plausible, so nobody noticed
the header and the formula disagreed. The bug wasn't introduced by this session's edit — it was already
there — but rewriting column P into full paragraphs is what would have made it obvious the next time
someone actually ran the eval and looked at the "output" column, because a paragraph of "why this test
exists" prose would show up where a one-word model verdict was expected.

**The general lesson.** A column header is a label a human wrote once; a formula's actual cell
reference is what the computer really does. The two can drift apart silently, especially after any
column-reordering pass (this sheet had one, in D-159), and the drift is easiest to catch by reading
the formula's real reference against the data, not by trusting that a header and the cell beneath it
still agree. Checking "does any formula reference the column I'm about to change" is not the same
question as "does every formula that claims to reference a column actually match its own label" — the
first check (done here) can pass clean while the second (not done here, since it wasn't this task's
job) would have caught the bug earlier.

**Follow-up (fixed under D-164).** When the fix was made, the sheet turned out to contain its own
proof of which side was wrong. The conditional formatting on those columns already turned a row red on
`E41="FAIL"` — meaning it expected column `E` to hold PASS/FAIL, which under the buggy formulas it
never did. That highlighting had therefore been dead the whole time: no possible input could trigger
it. A rule that can never fire is itself evidence something upstream of it moved. Worth checking for
directly, because it is a signal that survives silently for as long as the feature goes unused, and it
points at the mistake without needing any data in the sheet at all.

**What would have happened without checking.** If the verification step had only confirmed "column P
isn't referenced by any Summary formula" and stopped there — which is literally true, nothing reads
`why_this_test_exists` on purpose — the mismatched formula in the adjacent output column would have
stayed just as broken, but now invisibly disguised behind newly-written, more plausible-looking prose,
making it harder for a future eval run to notice something was wrong.

## When a value is hidden on purpose, you cannot diagnose it by looking — only by overwriting it (2026-08-14)

The dashboard deployed to Vercel and showed "Could not load from Supabase — Missing
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY". It took three wrong explanations before it
was fixed, and the wrong turns are the useful part.

**The background concept, which is true and worth knowing.** There are two moments in a website's
life: **build time**, a one-off step where source code is compiled into the finished files, and **run
time**, when a visitor's browser loads the page. Settings named `NEXT_PUBLIC_…` are read at *build*
time and written permanently into the finished JavaScript — like printing a phone number onto a
poster. Changing the number in your address book later does nothing to posters already printed.

**The three explanations, and what killed each one.**
1. *"The values were added after the site was built, so just rebuild."* Reasonable, and it fits the
   concept above. **Disproven:** a rebuild ran with the variables already saved and still produced a
   bundle containing `undefined`.
2. *"The variables aren't ticked for the Production environment."* **Disproven** by looking: both were
   scoped "Production and Preview".
3. *"Vercel's Sensitive flag withholds values from the build."* **Not supported:** Vercel's own docs
   describe redacting sensitive values *from build logs*, which implies they do reach builds.

**What actually fixed it.** Re-entering the anon key value by hand and saving — at the same time as
clearing a Vercel warning on that variable ("this key is prefixed with `NEXT_PUBLIC_` and includes the
term `key`… Mark as Safe"). The next build inlined both values correctly.

**Be honest about what that proves: not much about which one mattered.** Two things changed in a
single save. The stored value was overwritten *and* the safe-mark was applied. A blank or mis-parsed
value — plausible, since these were bulk-imported from a `.env` file — throws the exact same "Missing"
error as a value that never reaches the build. Nothing gathered so far separates the two.

**The lesson that did hold up.** The variable was marked **Sensitive**, which makes Vercel refuse to
show the value back to anyone — "Copy to Clipboard" is greyed out with a padlock. So *no amount of
looking at the settings screen could distinguish "correct value" from "empty value".* When a system
deliberately hides a value from you, inspection is not available as a diagnostic at all; the only move
that yields information is to overwrite it with a known-good value and see what changes. This is the
same shape as the earlier `v_jobs_public` lesson — checking a privilege *listing* proved which columns
were absent while the surface returned zero rows for a week. Exercise the thing; don't inspect the
property.

**The one diagnostic trick worth reusing.** To answer "has a rebuild actually happened since I changed
that setting?", look for some *unrelated* recent change and check whether it is live yet. Here, a CSS
colour fix was sitting in the same pending commit. Fetching the deployed stylesheet and seeing the old
colour proved in one step that no rebuild had occurred — no build logs, no timestamps, no guessing.
Later, seeing the *new* colour alongside a still-broken page was what killed explanation 1.

## A test set that only tests one direction produces a label that looks meaningful and isn't (2026-08-14)

The golden dataset has a column called `severity`. Its job is to answer one question about each test
row: *if the AI gets this wrong, what does it cost you?* Two answers are allowed — you see junk you
didn't want, or you miss a job you wanted. Those are labelled with the statistics terms "false
positive" and "false negative."

Sakshi asked why every single row has one of the two filled in, even where neither really fits. That
question found something a narrower audit (D-163) had missed.

**What was actually wrong.** For 14 of the 15 rows, the answer in that column is completely determined
by the column next to it. Every remote-type row says "you miss a job." Every geo row says "you see
junk." So the column isn't recording a judgement about each individual case — it's restating what kind
of case it is, in different words. You could delete the column and rebuild it perfectly from its
neighbour.

**Why it got filled in everywhere anyway.** Only two answers were offered, so there was no way to say
"neither of these fits." The striking part is that the same spreadsheet already solves this properly in
its other tag columns, which offer a third choice — *checked, genuinely not a factor here* — and
explicitly document that the resulting blank is deliberate rather than forgotten. The severity column
never got that third option. This is the same "absent is not the same as negative" trap this project
has now hit several times: without a way to say "doesn't apply," a real answer and a shrug look
identical in the data.

**And for two fields the question doesn't even parse.** False positive / false negative assumes a
yes-or-no answer that can be wrong in one of two directions. `remote_type` has four possible answers
(remote worldwide, remote within India, hybrid, in-office) — picking the wrong one of four isn't
"wrongly saying yes." `technical_depth` is a score out of five — answering 3 when the truth is 4 is
just a bit off, with no yes or no involved anywhere.

**The smoke-alarm framing, which is the real point.** Every test in the set is a case where the correct
answer is "yes, show this job." Not one tests the opposite — a job that should be hidden, which the AI
wrongly shows anyway. It's a smoke alarm test suite where every test is *"there's a fire, does it go
off?"* and none is *"there's no fire, does it stay quiet?"* So when you ask which failures are false
alarms and which are missed fires, everything answers "missed fire" — not because that's a finding, but
because the false-alarm test was never written. **The uniform column isn't a labelling bug; it is the
test set honestly reporting that it only covers one direction.**

**Why it matters beyond tidiness.** The Summary sheet publishes a number labelled "False-negative
rate." That is a real, widely-understood technical term. Because of everything above, the number
underneath it is really just "how often did the remote and AI-job questions fail" — it doesn't mean
what its label promises. This workbook is portfolio material, so the readers most likely to see that
label are the readers most likely to know exactly what it should mean.

**The transferable lesson.** When a categorical column in an evaluation set comes out overwhelmingly
uniform, the first question is not "are the labels right?" but **"can this column be derived from
another one?"** If it can, it is not measuring anything on its own — and the usual reason is that the
data only covers one side of the thing the label claims to distinguish. Fixing the labels there treats
the symptom; adding the missing cases is what makes the column mean something.
