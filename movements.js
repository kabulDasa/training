/* Movement grouping for H2-2026.html: which day each movement belongs to, its category, and the
   muscles it trains. Keys are the STATE / progress.md keys. muscles holds the sets credited to each
   muscle per working set (1 = primary, 0.5 = secondary), which the weekly volume chart sums.
   Big compounds are the main barbell/bodyweight lifts; the remaining accessories count as
   isolation. pattern is the movement pattern (single-joint work is 'isolation'). Muscle keys are
   individual muscles so the volume chart can group them any way. The skill movements are retired:
   they are only in the July-August session log, have no working set and don't show on the Program
   tab, which shows skill work and cardio as empty groups for now. EXERCISE_KEY maps the exercise
   names used in the session log to keys.
   Arm variants: six accessories can be done single arm or both arms. Each variant is its own movement
   (own working set, progression, session-log name and undo stack). The entry that existed first keeps
   its key and log name; the other variant is a sibling key with variantOf = that key, so movementsFor()
   lists the movement once and the page picks the variant (ARM_VARIANTS). arms says which variant an
   entry is. Loaded as a plain <script> in the page and with require() in the node tests. */
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
  invertedrow: {name: 'Dumbbell Row (single arm)', day: 'pull', category: 'compound', pattern: 'horizontal_pull',
                muscles: {lats: 1, traps: 0.5, rear_delts: 0.5, biceps: 0.5}, arms: 'single'},
  latpulldown: {name: 'Lat Pulldown (single arm)', day: 'pull', category: 'isolation', pattern: 'vertical_pull',
                muscles: {lats: 1, biceps: 0.5}, arms: 'single'},
  bicepcurl:   {name: 'Bicep Curl (single arm)', day: 'pull', category: 'isolation', pattern: 'isolation',
                muscles: {biceps: 1}, arms: 'single'},
  facepull:    {name: 'Face Pull',               day: 'pull', category: 'isolation', pattern: 'isolation',
                muscles: {rear_delts: 1, traps: 0.5}},
  /* the dip presses down along the torso with the body near upright, so it counts as a vertical
     push here, though it loads the chest more than the OHP does */
  dip:         {name: 'Weighted Dip',            day: 'push', category: 'compound',  pattern: 'vertical_push',
                muscles: {chest: 1, triceps: 1, front_delts: 0.5}},
  ohp:         {name: 'Overhead Press',          day: 'push', category: 'compound',  pattern: 'vertical_push',
                muscles: {front_delts: 1, triceps: 0.5, side_delts: 0.5}},
  shoulderfly: {name: 'Shoulder Fly (both arms)', day: 'push', category: 'isolation', pattern: 'isolation',
                muscles: {side_delts: 1}, arms: 'both'},
  chestfly:    {name: 'Chest Fly (single arm)',  day: 'push', category: 'isolation', pattern: 'isolation',
                muscles: {chest: 1, front_delts: 0.5}, arms: 'single'},
  tricepext:   {name: 'Tricep Extension (both arms)', day: 'push', category: 'isolation', pattern: 'isolation',
                muscles: {triceps: 1}, arms: 'both'},
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

/* the other arm variant of each two-variant accessory: same day, category, pattern and muscles as
   the movement it varies (a set with one arm per side counts like a set with both) */
const ARMS = {single: 'single arm', both: 'both arms'};
const VARIANT_NAMES = {
  invertedrowboth:   'Dumbbell Row (both arms)',
  latpulldownboth:   'Lat Pulldown (both arms)',
  bicepcurlboth:     'Bicep Curl (both arms)',
  shoulderflysingle: 'Shoulder Fly (single arm)',
  chestflyboth:      'Chest Fly (both arms)',
  tricepextsingle:   'Tricep Extension (single arm)',
};
for(const [key, name] of Object.entries(VARIANT_NAMES)){
  const base = key.replace(/(single|both)$/, '');
  const b = MOVEMENTS[base];
  MOVEMENTS[key] = {name, day: b.day, category: b.category, pattern: b.pattern, muscles: {...b.muscles},
    arms: b.arms === 'single' ? 'both' : 'single', variantOf: base};
}

/* base key -> {single: key, both: key} for every movement with arm variants */
const ARM_VARIANTS = {};
for(const [key, m] of Object.entries(MOVEMENTS))
  if(m.variantOf) ARM_VARIANTS[m.variantOf] = {[m.arms]: key, [MOVEMENTS[m.variantOf].arms]: m.variantOf};

/* the movement a key is a variant of (itself for anything else); null for null */
function baseOf(key){
  if(key == null) return null;
  return MOVEMENTS[key] && MOVEMENTS[key].variantOf || key;
}
/* {single, both} keys of the movement key belongs to, or null when it has no arm variants */
function variantsOf(key){ return ARM_VARIANTS[baseOf(key)] || null; }
/* the other arm variant of key, or null */
function siblingOf(key){
  const v = variantsOf(key);
  return v ? (v.single === key ? v.both : v.single) : null;
}

/* a movement's name without its arm variant, e.g. 'Shoulder Fly' for both shoulder fly keys */
function familyName(key){ return MOVEMENTS[key].name.replace(/ \((single arm|both arms)\)$/, ''); }

/* session-log exercise name -> key; Dumbbell Row replaced Inverted Row and shares its key. The arm
   variants that existed first keep their plain names, so their log rows didn't move. */
const EXERCISE_KEY = {
  'Pull-up': 'pullup', 'Lat Pulldown': 'latpulldown', 'Inverted Row': 'invertedrow', 'Dumbbell Row': 'invertedrow',
  'Bicep Curl': 'bicepcurl', 'Face Pull': 'facepull', 'Dip': 'dip', 'OHP': 'ohp', 'Shoulder Fly': 'shoulderfly', 'Chest Fly': 'chestfly', 'Tricep Extension': 'tricepext',
  'Squat': 'squat', 'Front Squat': 'frontsquat',
  'Dumbbell Row (both arms)': 'invertedrowboth', 'Lat Pulldown (both arms)': 'latpulldownboth', 'Bicep Curl (both arms)': 'bicepcurlboth',
  'Shoulder Fly (single arm)': 'shoulderflysingle', 'Chest Fly (both arms)': 'chestflyboth', 'Tricep Extension (single arm)': 'tricepextsingle',
  'Muscle-up': 'muscleup', 'Tuck Front Lever': 'frontlever', 'Hanging Knee Raise': 'kneeraise',
};

/* keys of the current (not retired) movements in one day, optionally one category, in MOVEMENTS order.
   A movement with arm variants is listed once, by its base key. */
function movementsFor(day, category){
  return Object.keys(MOVEMENTS).filter(k => !MOVEMENTS[k].retired && !MOVEMENTS[k].variantOf &&
    MOVEMENTS[k].day === day && (category == null || MOVEMENTS[k].category === category));
}

const api = {DAYS, CATEGORIES, PATTERNS, MUSCLES, MOVEMENTS, EXERCISE_KEY, ARMS, ARM_VARIANTS, movementsFor, baseOf, variantsOf, siblingOf, familyName};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Movements = api;
})(typeof window !== 'undefined' ? window : globalThis);
