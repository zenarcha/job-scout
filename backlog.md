# Backlog — Remote Job Tracker → Application OS

Architecture is **frozen** (see D-28). Non-essential ideas land here instead of changing the design.
Promote an item only when evidence from real usage justifies it, or it's scheduled by the roadmap.

## Scheduled by roadmap (not "someday" — sequenced)
- **P2** Qualification stage (structured signals + `opportunity_score`, overridable→locked) +
  deterministic Lane Engine (config rules, single `active_goal`) + time-based `urgency` + views.
- **P3** Chrome Extension ingestion source (AI-free, POSTs `RawPosting`) + manual import; wire the
  `inbox` status + `enrichPending` skip for inbox jobs.
- **P4** Analyze Resume Builder + Startup Outreach codebases → design & create `application_assets`
  schema → extract capabilities one at a time (resume → referral → founder outreach → cover letter →
  portfolio artifact).
- **P5** Rename to Application OS.

## Candidate improvements (need evidence before adopting)
- **Multiple weighted goals** in the Lane Engine (only if one active goal proves too limiting). — D-25
- **`hiring_probability` / `company_quality` / `startup_stage`** as additional qualification signals.
- **Source-level outcome analytics** (interview rate by source) once real applications accrue. — D-22
- **Promote hot JSON fields to first-class columns** — decide from the verification report's data-
  quality findings (which `parsed`/`signals` keys are queried/filtered most).
- **External salary dataset** to enrich `salary_status=unknown` roles (still never LLM-estimated). — D-12
- **Semantic search** (pgvector + free Gemini embeddings) — "find jobs like this / like my experience."
- **Referral CRM** — only if lightweight `job_tracking` referral fields prove insufficient.
- **RLS + dashboard auth hardening** at dashboard build (Phase 7).

## Known follow-ups / tech debt
- Verify Apify actor field mappings against a real run (LinkedIn/Indeed field names vary).
- Verify seed watchlist `ats_type`/`ats_slug` guesses before Phase 4 ATS polling.
- Golden-dataset test harness (20–30 JDs) — build alongside Phase 2 so lane/qualification changes are
  regression-tested.
