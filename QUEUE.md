# Queue — H2 2026 tracker

Features for `H2-2026.html` (a copy of `Q2-2026.html`; same `progress.md` on the `data` branch).
`Q2-2026.html` stays untouched. ✅ `index.html` opens H2 since #10.
Ordered by priority. Each item is one branch + PR into `main`; merges happen one at a time, in this order.
Flow: the queue is updated here first, an agent builds each item on its branch and opens the PR, and
it is merged once the tests and reviews pass. Done items stay with their PR for reference.

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

## 1. ✅ Movement / muscle grouping — `feat/movement-groups` (done, #5)

- Categories: **big compound** (push: dip, OHP · pull: dumbbell row, pull-up · legs: squat),
  **isolation**, **skill work**, **cardio**. Skill and cardio have no movements yet; the UI shows them
  as empty groups so they're ready when movements are added.
- Program tab grouped by category inside each day (or a clear badge per movement).
- Every movement mapped to primary/secondary muscles for item 3.
- Tests for `movements.js` (every program key has an entry, valid day/category).

## 2. ✅ Today Plan tab — `feat/today-plan` (done, #6; Finish skips unticked movements, #9)

- New **Today Plan** tab: build the day's session by picking movements from the Program tab.
- **Preset** buttons: Push / Pull / Legs fill the plan with that day's movements.
- **Freshness colour** per movement from the last logged date: green = trained recently,
  shading to red when not trained for multiple weeks (e.g. ≤7 d green, 8–14 amber, 15+ red).
- Built plan lists each movement with **suggested warm-ups** (ramp to the top set / working weight)
  and **working sets** from the current working sets. Layout to match the user's screenshot
  (to be supplied).
- **Finish today's workout**: bulk "log & advance" for every movement in the plan, using what was
  ticked, as **one** commit to `progress.md`.

## 3. ✅ Weekly volume per movement pattern — `feat/weekly-muscle-volume` (done, #7)

- Chart tab: working sets per week for each movement pattern (from the session log + `movements.js`),
  as a pattern × week grid with a 4-week average. Logic in `volume.js`.
- Mock-ups compared grouping granularity (push/pull/legs, movement patterns, individual muscles);
  the user picked movement patterns (2026-10-28).

## 4. ✅ Bodyweight log, trend and reminder — `feat/bodyweight` (done, #8)

- Log today's bodyweight (one entry per local day; logging again the same day replaces it). Each log
  or delete is its own commit (`Log bodyweight: 75.2 kg`).
- Stored in progress.md as an optional `## Bodyweight` table (Date | Bodyweight (kg)), owned by
  `progress.js`. Files without it round-trip unchanged, and saves from pages that don't know the
  table (Q2-2026.html) keep its rows.
- Header shows the latest bodyweight; Chart tab gets a Bodyweight card (trend against the 74 kg u74
  limit, entries with change and ✕ delete).
- Reminder banner with a quick-log input when the last entry is older than X days (default 7, 0 = off;
  Settings, per device) or when nothing is logged yet.

### Also done (outside the numbered items)

- ✅ Front page opens the H2 tracker (#10).
- ✅ Face Pull on Day 1 (Pull), its sessions since August backfilled from the Intensity app, and
  `intensity-app-analysis/` (#11).
- ✅ Unilateral Chest Fly on Day 2 (Push); Shoulder Fly capped at 20 reps (+1.25 kg, back to 10) (#12).

## 5. ✅ Today Plan is the primary tab — `feat/today-first` (done, #14)

- The page opens on **Today Plan**: it is the first tab and the one active on load. Program, Chart and
  Settings follow. Deep links / in-page jumps to other tabs keep working.

## 6. ✅ Single-arm or both-arm accessories — `feat/arm-variants` (done, #15)

- For shoulder fly, lat pulldown, bicep curl, dumbbell row, tricep extension and chest fly, adding the
  movement to Today Plan offers **single arm** or **both arms**, with the weight adjustable there.
- Each variant keeps its **own working set and progression** (a single-arm load isn't half a two-arm
  load), with its own session-log name (e.g. `Shoulder Fly (single arm)`) and undo stack. Existing
  log rows stay on the variant they were done as.
- Current variants (what the existing working set and log are): shoulder fly both arms (12.5 kg;
  single arm 6.25 kg), lat pulldown single, curl single, dumbbell row single, tricep extension both,
  chest fly single. The other variant starts from the current reps and sets at a sensible load and is
  adjustable from the plan.
- Program tab, Settings, Notes sync, weekly volume (`movements.js` muscles) and Chart cover both
  variants.

## 7. ✅ Editable progression rules — `feat/progression-rules` (done, #16)

- Settings tab: edit each movement's (and each variant's) **progression rule** instead of the fixed
  text: scheme (**top set + backoff** or **straight sets**), progression (**linear**: +kg on success;
  **double progression**: +1 rep up to a **rep cap**, then +kg and reset to a rep floor), increments,
  sets, backoff % / count, rep targets.
- Rules are kept in `progress.md` (an optional table owned by `progress.js`, like Bodyweight) so every
  device shares them; changing one is a commit. Defaults equal today's hard-coded rules, so files
  without the table behave exactly as now, and saves from pages that don't know it keep its rows.
- `advance()`, the Program/Today cards, warm-ups (`plan.js`), the volume set counter and the Settings
  text all follow the rule instead of per-key code. Builds on item 6.

## 8. Add a new exercise from Settings — `feat/custom-exercises`

- Settings tab: **Add exercise** form. Every field is required before it can be saved:
  - name (also its session-log name; unique, not an existing movement or log name),
  - **day** (push / pull / legs), **type** (big compound / isolation / skill work / cardio),
    **movement pattern** (vertical/horizontal pull and push, squat, hinge, isolation),
  - load kind for warm-ups and display (weighted calisthenics belt, barbell, dumbbell/cable),
  - the **progression rule**: everything the item 7 rule editor has (scheme, progression,
    increments, rep floor/cap, backoff %, reps and sets),
  - the starting working set (weight, reps, sets as the scheme needs).
- Muscles are optional (primary / secondary) so the movement can count for muscles later; the weekly
  volume grid counts it by pattern.
- Stored in `progress.md` as an optional `## Custom movements` table owned by `progress.js` (key,
  name, day, category, pattern, kind, muscles), alongside its working-set row and a rule row. Files
  without it round-trip unchanged, and saves from pages that don't know it keep its rows (as
  Bodyweight and Progression rules do). Adding one is a single commit (`Add exercise: <name>`).
- A custom movement behaves like a built-in one everywhere: Program day and category group, Today
  Plan picker, presets, freshness, Log / Finish / undo, Settings rule editing, Chart volume line,
  weekly pattern grid, Notes sync.
- Custom movements can be edited (details and rule) and **retired** (hidden from the program, history
  kept), not hard-deleted while they have log rows.
