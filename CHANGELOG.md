# Changelog

## Unreleased

- H2 tracker: log your bodyweight (Chart tab or the reminder banner; the header shows the latest); one entry per day, kept
  in a new Bodyweight table in `progress.md`. The Chart tab plots the trend against the 74 kg class
  limit, and a banner reminds you when it hasn't been logged for 7 days (change it in Settings).
- H2 tracker: **Finish today's workout** skips planned movements with nothing ticked. They aren't
  logged, so their load and "last trained" colour stay as they were, and they drop out of the plan.
  If nothing at all is ticked, Finish says so and logs nothing. Ticking only warm-ups still logs the
  movement (as a hold).
- H2 tracker: the Chart tab opens with a weekly volume grid, working sets per week for each movement
  pattern (vertical/horizontal pull and push, squat, hinge, isolation) with a 4-week average, so
  undertrained patterns stand out. Retired skill work still counts.
- H2 tracker: each day on the Program tab is grouped into Big compound, Isolation, Skill work and Cardio
  (the last two empty for now). The grouping and each movement's muscles live in `movements.js`.
- New `H2-2026.html` page (copy of the Q2 tracker, same progress data) for the H2 features in `QUEUE.md`.
- H2 tracker: new **Today Plan** tab. Build the day's session from Push / Pull / Legs presets (the day
  trained longest ago is marked suggested) or by tapping movements, each coloured by how long since it
  was logged (green within a week, amber 1–2 weeks, red longer or never). Each movement shows one row
  of sets, warm-ups first then working sets, to tick off, with Add Sets for bonus backoff sets, a
  progress line, and its recent history and records. **Finish today's workout** logs and advances
  every planned movement in one commit.
- The tracker keeps `progress.md` on a separate `data` branch and commits logs there, never to `main`,
  so a device token can't change the site's code and logging no longer triggers a Pages build.
  Devices switch over on their own (the Branch setting is gone); `main` is protected by a ruleset.
- Q2 2026 tracker keeps progress in `progress.md` instead of browser storage; every log is a git
  commit. Existing progress (153 sessions) migrated from Chrome.
- The tracker is serverless and hosted on GitHub Pages: it reads and commits `progress.md` through the
  GitHub API with a per-device token (Settings → GitHub sync), so it works from a phone. `server.py` is gone.
- Removed `jumpcut-editor.html`.
- Undo (✕ in the session log) now puts back the exact working set from before that log, saved in a
  new Before column in `progress.md`, instead of replaying the whole history from the starting loads
  (which landed on wrong loads, e.g. 137.5 kg instead of 107.5 kg). Dumbbell Row and Inverted Row
  share one undo. Rows logged before this change can't be undone from the page.
