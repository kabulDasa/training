# training

Streetlifting / powerlifting training notes and the Q2 2026 program tracker.

## Q2 2026 tracker

**https://kabuldasa.github.io/training/** (GitHub Pages, served from `main`)

`Q2-2026.html` is the program page: current working sets, tap-to-log backoff sets, progression,
charts and a session log. Progress lives in **`progress.md`** (plain Markdown tables) on the
**`data` branch** of this repo, not on `main`. The page reads it and commits every log, undo or reset
to `data` through the GitHub API, so it works the same from any device and every change is in the git
history (`Log Squat: 3 reps top @ 107.5 kg, …`). Logging never touches `main`, so it doesn't change
the site's code or trigger a Pages build.

### Getting the data

```bash
git fetch origin data
git show origin/data:progress.md      # current file
git log --oneline origin/data         # one commit per log
```

### Set up a device (once)

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new):
   repository access **Only select repositories → kabulDasa/training**, permission
   **Contents: Read and write**, nothing else. Pick an expiry you're happy to renew.
2. Open the tracker → **Settings → GitHub sync**, paste the token, **Save & reload**.

The token stays in that browser's storage on that device; it is never committed. Without one the
page is read-only. Note that every GitHub Pages site under `kabuldasa.github.io` shares that browser
storage, so only put pages you trust there. Revoke a lost device's token on GitHub.

A fine-grained token can't be limited to one branch, so `main` has a repository ruleset (pull request
required, no force pushes or deletion) that stops the token, or anything else, from writing the
site's code directly. Code changes land on `main` through pull requests only.

### Editing progress.md by hand

Work on the `data` branch, in its own worktree so your `main` checkout stays put:

```bash
git fetch origin data
git worktree add ../training-data data
```

Edit `progress.md` there, commit, `git push origin data`. Next time, `git pull` in that worktree first.
A page that was open will refuse to save over the newer file and reload. Never merge `data` into `main`.

## Other files

- `AGENTS.md`: training-coach instructions for AI agents
- `powerlifting_summary.md`, `streetlifting.md`: athlete profile and reference notes
- `streetlifting_tests.feature`: acceptance scenarios for the program pages
- `Q2-2026.md`: original program notes
- `Q2-2026-alt.html`, `streetlifting_program.html`: older pages (static)

## Known issues

- Undo (✕ in the session log) recomputes the working set by replaying that exercise's whole log
  from the program's starting loads. Logs from before the current defaults (July–Oct 2026) can make
  it land on the wrong load. Check the Settings tab after undoing; `git revert` the commit on `data`
  if wrong.

## Development

No build step. Test locally with any static server, e.g. `python3 -m http.server 5210`
(the page still talks to the real GitHub repo).

```bash
node --test   # progress.md format + GitHub store tests (no network; checks origin/data if fetched)
```
