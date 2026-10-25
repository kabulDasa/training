# training

Streetlifting / powerlifting training notes and the Q2 2026 program tracker.

## Q2 2026 tracker

**https://kabuldasa.github.io/training/** (GitHub Pages, served from `main`)

`Q2-2026.html` is the program page: current working sets, tap-to-log backoff sets, progression,
charts and a session log. Progress lives in **`progress.md`** (plain Markdown tables) in this repo.
The page reads it and commits every log, undo or reset straight to `main` through the GitHub API,
so it works the same from any device and every change is in the git history
(`Log Squat: 3 reps top @ 107.5 kg, …`).

### Set up a device (once)

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new):
   repository access **Only select repositories → kabulDasa/training**, permission
   **Contents: Read and write**, nothing else. Pick an expiry you're happy to renew.
2. Open the tracker → **Settings → GitHub sync**, paste the token, **Save & reload**.

The token stays in that browser's storage on that device; it is never committed. Without one the
page is read-only. Note that every GitHub Pages site under `kabuldasa.github.io` shares that browser
storage, so only put pages you trust there. Revoke a lost device's token on GitHub.

### Editing progress.md by hand

`git pull`, edit the tables, commit, push. A page that was open will refuse to save over the newer
file and reload.

Each Session log row's **Before** cell is the working set that log replaced (`107.5 kg`,
`12.5 kg, 18 reps, 2 sets`); undo (✕ on an exercise's newest row) puts it back. Rows logged before
that column existed have none, so their ✕ is dimmed and only explains: to undo one, delete the row
and set the load under Current working sets by hand.

## Other files

- `AGENTS.md`: training-coach instructions for AI agents
- `powerlifting_summary.md`, `streetlifting.md`: athlete profile and reference notes
- `streetlifting_tests.feature`: acceptance scenarios for the program pages
- `Q2-2026.md`: original program notes
- `Q2-2026-alt.html`, `streetlifting_program.html`: older pages (static)

## Development

No build step. Test locally with any static server, e.g. `python3 -m http.server 5210`
(the page still talks to the real GitHub repo).

```bash
node --test   # progress.md format + GitHub store tests (no network)
```
