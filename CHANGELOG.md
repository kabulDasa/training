# Changelog

## Unreleased

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
