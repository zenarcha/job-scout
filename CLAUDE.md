# Process rule: decisions vs. setup docs

`decisions.md` is the only authoritative record of choices made for this project. Setup/how-to docs
(e.g. `apify/task-config.md`, `docs/NOTION_SETUP.md`) describe *how* to configure something already
decided — they must never be the place a real choice is made for the first time.

Before writing any of the following into code, config, or a setup doc as if it were settled, either
log it in `decisions.md` (same format as existing entries: reasoning + alternatives considered) or
raise it to Sakshi and get a call:

- **Polling/scheduling cadence** for any external trigger (e.g. Apify Schedule intervals, poller
  frequency).
- **Vendor or specific actor/library selection** where alternatives exist and switching later has
  real cost.
- **Anything with cost implications** — paid tiers, quota usage, rate limits chosen.
- **Anything with legal/ToS exposure** — scraping targets, result caps, compliance posture.

If a reasonable default must be picked just to keep a build moving, mark it inline as unreviewed
(e.g. `<!-- UNREVIEWED DEFAULT: needs Sakshi sign-off -->`) rather than presenting it with the same
confidence as an approved decision. This came from a real gap: `apify/task-config.md` was written by
a prior session with cadence, actor choice, and ToS posture stated as settled facts — none of them
had actually been decided or reviewed (see `decisions.md` D-30).
