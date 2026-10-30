/* Movement grouping for H2-2026.html: which day each movement belongs to, its category, and the
   muscles it trains. Keys are the STATE / progress.md keys. muscles holds the sets credited to each
   muscle per working set (1 = primary, 0.5 = secondary), which the weekly volume chart sums.
   Big compounds are the main barbell/bodyweight lifts; the remaining accessories count as
   isolation. pattern is the movement pattern (single-joint work is 'isolation'). Muscle keys are
   individual muscles so the volume chart can group them any way. The skill movements are retired:
   they are only in the July-August session log, have no working set and don't show on the Program
   tab, which shows skill work as an empty group for now. EXERCISE_KEY maps the exercise names used
   in the session log to keys.
   Cardio: one movement for all cardio, logged as distance and time with the activity as a note
   (plan.js). It isn't on any day (so movementsFor() of a day, the presets and Settings skip it) and
   has no pattern, muscles, working set, rule or load kind; the Today Plan picker lists it on its own.
   Arm variants: six accessories can be done single arm or both arms. Each variant is its own movement
   (own working set, progression, session-log name and undo stack). The entry that existed first keeps
   its key and log name; the other variant is a sibling key with variantOf = that key, so movementsFor()
   lists the movement once and the page picks the variant (ARM_VARIANTS). arms says which variant an
   entry is.
   Custom movements: exercises added from the H2 Settings tab live in progress.md's Custom movements
   table (progress.js). setCustom(list) registers them at load (and again after every add / edit /
   retire): each becomes a MOVEMENTS entry with custom: true and its load kind (plan.js warm-ups), and
   its name maps to its key in EXERCISE_KEY, so movementsFor(), baseOf() and the weekly volume pick it
   up. A retired custom movement keeps its key and log name (history and stats stay) but is not
   listed by movementsFor(). Loaded as a plain <script> in the page and with require() in the node
   tests. */
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
  cardio:      {name: 'Cardio',                  day: 'cardio', category: 'cardio',  pattern: null, muscles: {}},
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

/* a movement's name without its arm variant, e.g. 'Shoulder Fly' for both shoulder fly keys (a
   custom movement's name is shown as it was typed) */
function familyName(key){
  const m = MOVEMENTS[key];
  return m.custom ? m.name : m.name.replace(/ \((single arm|both arms)\)$/, '');
}

/* session-log exercise name -> key; Dumbbell Row replaced Inverted Row and shares its key. The arm
   variants that existed first keep their plain names, so their log rows didn't move. */
const EXERCISE_KEY = {
  'Pull-up': 'pullup', 'Lat Pulldown': 'latpulldown', 'Inverted Row': 'invertedrow', 'Dumbbell Row': 'invertedrow',
  'Bicep Curl': 'bicepcurl', 'Face Pull': 'facepull', 'Dip': 'dip', 'OHP': 'ohp', 'Shoulder Fly': 'shoulderfly', 'Chest Fly': 'chestfly', 'Tricep Extension': 'tricepext',
  'Squat': 'squat', 'Front Squat': 'frontsquat',
  'Dumbbell Row (both arms)': 'invertedrowboth', 'Lat Pulldown (both arms)': 'latpulldownboth', 'Bicep Curl (both arms)': 'bicepcurlboth',
  'Shoulder Fly (single arm)': 'shoulderflysingle', 'Chest Fly (both arms)': 'chestflyboth', 'Tricep Extension (single arm)': 'tricepextsingle',
  'Muscle-up': 'muscleup', 'Tuck Front Lever': 'frontlever', 'Hanging Knee Raise': 'kneeraise',
  'Cardio': 'cardio',
};
/* the distance-and-time movement, which has no working set or rule */
function isCardio(key){ return key === 'cardio'; }

/* keys of the current (not retired) movements in one day, optionally one category, in MOVEMENTS order.
   A movement with arm variants is listed once, by its base key. */
function movementsFor(day, category){
  return Object.keys(MOVEMENTS).filter(k => !MOVEMENTS[k].retired && !MOVEMENTS[k].variantOf &&
    MOVEMENTS[k].day === day && (category == null || MOVEMENTS[k].category === category));
}

/* ---------- custom movements ---------- */
/* load kinds a custom movement can have (plan.js KIND values; the competition squat ladder is the squat's own) */
const KINDS = {belt: 'Weighted calisthenics (belt)', barbell: 'Barbell', accessory: 'Dumbbell / cable'};
const KEY_RE = /^[a-z][a-z0-9]*$/;
const KEY_MAX = 24, NAME_MAX = 40;
const BUILTIN_KEYS = new Set(Object.keys(MOVEMENTS));
const BUILTIN_NAMES = new Set(Object.keys(EXERCISE_KEY));

