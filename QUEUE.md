# Queue — H2 2026 tracker

Features for `H2-2026.html` (a copy of `Q2-2026.html`; same `progress.md` on the `data` branch).
`Q2-2026.html` stays untouched and `index.html` keeps pointing at it until H2 is ready.
Ordered by priority. Each item is one branch + PR into `main`; merges happen one at a time, in this order.

## Shared contract: `movements.js`

Items 1–3 all read the movement grouping, so it lives in one module, `movements.js` (plain script
that also works under `node --test`, like `progress.js`). Item 1 owns it; items 2 and 3 code against
this shape and rebase once item 1 is merged.

```js
// window.Movements (require() in node): {DAYS, CATEGORIES, PATTERNS, MUSCLES, MOVEMENTS, EXERCISE_KEY, movementsFor(day, category?)}
// key = the STATE / exercise key used by progress.md (pullup, dip, ohp, squat, …)
MOVEMENTS = {
  pullup: { name: 'Weighted Pull-Up', day: 'pull', category: 'compound', pattern: 'vertical_pull',
            muscles: { lats: 1, biceps: 0.5, rear_delts: 0.5 } },
  // …
}
// day:      'push' | 'pull' | 'legs'
// category: 'compound' | 'isolation' | 'skill' | 'cardio'
// pattern:  'vertical_pull' | 'horizontal_pull' | 'vertical_push' | 'horizontal_push' | 'squat' | 'hinge' | 'isolation'
// muscles:  sets credited per working set (1 = primary, 0.5 = secondary); individual muscles (MUSCLES keys:
//           lats, traps, rear_delts, biceps, core, chest, front_delts, side_delts, triceps,
//           quads, glutes, adductors, hamstrings, erectors)
// retired:  true on movements only in the old log (muscleup, frontlever, kneeraise; category 'skill');
//           movementsFor() skips them. EXERCISE_KEY maps session-log exercise names to keys.
```

## 1. Movement / muscle grouping — `feat/movement-groups`

- Categories: **big compound** (push: dip, OHP · pull: dumbbell row, pull-up · legs: squat),
  **isolation**, **skill work**, **cardio**. Skill and cardio have no movements yet; the UI shows them
  as empty groups so they're ready when movements are added.
- Program tab grouped by category inside each day (or a clear badge per movement).
- Every movement mapped to primary/secondary muscles for item 3.
- Tests for `movements.js` (every program key has an entry, valid day/category).

## 2. Today Plan tab — `feat/today-plan`

- New **Today Plan** tab: build the day's session by picking movements from the Program tab.
- **Preset** buttons: Push / Pull / Legs fill the plan with that day's movements.
- **Freshness colour** per movement from the last logged date: green = trained recently,
  shading to red when not trained for multiple weeks (e.g. ≤7 d green, 8–14 amber, 15+ red).
- Built plan lists each movement with **suggested warm-ups** (ramp to the top set / working weight)
  and **working sets** from the current working sets. Layout to match the user's screenshot
  (to be supplied).
- **Finish today's workout**: bulk "log & advance" for every movement in the plan, using what was
  ticked, as **one** commit to `progress.md`.

## 3. Weekly volume per movement pattern — `feat/weekly-muscle-volume`

- Chart tab: working sets per week for each movement pattern (from the session log + `movements.js`),
  as a pattern × week grid with a 4-week average. Logic in `volume.js`.
- Mock-ups compared grouping granularity (push/pull/legs, movement patterns, individual muscles);
  the user picked movement patterns (2026-10-28).
