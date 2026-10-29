/* Movement grouping for H2-2026.html: which day each movement belongs to, its category, and the
   muscles it trains. Keys are the STATE / progress.md keys. muscles holds the sets credited to each
   muscle per working set (1 = primary, 0.5 = secondary), which the weekly volume chart sums.
   Big compounds are the main barbell/bodyweight lifts; the remaining accessories count as
   isolation. pattern is the movement pattern (single-joint work is 'isolation'). Muscle keys are
   individual muscles so the volume chart can group them any way. The skill movements are retired:
   they are only in the July-August session log, have no working set and don't show on the Program
   tab, which shows skill work and cardio as empty groups for now. EXERCISE_KEY maps the exercise
   names used in the session log to keys. Loaded as a plain <script> in the page and with require() in the node tests. */
(function(root){
'use strict';

const DAYS = {pull: 'Pull', push: 'Push', legs: 'Legs'};
const CATEGORIES = {compound: 'Big compound', isolation: 'Isolation', skill: 'Skill work', cardio: 'Cardio'};
const PATTERNS = {
  vertical_pull: 'Vertical pull', horizontal_pull: 'Horizontal pull',
  vertical_push: 'Vertical push', horizontal_push: 'Horizontal push',
  squat: 'Squat', hinge: 'Hinge', isolation: 'Isolation',
};
const MUSCLES = {
  lats: 'Lats', traps: 'Traps', rear_delts: 'Rear delts', biceps: 'Biceps', core: 'Core',
  chest: 'Chest', front_delts: 'Front delts', side_delts: 'Side delts', triceps: 'Triceps',
  quads: 'Quads', glutes: 'Glutes', adductors: 'Adductors', hamstrings: 'Hamstrings', erectors: 'Erectors',
};

/* within a day, movements are listed in this order */
const MOVEMENTS = {
  pullup:      {name: 'Weighted Pull-Up',        day: 'pull', category: 'compound',  pattern: 'vertical_pull',
                muscles: {lats: 1, biceps: 0.5, rear_delts: 0.5}},
  invertedrow: {name: 'Dumbbell Row',            day: 'pull', category: 'compound',  pattern: 'horizontal_pull',
                muscles: {lats: 1, traps: 0.5, rear_delts: 0.5, biceps: 0.5}},
  latpulldown: {name: 'Single-Arm Lat Pulldown', day: 'pull', category: 'isolation', pattern: 'vertical_pull',
                muscles: {lats: 1, biceps: 0.5}},
  bicepcurl:   {name: 'Bicep Curl',              day: 'pull', category: 'isolation', pattern: 'isolation',
                muscles: {biceps: 1}},
  facepull:    {name: 'Face Pull',               day: 'pull', category: 'isolation', pattern: 'isolation',
                muscles: {rear_delts: 1, traps: 0.5}},
  /* the dip presses down along the torso with the body near upright, so it counts as a vertical
     push here, though it loads the chest more than the OHP does */
  dip:         {name: 'Weighted Dip',            day: 'push', category: 'compound',  pattern: 'vertical_push',
                muscles: {chest: 1, triceps: 1, front_delts: 0.5}},
  ohp:         {name: 'Overhead Press',          day: 'push', category: 'compound',  pattern: 'vertical_push',
                muscles: {front_delts: 1, triceps: 0.5, side_delts: 0.5}},
  shoulderfly: {name: 'Shoulder Fly',            day: 'push', category: 'isolation', pattern: 'isolation',
                muscles: {side_delts: 1}},
  tricepext:   {name: 'Tricep Extension',        day: 'push', category: 'isolation', pattern: 'isolation',
                muscles: {triceps: 1}},
  squat:       {name: 'Competition Squat',       day: 'legs', category: 'compound',  pattern: 'squat',
                muscles: {quads: 1, glutes: 0.5, adductors: 0.5}},
  frontsquat:  {name: 'Front Squat',             day: 'legs', category: 'isolation', pattern: 'squat',
                muscles: {quads: 1, glutes: 0.5}},
  muscleup:    {name: 'Muscle-Up',               day: 'pull', category: 'skill',     pattern: 'vertical_pull',
                muscles: {lats: 1, triceps: 0.5, chest: 0.5}, retired: true},
  frontlever:  {name: 'Tuck Front Lever',        day: 'pull', category: 'skill',     pattern: 'horizontal_pull',
                muscles: {lats: 1, core: 1}, retired: true},
  kneeraise:   {name: 'Hanging Knee Raise',      day: 'pull', category: 'skill',     pattern: 'isolation',
                muscles: {core: 1}, retired: true},
};

/* session-log exercise name -> key; Dumbbell Row replaced Inverted Row and shares its key */
const EXERCISE_KEY = {
  'Pull-up': 'pullup', 'Lat Pulldown': 'latpulldown', 'Inverted Row': 'invertedrow', 'Dumbbell Row': 'invertedrow',
  'Bicep Curl': 'bicepcurl', 'Face Pull': 'facepull', 'Dip': 'dip', 'OHP': 'ohp', 'Shoulder Fly': 'shoulderfly', 'Tricep Extension': 'tricepext',
  'Squat': 'squat', 'Front Squat': 'frontsquat',
  'Muscle-up': 'muscleup', 'Tuck Front Lever': 'frontlever', 'Hanging Knee Raise': 'kneeraise',
};

/* keys of the current (not retired) movements in one day, optionally one category, in MOVEMENTS order */
function movementsFor(day, category){
  return Object.keys(MOVEMENTS).filter(k => !MOVEMENTS[k].retired &&
    MOVEMENTS[k].day === day && (category == null || MOVEMENTS[k].category === category));
}

const api = {DAYS, CATEGORIES, PATTERNS, MUSCLES, MOVEMENTS, EXERCISE_KEY, movementsFor};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Movements = api;
})(typeof window !== 'undefined' ? window : globalThis);
