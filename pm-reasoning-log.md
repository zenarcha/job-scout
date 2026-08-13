# PM Reasoning Log

`decisions.md` records **what** was decided and which alternatives lost. This file records **how the
thinking moved** — the pushbacks, the reversals, the moments where a question reframed a problem.
Kept because the reasoning generalises past this project.

Started 2026-08-04 (Session 8). Newest at the bottom.

---

# Session 8 — 2026-08-04

## 1. "Which should I start with — what is load-bearing?"

**The moment:** handed a 7-item next-steps list, Sakshi didn't pick from it. She asked which item
*everything else depended on*.

**What that changed:** the list was ordered by topic, not by dependency. Checking `.env` showed two
missing secrets gated every other item — including items that looked independent. The honest answer
wasn't "start at #1," it was "#1–7 are all downstream of something not on the list."

**The generalisable bit:** a prioritised list and a dependency graph are different objects. Lists
invite you to start at the top; only the graph tells you what unblocks the rest. When someone hands
you a list, the first useful question is *what is every item waiting on?*

**AI-PM flavour:** this recurred all session. Nearly every open question in this project — cadence,
cost, coverage, title leakage, actor choice — collapses to **one real run that has never happened**.
Analysis kept substituting for the run.

---

## 2. Defining the term before designing the table

**The moment:** asked whether companies stored just as a remote-friendly reference should be separate
from the watchlist, Sakshi stopped and asked: *"What do you mean by watchlist? Let us first define
that."*

**What that changed:** everything. Once "watchlist" was pinned to *companies I am actively pursuing*,
the answer was obvious — a reference catalog is a different concept with a different bar and different
consequences. Before defining it, the two were being argued about as if the disagreement were about
schema. It wasn't; it was about vocabulary.

**The generalisable bit:** when two people disagree about where data should live, check first whether
they mean the same thing by the noun. A conflated term produces a table that serves neither meaning —
and the conflation hides inside a name everyone thinks they agree on.

**The tell:** the original watchlist had been seeded with 11 "prominent AI companies" with no evidence
any hired remote-from-India. That seeding made sense under one reading of "watchlist" and was
indefensible under the other. The bad data was a symptom of the undefined term.

---

## 3. Scoping a feature until its cost becomes tractable

**The moment:** two columns (`link_status`, `last_checked_at`) had sat inert since Session 1, built for
a staleness-detection feature nobody would schedule — because re-fetching every live job's URL on a
recurring schedule is its own scraping subsystem with its own cost and ToS exposure.

The obvious moves were *drop the columns* or *keep them and hope*. Sakshi proposed a third: **only
check jobs older than a month.**

**What that changed:** the cost problem largely dissolved. Most jobs get a decision or lose relevance
within a month, so the checkable set becomes a small, slow-growing tail rather than the whole live
corpus. The feature went from unschedulable to plausibly cheap without changing what it does.

**The generalisable bit:** when a feature is too expensive, the question isn't only "build or cut" —
it's *which subset delivers most of the value at a fraction of the cost?* A well-chosen precondition
can be worth more than an optimisation.

**Where I pushed back and it held:** asked whether 45- or 90-day tiers were needed, the answer was no —
there's no evidence about *when* postings actually go stale, so escalating tiers would be complexity
bought with a guess. One interval, reused. **Don't add resolution you have no data to justify.**

---

## 4. A new requirement that resolved an old gap

**The moment:** Sakshi proposed a per-job feedback button, framed purely as eval material. Separately,
an unresolved gap existed from a prior session: `locked_fields` (which stops an AI re-run overwriting
manual corrections) had to stay in this module while the rest of its table moved elsewhere — with no
decision about where it would actually live.

**What connected them:** a correction *is* a lock. Recording "the AI was wrong, it should say X" and
"don't overwrite my X" as separate mechanisms would mean keeping two things in sync forever.

**What that changed:** one table serves both, and — unplanned — it removed this module's last
dependency on the table being moved, turning an awkward cross-database split into a clean handoff.

**The generalisable bit:** before designing a new thing, check whether it's the same event as
something already in the backlog under a different name. The clue was that both were triggered by the
identical user action at the identical moment.

---

## 5. Trace the consumers before removing the producer

**The moment:** a prior session decided the `recommend` stage should be deferred. Straightforward —
until grepping for who reads its output. `pipeline.ts` was the expected consumer. `lib/telegram.ts`
and `lib/notion.ts` were not: both read `priority` and `recommend_reasons` **to build the alert
message itself.**

**What that changed:** "defer `recommend`" silently meant "notifications lose their priority label and
reason chips." Not a crash — a quiet degradation nobody would have connected to the decision. The
decision was still right; it was just incomplete, and the incompleteness only surfaced from grep.

**The generalisable bit:** a decision to remove something isn't finished until you've listed what
consumes it. The dangerous consumers are the ones in a different subsystem — a change reasoned about
in "the pipeline" broke something in "notifications," which nobody was thinking about at the time.

**Related, same session:** I flagged `company_watchlist.weight` as possibly vestigial. Grep proved it
genuinely used, one file away. **Claiming something is unused requires the search, not the impression
of one.**

---

## 6. Advice given before reading the record

**The moment:** I recommended dropping `profile` and folding its skills into `resume_versions`.
Reading the docs later revealed a parallel session had decided the exact opposite hours earlier —
`resume_versions` dropped, `profile` kept, for reasons neither of us had in view.

**What that changed:** the recommendation was withdrawn. But the deeper issue: two sessions were
editing the same decision log simultaneously, each producing claims that were true when written and
stale within hours. Three separate documents ended up asserting a secret was missing that had already
been set.

**The generalisable bit:** parallel work on shared documents produces *confidently stated stale
facts* — worse than missing information, because they read as verified. The only defence is verifying
against the live artifact (`.env`, the code) rather than the document describing it.

