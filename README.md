# training

Streetlifting / powerlifting training notes and the Q2 2026 program tracker.

## Q2 2026 tracker

`Q2-2026.html` is the program page: current working sets, tap-to-log backoff sets, progression,
charts and a session log. Progress lives in **`progress.md`** (plain Markdown tables), not in the
browser, so it's readable, hand-editable and versioned.

```bash
python3 server.py            # serves http://127.0.0.1:5200/ and opens it in a new tab
python3 server.py --no-open  # just serve
```

Python 3.9+. If 5200 is taken it tries 5201–5209; a second launch just reopens the running one.

No dependencies beyond Python 3. Every log, undo or reset rewrites `progress.md` and makes a git
commit (`Log Squat: 3 reps top @ 107.5 kg, …`); if the branch has an upstream it's pushed too.
Commits only happen on `main`; on any other branch the file is saved but not committed.

The server binds to localhost only. Opening `Q2-2026.html` straight from Finder won't work: it
needs the server to read and write `progress.md`.

### Editing progress.md by hand

Close the page (or reload it afterwards), edit the tables, commit. The page refuses to save over a
file that changed since it loaded and asks you to reload.

## Other files

- `AGENTS.md`: training-coach instructions for AI agents
- `powerlifting_summary.md`, `streetlifting.md`: athlete profile and reference notes
- `streetlifting_tests.feature`: acceptance scenarios for the program pages
- `Q2-2026.md`: original program notes
- `Q2-2026-alt.html`, `streetlifting_program.html`, `jumpcut-editor.html`: older or side pages (static)
- `Q1-Q2_2026 SBS.xlsx`, `Copy of Instructions.pdf`: source program material

## Known issues

- Undo (✕ in the session log) recomputes the working set by replaying that exercise's whole log
  from the program's starting loads. Logs from before the current defaults (July–Oct 2026) can make
  it land on the wrong load. Check the Settings tab after undoing; `git revert` the commit if wrong.

## Tests

```bash
python3 -m unittest
```
