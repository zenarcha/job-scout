# Learnings — Remote PM Job Tracker

Technical choices explained in plain language, with the concrete tradeoff of the road not taken.

---

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