function isCustom(key){ return !!(key != null && MOVEMENTS[key] && MOVEMENTS[key].custom); }
function customKeys(){ return Object.keys(MOVEMENTS).filter(isCustom); }
/* a typed name as stored: trimmed, inner whitespace collapsed */
function cleanName(name){ return String(name == null ? '' : name).replace(/\s+/g, ' ').trim(); }
/* every name a new movement can't use, lower-cased: built-in movement and log names, registered
   custom movements' names (except exceptKey's own) and any extra names (e.g. the session log's) */
function namesTaken(extra, exceptKey){
  const out = new Set();
  for(const n of BUILTIN_NAMES) out.add(n.toLowerCase());
  for(const [k, m] of Object.entries(MOVEMENTS)) if(k !== exceptKey) out.add(m.name.toLowerCase());
  for(const n of extra || []) out.add(cleanName(n).toLowerCase());
  return out;
}
/* a progress.md key for a new movement named name: its letters and digits, lower case, starting
   with a letter, at most 24 characters, with 2, 3, … added when the key is taken (a movement's key,
   or one of taken: keys in the working sets or rules, which a retired or deleted movement may hold) */
function customKey(name, taken){
  const busy = new Set([...Object.keys(MOVEMENTS), ...(taken || [])]);
  let stem = cleanName(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  if(!/^[a-z]/.test(stem)) stem = 'ex' + stem;
  stem = stem.slice(0, KEY_MAX);
  if(!busy.has(stem)) return stem;
  for(let i = 2; ; i++){
    const suffix = String(i);
    const key = stem.slice(0, KEY_MAX - suffix.length) + suffix;
    if(!busy.has(key)) return key;
  }
}
/* what is wrong with a custom movement's details, one message per field ([] when it can be
   registered). takenNames is namesTaken() for it. */
function customProblems(c, takenNames){
  const out = [];
  if(!c || typeof c !== 'object') return ['not a movement'];
  const name = cleanName(c.name);
  if(!name) out.push('name is missing');
  else if(name.length > NAME_MAX) out.push(`name must be at most ${NAME_MAX} characters`);
  else if(/[\u0000-\u001f|]/.test(name)) out.push('name can\'t contain | or control characters');
  else if(takenNames && takenNames.has(name.toLowerCase())) out.push(`name "${name}" is already used by another movement or log`);
  if(!Object.hasOwn(DAYS, c.day)) out.push('day is missing');
  if(!Object.hasOwn(CATEGORIES, c.category)) out.push('type is missing');
  if(!Object.hasOwn(PATTERNS, c.pattern)) out.push('movement pattern is missing');
  if(!Object.hasOwn(KINDS, c.kind)) out.push('load kind is missing');
  if(c.muscles != null && (typeof c.muscles !== 'object' ||
     Object.entries(c.muscles).some(([m, w]) => !Object.hasOwn(MUSCLES, m) || (w !== 1 && w !== 0.5))))
    out.push('muscles must be known muscles, each primary (1) or secondary (0.5)');
  return out;
}

/* register the custom movements (progress.md's Custom movements table, as a list of
   {key, name, day, category, pattern, kind, muscles, retired}), replacing any registered before.
   -> {errors: {key: message}}: an entry that clashes with a built-in or earlier movement (key or
   name) or has bad details is skipped, so a hand edit can't break the page. */
function setCustom(list){
  for(const key of customKeys()) delete MOVEMENTS[key];
  for(const [name, key] of Object.entries(EXERCISE_KEY)) if(!BUILTIN_KEYS.has(key)) delete EXERCISE_KEY[name];
  const errors = {};
  for(const c of list || []){
    const key = c && c.key;
    if(typeof key !== 'string' || !KEY_RE.test(key)){ errors[String(key)] = 'bad key'; continue; }
    if(Object.hasOwn(MOVEMENTS, key)){ errors[key] = 'key already used by another movement'; continue; }
    const problems = customProblems(c, namesTaken());
    if(problems.length){ errors[key] = problems[0]; continue; }
    const name = cleanName(c.name);
    MOVEMENTS[key] = {name, day: c.day, category: c.category, pattern: c.pattern, kind: c.kind,
      muscles: {...(c.muscles || {})}, custom: true, ...(c.retired ? {retired: true} : {})};
    EXERCISE_KEY[name] = key;
  }
  return {errors};
}

const api = {DAYS, CATEGORIES, PATTERNS, MUSCLES, MOVEMENTS, EXERCISE_KEY, ARMS, ARM_VARIANTS, KINDS,
  movementsFor, baseOf, variantsOf, siblingOf, familyName, isCardio,
  isCustom, customKeys, cleanName, namesTaken, customKey, customProblems, setCustom};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Movements = api;
})(typeof window !== 'undefined' ? window : globalThis);
