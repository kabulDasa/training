# Changelog

## Unreleased

- H2 tracker: the **Session Log** on the Chart tab is hidden until you press Expand; Hide collapses it again.
- Dips and Chest Fly now count as horizontal push in the weekly volume grid, including past weeks.
- H2 tracker: **chart labels pick the lines**. On the Top Set and Volume charts every line shows at first; tap a label to show only that line, tap more to add theirs, and **Reset view** brings them all back. Each line has its own label, including the dashed variants, and movements with nothing logged no longer get one.
- Every single arm or single leg movement now adds 1.25 kg on progression instead of 2.5 kg (Dumbbell Row, Bicep Curl, Tricep Extension and Lunge / Split Squat changed).
- H2 tracker: **unilateral option for Front Squat**. Front Squat gets a Both legs / Single leg switch on
  Program and Today Plan. Single leg is **Lunge / Split Squat**, with its own working set, progression,
  log name and undo; sets and reps are per leg. It starts at half the current front squat load, 10 reps,
  2 sets, with the front squat's rule (editable in Settings). Existing Front Squat logs stay on both legs.
- H2 tracker: **cardio in Today Plan**. Pick Cardio from its own group in the picker (all cardio is one
  movement; no day preset adds it). Its card takes distance (km), time (mm:ss or h:mm:ss) and an
  optional note for the type (run, bike, elliptical…), with the last session one tap away (Same as last), and shows the
  pace. Finish logs it as one session-log row like `5 km in 27:30 (5:30/km) · run` when distance and
  time are filled in, skips it when both are empty, and stops with a message on a half-filled card.
  It has no working set or progression, doesn't count in the weekly set grid, and its latest row can
  be undone from the log. The Chart tab gets a Cardio card with weekly distance and time. Add exercise
  no longer offers the Cardio type, and the Program tab no longer shows an empty Cardio group per day.

- H2 tracker: **add your own exercises** from Settings (Your exercises → Add exercise). The form
  needs the name (also its session-log name, which can't match an existing movement or log name),
  the **day** (push / pull / legs), **type** (big compound / isolation / skill work / cardio),
  **movement pattern**, **load kind** (belt, barbell, dumbbell/cable: sets the warm-ups and how the
  load is shown), the whole **progression rule** (scheme, progression, increments, rep floor/cap,
  backoff) and the starting working set; it lists what is still missing and can't be saved until
  everything is valid. Muscles are optional. An added exercise works like the program's own: Program
  day and type group, Today Plan picker and presets, freshness, Log / Finish / undo, rule editing in
  Lift Settings, its own line on the volume chart, the weekly pattern grid and Sync to Notes.
  **Edit** changes its details, rule and working set (the name only until it is first logged),
  **Retire** takes it off the program but keeps its log and stats (**Restore** brings it back), and
  **Delete** works only while it has no logged sessions. Each add, edit, retire or delete is one
  commit to progress.md, which gets an optional `## Custom movements` table; files without it are
  unchanged, and Q2-2026.html and older cached pages keep the table when they save.

- H2 tracker: **progression rules are editable** in Settings, per movement and per arm variant. Edit a
  row to pick the scheme (**top set + backoff** or **straight sets**), the progression (**linear**:
  +kg on success, with a bigger jump for beating the backoff target; **double progression**: +1 rep
  up to a **rep cap**, then +kg and back to a **rep floor**), the increments, backoff %, reps, target
  and most sets, and the working set's reps and sets. Save and **Reset to default** are each a commit
  to progress.md, so every device follows the same rules; rules equal to the program's defaults
  aren't stored, and progress.md without the new optional `## Progression rules` table behaves as
  before. Program and Today Plan cards, the outcome badge, warm-up checklist, Finish, header, Sync to
  Notes and the weekly volume grid all follow the rule. Q2-2026.html and older cached pages keep the
  table when they save.
- H2 tracker: OHP logs now record their load and volume like the other lifts, and Front Squat logs
  its prescribed sets (like the accessories) instead of only the ticked ones.

- H2 tracker: lat pulldown, dumbbell row, bicep curl, shoulder fly, chest fly and tricep extension
  can each be done **single arm** or **both arms**. Pick it on the movement's Program card or Today
  Plan card (the pick is remembered on this device). Each variant has its own working set,
  progression, undo and session-log name (e.g. `Shoulder Fly (single arm)`); existing log rows stay
  on the variant they were done as. A variant never logged starts from the other one's reps and sets
  at about half (single arm) or double (both arms) the load; shoulder fly single arm starts at 6.25 kg.
- H2 tracker: a Today Plan card for those movements has a **Weight** box for today's load. Logging
  makes it that variant's new working weight (undo puts the old one back). Settings, Sync to Notes,
  the weekly volume grid and the volume chart (dashed line = the other variant) cover both variants.
- H2 tracker: the page now opens on **Today Plan**, the first tab; Program, Chart and Settings
  follow it.
- H2 tracker: **Unilateral Chest Fly** joins Day 2 (Push) as an isolation movement, starting at
  5 kg × 8 × 2 sets: +1 rep per session up to 20, then +1.25 kg and back to 8 reps. It has its own
  volume line on the Chart tab.
- H2 tracker: Shoulder Fly now caps at 20 reps; past that a successful session adds 1.25 kg and
  resets to 10 reps.
- H2 tracker: **Face Pull** joins Day 1 (Pull) as an isolation movement (2 sets, +1 rep per session
  up to 20, then +1.25 kg and back to 10 reps), with its own volume line on the Chart tab. Its
  sessions since August, from the Intensity app, are in the session log.
- New `intensity-app-analysis/` folder: a script that lists the exercises in an Intensity app export
  that are trained most but aren't in the program, and its first report.
- The site's front page now opens the H2 2026 tracker instead of Q2.
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