**What we did about it:** corrections were written **in place** on the stale entries rather than added
as new contradicting entries, so the wrong version can't be read without the correction attached.

---

## 7. Same platform, different risk

**The moment:** scraping public LinkedIn job postings had already been accepted, with real research
behind it. So automating alumni/recruiter *people* search looked like the same call.

**It isn't.** Job scraping runs cookieless against public pages. People search requires operating
**inside the logged-in personal account** — which is precisely the risk profile the earlier research
existed to avoid. Same platform, same data-collection verb, entirely different exposure.

**The generalisable bit:** risk lives in the *mechanism*, not the *target*. "We already scrape X" does
not license every method of scraping X. The relevant question was never "is LinkedIn okay?" but "does
this run as me?"

**The asymmetry that settled it:** the downside is a personal LinkedIn account ban. For a job seeker,
that costs vastly more than the manual searching saves. **When the loss is catastrophic and the saving
is convenience, the expected-value calculation isn't close.**

---

## 8. A new feature that contradicts an old principle

**The moment:** fetching salary from AmbitionBox/Glassdoor when a JD omits it. Reasonable-sounding,
and Sakshi pre-empted the honesty objection by proposing it be labelled as externally sourced.

**Why it still failed:** an existing decision (parse salary, never estimate it) exists because a wrong
number erodes trust in *everything else the tool says*. A site's company-level average is an estimate
for a different role at the same company. Labelling fixes transparency, not accuracy.

**The generalisable bit:** when a new feature collides with a standing principle, the question isn't
"can we make this feature acceptable?" but "does the principle still hold?" If it does, the feature
loses — even a well-designed version of it. If it doesn't, revise the principle openly rather than
carving out a quiet exception.

**Third factor that made it easy:** salary had already been demoted to a *bonus* criterion. Low
payoff + ToS exposure + principle conflict. **When three independent reasons point the same way,
stop optimising the proposal.**

---

## 9. When "keep both" is the wrong compromise

**The moment:** should Notion stay as a delivery surface, given the new tracker module is being built
to do exactly what Notion does today?

I recommended **keeping it as a bridge** — the tracker doesn't exist yet, dropping Notion leaves only
Telegram in the interim, and the integration is already written.

Sakshi said drop it.

**Why she was right, and my recommendation's own flaw:** I'd stated the condition myself — the bridge
argument holds *only if the Notion output would actually be used meanwhile*. It wouldn't. Once that's
true, "keep it" isn't a safe middle option; it's an integration to maintain, two secrets to fill, and
two systems with no authoritative one.

**The generalisable bit:** "keep both during the transition" feels like the low-risk choice and often
isn't. It's only low-risk if the old thing is genuinely still being used. Otherwise it's cost with the
*appearance* of safety.

**On my own recommendation:** I attached the disqualifying condition and then recommended the option
anyway. Worth noticing — if you can state the condition that kills your recommendation, check whether
it's already true before recommending.

---

## AI-PM specific: what this session taught about building with LLMs

### Which work actually needs a model
The test that sorted every extraction field: **is there a specific word that, if present, gives you
the answer?**
- *Does this require IIT/IIM?* — yes. Closed, literal, unchanging vocabulary → **regex**. Free,
  instant, can't hallucinate.
- *How technical is this role, 1–5?* — no. There is no word meaning "this is a 4" → **needs the model**.
- *What skills does it mention?* — no, differently. A keyword list finds only what you thought to list,
  missing anything new or rephrased → **open vocabulary, needs the model**.

**The borderline case is the instructive one:** *is this AI-focused?* looks like keyword work, but
false-positives on boilerplate ("we use AI internally" ≠ an AI role). Cheaper but noisier — left on
the model pending real data. **Each field moved off the model is one less thing to pay for and review;
moving the wrong one buys silent accuracy loss for a trivial saving.**

### Judgment that isn't judgment
v1 ranking was going to be an AI call. But once its inputs were four already-extracted fields plus a
threshold, the model was being asked to do **arithmetic** — adding cost, latency, and nondeterminism,
and making a wrong ranking untraceable. It became plain code.

**The generalisable bit:** "this involves judgment" is often true of *extracting* the inputs, not of
*combining* them. Push the model to the edges — extraction and generation — and keep the combining
step deterministic and inspectable.

### What can be backfilled and what can't
Tracing, dashboards, and eval harnesses can all be added later and applied to stored history.
**Human feedback cannot** — a judgment never recorded is gone.

This asymmetry set the whole sequencing: feedback capture ships in v1 (cheap, unrecoverable),
observability waits for v2 (valuable, but recoverable — and there have been *zero runs* to observe).
**Instrumentation ahead of the thing instrumented is not diligence.**

### Feedback format
Binary + a correction box, not a 1–5 scale. Rated scales are hard to answer consistently even against
yourself, and the number doesn't say what to fix. **Binary gives the metric; the correction gives the
labelled example** — and the labelled example is the thing that's actually scarce.

Passive (rate anything, anytime) rather than an annotation queue over a sample — queues exist to fix
coverage bias when volume exceeds what a human can review. At 1–2 items/day there's nothing to
sample. **Match the review mechanism to the volume, not to what mature teams do at scale.**

### LLM-as-judge has a volume precondition
A critic model drawn from the same family tends to share the original's blind spots. Its real value is
**triage** — reducing how much a human must read. With no volume to triage, it adds an AI call to
duplicate a judgment you're making anyway, and your own verdict is the higher-quality signal.

**The generalisable bit:** many AI-eval practices are answers to *scale* problems. Adopting them
pre-scale imports the cost without the benefit — and worse, can substitute a weaker signal for a
stronger one you already had.
