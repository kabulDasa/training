// Tests for movements.js (run: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../movements.js');

/* the program's STATE keys, read from DEFAULT_STATE in the page so a new movement can't be left out */
function pageKeys(){
  const html = fs.readFileSync(path.join(__dirname, '..', 'H2-2026.html'), 'utf8');
  const block = html.match(/const DEFAULT_STATE = \{([\s\S]*?)\n\};/)[1];
  return [...block.matchAll(/^\s*([a-z][a-z0-9]*)\s*:/gm)].map(m => m[1]);
}

/* cardio has no working set, so it isn't one of the page's program keys */
const current = () => Object.keys(M.MOVEMENTS).filter(k => !M.MOVEMENTS[k].retired && !M.isCardio(k));
const pageHtml = () => fs.readFileSync(path.join(__dirname, '..', 'H2-2026.html'), 'utf8');
/* {key: value} pairs of a `const NAME = {...};` object of key:'string' or key:fn entries in the page */
function pageMap(name){
  const block = pageHtml().match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`))[1];
  return Object.fromEntries([...block.matchAll(/([a-z][a-z0-9]*)\s*:\s*('[^']*'|[A-Za-z]+)/g)].map(m => [m[1], m[2].replace(/'/g, '')]));
}

test('every program movement has an entry, and only retired ones are extra', () => {
  assert.deepEqual(current().sort(), pageKeys().sort());
});

test('retired movements are the July-August skill work', () => {
  const retired = Object.keys(M.MOVEMENTS).filter(k => M.MOVEMENTS[k].retired);
  assert.deepEqual(retired, ['muscleup', 'frontlever', 'kneeraise']);
  for(const k of retired) assert.equal(M.MOVEMENTS[k].category, 'skill', k);
});

test('every exercise name in the session log maps to a movement', () => {
  for(const [name, key] of Object.entries(M.EXERCISE_KEY)) assert.ok(key in M.MOVEMENTS, name);
  for(const key of Object.keys(M.MOVEMENTS)) assert.ok(Object.values(M.EXERCISE_KEY).includes(key), key);
  const log = fs.readFileSync(path.join(__dirname, 'fixtures', 'progress.md'), 'utf8').split('## Session log')[1];
  const names = [...log.matchAll(/^\| [^|]+ \| ([^|]+?) \|/gm)].map(m => m[1]).filter(n => n !== 'Exercise' && !/^-+$/.test(n));
  assert.ok(names.length);
  for(const n of names) assert.ok(n in M.EXERCISE_KEY, n);
});

test("the page's EXERCISE_KEY agrees with movements.js", () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'H2-2026.html'), 'utf8');
  const block = html.match(/const EXERCISE_KEY = \{([\s\S]*?)\n\};/)[1];
  const pairs = [...block.matchAll(/'([^']+)':'([a-z0-9]+)'/g)];
  assert.ok(pairs.length);
  for(const [, name, key] of pairs) assert.equal(M.EXERCISE_KEY[name], key, name);
});

test('every Program card key is a movement (one card per movement, not per arm variant)', () => {
  const block = pageHtml().match(/const CARD = \{([\s\S]*?)\n\};/)[1];
  const keys = [...block.matchAll(/^\s*([a-z][a-z0-9]*)\s*:\s*\{badge/gm)].map(m => m[1]);
  assert.deepEqual(keys.sort(), current().filter(k => !M.MOVEMENTS[k].variantOf).sort());
});

test("the page records every working set, under a log name that maps back to its key", () => {
  /* RECORD covers every key with a progression rule */
  assert.match(pageHtml(), /const RECORD = Object\.fromEntries\(Object\.keys\(Rules\.DEFAULT_RULES\)/);
  assert.deepEqual(Object.keys(require('../rules.js').DEFAULT_RULES).sort(), pageKeys().sort());
  const names = pageMap('HISTORY_NAME');
  assert.deepEqual(Object.keys(names).sort(), pageKeys().sort());
  for(const [key, name] of Object.entries(names)) assert.equal(M.EXERCISE_KEY[name], key, name);
});

const VARIANTS = {
  invertedrow: 'invertedrowboth', latpulldown: 'latpulldownboth', bicepcurl: 'bicepcurlboth',
  shoulderfly: 'shoulderflysingle', chestfly: 'chestflyboth', tricepext: 'tricepextsingle',
  frontsquat: 'frontsquatsingle',
};

test('six accessories and the front squat have a single and a both variant', () => {
  assert.deepEqual(Object.keys(M.ARM_VARIANTS).sort(), Object.keys(VARIANTS).sort());
  /* the variant that existed first keeps its key: shoulder fly and tricep extension are both arms */
  for(const base of ['shoulderfly', 'tricepext', 'frontsquat']) assert.equal(M.ARM_VARIANTS[base].both, base);
  for(const base of ['invertedrow', 'latpulldown', 'bicepcurl', 'chestfly']) assert.equal(M.ARM_VARIANTS[base].single, base);
  for(const [base, key] of Object.entries(VARIANTS)){
    const b = M.MOVEMENTS[base], v = M.MOVEMENTS[key];
    assert.equal(v.variantOf, base, key);
    assert.notEqual(v.arms, b.arms, key);
    assert.deepEqual(M.ARM_VARIANTS[base], {[b.arms]: base, [v.arms]: key});
    for(const f of ['day', 'category', 'pattern']) assert.equal(v[f], b[f], `${key}.${f}`);
    assert.deepEqual(v.muscles, b.muscles, key);
    if(base !== 'frontsquat') assert.match(v.name, new RegExp(`\\(${M.ARMS[v.arms]}\\)$`), key);
    assert.equal(M.familyName(key), M.familyName(base), key);
  }
  assert.equal(M.familyName('shoulderflysingle'), 'Shoulder Fly');
  assert.equal(M.familyName('pullup'), 'Weighted Pull-Up');
});

test('the front squat\'s single-leg variant is the lunge / split squat, labelled in legs', () => {
  const v = M.MOVEMENTS.frontsquatsingle;
  assert.equal(v.name, 'Lunge / Split Squat');
  assert.equal(M.EXERCISE_KEY['Lunge / Split Squat'], 'frontsquatsingle');
  assert.equal(M.EXERCISE_KEY['Front Squat'], 'frontsquat');
  assert.equal(M.familyName('frontsquatsingle'), 'Front Squat');
  assert.equal(M.variantName('frontsquatsingle'), 'Lunge / Split Squat');
  assert.equal(M.variantName('frontsquat'), 'Front Squat');
  assert.equal(M.limbLabel('frontsquatsingle'), 'single leg');
  assert.equal(M.limbLabel('frontsquat'), 'both legs');
  /* the arm movements keep their labels */
  assert.equal(M.limbLabel('shoulderflysingle'), 'single arm');
  assert.equal(M.limbLabel('tricepext'), 'both arms');
  assert.equal(M.variantName('shoulderflysingle'), 'Shoulder Fly');
  assert.deepEqual(M.limbLabels('chestfly'), M.ARMS);
});

test('baseOf, variantsOf and siblingOf', () => {
  assert.equal(M.baseOf('shoulderflysingle'), 'shoulderfly');
  assert.equal(M.baseOf('shoulderfly'), 'shoulderfly');
  assert.equal(M.baseOf('pullup'), 'pullup');
  assert.equal(M.baseOf(null), null);
  assert.deepEqual(M.variantsOf('chestflyboth'), {single: 'chestfly', both: 'chestflyboth'});
  assert.equal(M.variantsOf('dip'), null);
  assert.equal(M.siblingOf('shoulderfly'), 'shoulderflysingle');
  assert.equal(M.siblingOf('shoulderflysingle'), 'shoulderfly');
  assert.equal(M.siblingOf('squat'), null);
});

test('old log names stay on the variant they were done as; new variants get their own names', () => {
  assert.equal(M.EXERCISE_KEY['Shoulder Fly'], 'shoulderfly');
  assert.equal(M.EXERCISE_KEY['Lat Pulldown'], 'latpulldown');
  assert.equal(M.EXERCISE_KEY['Dumbbell Row'], 'invertedrow');
  assert.equal(M.EXERCISE_KEY['Shoulder Fly (single arm)'], 'shoulderflysingle');
  assert.equal(M.EXERCISE_KEY['Tricep Extension (single arm)'], 'tricepextsingle');
  assert.equal(M.EXERCISE_KEY['Dumbbell Row (both arms)'], 'invertedrowboth');
});

test('variant keys fit the progress.md key format', () => {
  for(const key of Object.keys(M.MOVEMENTS)) assert.match(key, /^[a-z][a-z0-9]*$/);
});

test('valid day, category, pattern, name and muscle weights', () => {
  for(const [key, m] of Object.entries(M.MOVEMENTS)){
    if(M.isCardio(key)) continue;
    assert.ok(m.name, key);
    assert.ok(m.day in M.DAYS, `${key} day ${m.day}`);
    assert.ok(m.category in M.CATEGORIES, `${key} category ${m.category}`);
    assert.ok(m.pattern in M.PATTERNS, `${key} pattern ${m.pattern}`);
    const muscles = Object.entries(m.muscles);
    assert.ok(muscles.length, `${key} has no muscles`);
    for(const [muscle, w] of muscles){
      assert.ok(muscle in M.MUSCLES, `${key} muscle ${muscle}`);
      assert.ok(w === 1 || w === 0.5, `${key} ${muscle} weight ${w}`);
    }
    assert.ok(muscles.some(([, w]) => w === 1), `${key} has no primary muscle`);
  }
});

test('big compounds are dip and OHP, dumbbell row and pull-up, squat', () => {
  assert.deepEqual(M.movementsFor('push', 'compound'), ['dip', 'ohp']);
  assert.deepEqual(M.movementsFor('pull', 'compound'), ['pullup', 'invertedrow']);
  assert.deepEqual(M.movementsFor('legs', 'compound'), ['squat']);
});

test('skill work and cardio have no current movements', () => {
  for(const day of Object.keys(M.DAYS)){
    assert.deepEqual(M.movementsFor(day, 'skill'), []);
    assert.deepEqual(M.movementsFor(day, 'cardio'), []);
  }
});

test('movementsFor without a category lists the whole day', () => {
  assert.deepEqual(M.movementsFor('legs'), ['squat', 'frontsquat']);
});

test('movementsFor lists a movement with arm variants once, by its base key', () => {
  assert.deepEqual(M.movementsFor('pull'), ['pullup', 'invertedrow', 'latpulldown', 'bicepcurl', 'facepull']);
  assert.deepEqual(M.movementsFor('push'), ['dip', 'ohp', 'shoulderfly', 'chestfly', 'tricepext']);
});

test('movement patterns', () => {
  const byPattern = p => Object.keys(M.MOVEMENTS).filter(k => M.MOVEMENTS[k].pattern === p);
  assert.deepEqual(byPattern('vertical_pull'), ['pullup', 'latpulldown', 'muscleup', 'latpulldownboth']);
  assert.deepEqual(byPattern('horizontal_pull'), ['invertedrow', 'frontlever', 'invertedrowboth']);
  assert.deepEqual(byPattern('vertical_push'), ['dip', 'ohp']);
  assert.deepEqual(byPattern('squat'), ['squat', 'frontsquat', 'frontsquatsingle']);
  assert.deepEqual(byPattern('isolation'), ['bicepcurl', 'facepull', 'shoulderfly', 'chestfly', 'tricepext', 'kneeraise',
    'bicepcurlboth', 'shoulderflysingle', 'chestflyboth', 'tricepextsingle']);
});

test('cardio is one movement on no day, in the cardio category', () => {
  const m = M.MOVEMENTS.cardio;
  assert.equal(m.category, 'cardio');
  assert.equal(M.EXERCISE_KEY.Cardio, 'cardio');
  assert.equal(m.pattern, null);
  for(const day of Object.keys(M.DAYS)) assert.ok(!M.movementsFor(day).includes('cardio'), day);
  assert.ok(M.namesTaken().has('cardio'));
  assert.equal(M.customKey('Cardio'), 'cardio2');
});
