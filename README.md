# training: data branch

This branch holds only `progress.md`, the Q2 2026 tracker's progress. The tracker
(https://kabuldasa.github.io/training/) reads it and commits every log, undo or reset here through the
GitHub API. The site's code lives on `main`, which the page never writes to. Don't merge this branch
into `main`.

Fetch it with `git fetch origin data`; read it with `git show origin/data:progress.md`.
