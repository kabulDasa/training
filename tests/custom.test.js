// Tests for exercises added from the H2 Settings tab (custom movements) across progress.js,
// movements.js, rules.js, plan.js and volume.js (run: node --test). Registration is module state,
// so these live in their own file (node --test runs each file in its own process).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../progress.js');
const M = require('../movements.js');
const R = require('../rules.js');
const Plan = require('../plan.js');
const V = require('../volume.js');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'progress.md'), 'utf8');

const CRUNCH = {key: 'cablecrunch', name: 'Cable Crunch', day: 'push', category: 'isolation', pattern: 'isolation',
  kind: 'accessory', muscles: {core: 1}, retired: false};
const RDL = {key: 'romaniandeadlift', name: 'Romanian Deadlift', day: 'legs', category: 'compound', pattern: 'hinge',
  kind: 'barbell', muscles: {hamstrings: 1, glutes: 0.5, erectors: 0.5}, retired: false};
const OLD = {key: 'sissysquat', name: 'Sissy Squat', day: 'legs', category: 'isolation', pattern: 'squat',
  kind: 'accessory', muscles: {}, retired: true};
const CRUNCH_RULE = R.normalize({scheme: 'straight', progression: 'double', inc: 2.5, repFloor: 10, repCap: 15});
const RDL_RULE = R.normalize({scheme: 'topset', progression: 'linear', inc: 2.5, bonusInc: 5,
  backoffPct: 85, backoffReps: 6, backoffSets: 2, backoffMax: 4, backoffRound: 2.5});

const BASE = {
  state: {pullup: {weight: 25, reps: 3}, cablecrunch: {weight: 20, reps: 10, sets: 3}, romaniandeadlift: {weight: 100, reps: 5}},
  history: [
    {date: '2026-10-28T12:00:00.000Z', exercise: 'Romanian Deadlift', result: '5 reps top @ 100 kg, 2×6 backoff @ 85 kg',
     outcome: 'normal', weight: 100, volume: 1020, before: {weight: 100, reps: 5}},
  ],
};
const WITH = {...BASE, rules: {cablecrunch: CRUNCH_RULE, romaniandeadlift: RDL_RULE}, custom: [CRUNCH, RDL, OLD]};

/* ---------- progress.md table ---------- */
test('custom movements round-trip as their own table after Progression rules', () => {
  const text = P.serialize(WITH);
  assert.match(text, /## Progression rules[\s\S]*\n## Custom movements\n\n\| Key \| Name \| Day \| Type \| Pattern \| Load \| Muscles \| Retired \|\n\|---\|---\|---\|---\|---\|---\|---\|---\|\n/);
  assert.match(text, /\| cablecrunch \| Cable Crunch \| push \| isolation \| isolation \| accessory \| core 1 \|  \|\n/);
  assert.match(text, /\| romaniandeadlift \| Romanian Deadlift \| legs \| compound \| hinge \| barbell \| hamstrings 1, glutes 0\.5, erectors 0\.5 \|  \|\n/);
  assert.match(text, /\| sissysquat \| Sissy Squat \| legs \| isolation \| squat \| accessory \|  \| yes \|\n$/);
  assert.deepEqual(P.parse(text), WITH);
  P.validate(P.parse(text));
  assert.equal(P.serialize(P.parse(text)), text);
});

test('files without a Custom movements section load without one and are written unchanged', () => {
  const text = P.serialize(BASE);
  assert.doesNotMatch(text, /Custom movements/);
  assert.equal(P.parse(text).custom, undefined);
  assert.equal(P.serialize({...BASE, custom: []}), text);
  assert.equal(P.serialize(P.parse(FIXTURE)), FIXTURE);
});

test('hand-edited custom movement words are read case-insensitively; names keep their case and escapes', () => {
  const text = P.serialize(WITH).replace('| push | isolation | isolation | accessory |', '| Push | Isolation | ISOLATION | Accessory |')
    .replace('| yes |', '| Yes |');
  const data = P.parse(text);
  assert.deepEqual(data.custom, WITH.custom);
  const odd = {...BASE, custom: [{...CRUNCH, name: 'Crunch \\ odd'}]};
  assert.deepEqual(P.parse(P.serialize(odd)).custom, odd.custom);
});

test('bad custom movements rejected', () => {
  const text = P.serialize(WITH);
  assert.throws(() => P.parse(text.replace('| cablecrunch | Cable', '| Cable Crunch | Cable')), /custom movement key/);
  assert.throws(() => P.parse(text.replace('| core 1 |', '| core lots |')), /finite/);
  assert.throws(() => P.parse(text.replace('| core 1 |', '| core |')), /bad muscles/);
  assert.throws(() => P.parse(text.replace('| yes |', '| retired |')), /Retired must be yes or blank/);
  assert.throws(() => P.validate(P.parse(text.replace('| legs | compound | hinge |', '| arms | compound | hinge |'))), /romaniandeadlift\.day/);
  for (const bad of [
    {...BASE, custom: {}},
    {...BASE, custom: [null]},
    {...BASE, custom: [{...CRUNCH, key: 'Cable'}]},
    {...BASE, custom: [CRUNCH, CRUNCH]},
    {...BASE, custom: [{...CRUNCH, name: ''}]},
    {...BASE, custom: [{...CRUNCH, name: 'two\nlines'}]},
    {...BASE, custom: [{...CRUNCH, category: 'big'}]},
    {...BASE, custom: [{...CRUNCH, pattern: 'carry'}]},
    {...BASE, custom: [{...CRUNCH, kind: 'squat'}]},
    {...BASE, custom: [{...CRUNCH, muscles: null}]},
    {...BASE, custom: [{...CRUNCH, muscles: {core: 2}}]},
    {...BASE, custom: [{...CRUNCH, muscles: {'Core': 1}}]},
    {...BASE, custom: [{...CRUNCH, retired: 'no'}]},
    {...BASE, custom: [{...CRUNCH, bogus: 1}]},
  ]) assert.throws(() => P.validate(bad), undefined, JSON.stringify(bad));
});

function fakeGitHub(text) {
  const gh = {text, sha: 's1', calls: []};
  gh.fetch = async (url, opts = {}) => {
    gh.calls.push({url, opts});
    if (opts.method === 'PUT') {
      const body = JSON.parse(opts.body);
      if (body.sha !== gh.sha) return {ok: false, status: 409, json: async () => ({message: 'is at x but expected y'})};
      gh.text = P.b64decode(body.content);
      gh.sha = gh.sha + 'x';
      return {ok: true, status: 200, json: async () => ({content: {sha: gh.sha}})};
    }
    return {ok: true, status: 200, json: async () => ({type: 'file', encoding: 'base64', content: P.b64encode(gh.text), sha: gh.sha})};
  };
  return gh;
}

test('a save without a custom key keeps the table it loaded (older pages); an explicit list wins', async () => {
  const gh = fakeGitHub(P.serialize(WITH));
  const cfg = {owner: 'custom', repo: 'keep', branch: 'data', path: 'progress.md', token: 't'};
  const {sha} = await P.makeStore(cfg, gh.fetch).load();
  // Q2-2026.html or an older H2 page: knows none of the optional tables
  const sha2 = await P.makeStore(cfg, gh.fetch).save({state: BASE.state, history: BASE.history}, sha, 'Log Squat');
  assert.deepEqual(P.parse(gh.text).custom, WITH.custom);
  assert.deepEqual(P.parse(gh.text).rules, WITH.rules);
  // H2 deleting the last added exercise drops the table
  await P.makeStore(cfg, gh.fetch).save({...WITH, custom: []}, sha2, 'Delete exercise: Cable Crunch');
  assert.equal(P.parse(gh.text).custom, undefined);
  assert.doesNotMatch(gh.text, /Custom movements/);
});

test("progress.js's custom movement words are movements.js's", () => {
  const words = Object.fromEntries(P.CUSTOM_COLUMNS.map(([f, , w]) => [f, w]));
  assert.deepEqual(words.day.sort(), Object.keys(M.DAYS).sort());
  assert.deepEqual(words.category.sort(), Object.keys(M.CATEGORIES).sort());
  assert.deepEqual(words.pattern.sort(), Object.keys(M.PATTERNS).sort());
  assert.deepEqual(words.kind.sort(), Object.keys(M.KINDS).sort());
  for (const kind of Object.keys(M.KINDS)) assert.ok(Object.values(Plan.KIND).includes(kind), kind);
});

/* ---------- keys and names ---------- */
test('customKey: letters and digits of the name, unique, fits the progress.md key format', () => {
  assert.equal(M.customKey('Cable Crunch'), 'cablecrunch');
  assert.equal(M.customKey('  Romanian   Deadlift (RDL) '), 'romaniandeadliftrdl');
  assert.equal(M.customKey('Café Press'), 'cafepress');
  assert.equal(M.customKey('45° Back Extension'), 'ex45backextension');
  assert.equal(M.customKey('!!!'), 'ex');
  // taken by a movement (built-in or retired), or by a key in the file
  assert.equal(M.customKey('Pull Up'), 'pullup2');
  assert.equal(M.customKey('Muscle Up'), 'muscleup2');
  assert.equal(M.customKey('Shoulder Fly Single'), 'shoulderflysingle2');
  assert.equal(M.customKey('Cable Crunch', ['cablecrunch', 'cablecrunch2']), 'cablecrunch3');
  const long = 'Single Leg Romanian Deadlift On A Box';
  assert.equal(M.customKey(long), 'singlelegromaniandeadlif');
  assert.equal(M.customKey(long, ['singlelegromaniandeadlif']), 'singlelegromaniandeadli2');
  for (const k of ['cablecrunch', 'ex45backextension', 'singlelegromaniandeadli2']) assert.match(k, /^[a-z][a-z0-9]*$/);
});

test('customProblems lists every missing or bad detail', () => {
  assert.deepEqual(M.customProblems({name: '', muscles: {}}, M.namesTaken()),
    ['name is missing', 'day is missing', 'type is missing', 'movement pattern is missing', 'load kind is missing']);
  assert.deepEqual(M.customProblems(CRUNCH, M.namesTaken()), []);
  const taken = M.namesTaken(['Mystery Lift']);
  for (const name of ['Weighted Pull-Up', 'pull-up', 'Shoulder Fly (single arm)', 'Muscle-up', 'OHP', 'mystery lift'])
    assert.match(M.customProblems({...CRUNCH, name}, taken)[0], /already used/, name);
  assert.match(M.customProblems({...CRUNCH, name: 'x'.repeat(41)})[0], /at most 40/);
  assert.match(M.customProblems({...CRUNCH, name: 'a | b'})[0], /can't contain/);
  assert.match(M.customProblems({...CRUNCH, muscles: {abs: 1}})[0], /known muscles/);
  assert.match(M.customProblems({...CRUNCH, muscles: {core: 0.3}})[0], /known muscles/);
});

/* ---------- registration ---------- */
test('setCustom registers added exercises everywhere movements.js is read, and replaces earlier ones', () => {
  try {
    assert.deepEqual(M.setCustom([CRUNCH, RDL, OLD]).errors, {});
    assert.deepEqual(M.customKeys(), ['cablecrunch', 'romaniandeadlift', 'sissysquat']);
    assert.ok(M.isCustom('cablecrunch'));
    assert.ok(!M.isCustom('pullup'));
    assert.equal(M.MOVEMENTS.cablecrunch.kind, 'accessory');
    assert.equal(M.EXERCISE_KEY['Cable Crunch'], 'cablecrunch');
    assert.equal(M.EXERCISE_KEY['Sissy Squat'], 'sissysquat');  // retired: its log still maps
    assert.equal(M.baseOf('cablecrunch'), 'cablecrunch');
    assert.equal(M.variantsOf('cablecrunch'), null);
    assert.equal(M.familyName('cablecrunch'), 'Cable Crunch');
    // after the program's movements in their day and category; retired ones aren't listed
    assert.deepEqual(M.movementsFor('push'), ['dip', 'ohp', 'shoulderfly', 'chestfly', 'tricepext', 'cablecrunch']);
    assert.deepEqual(M.movementsFor('legs', 'compound'), ['squat', 'romaniandeadlift']);
    assert.deepEqual(M.movementsFor('legs', 'isolation'), ['frontsquat']);
    // re-registering (an edit / retire / delete) replaces the earlier set, built-ins untouched
    M.setCustom([{...CRUNCH, name: 'Cable Crunch Kneeling', retired: true}]);
    assert.deepEqual(M.customKeys(), ['cablecrunch']);
    assert.equal(M.EXERCISE_KEY['Cable Crunch'], undefined);
    assert.equal(M.EXERCISE_KEY['Cable Crunch Kneeling'], 'cablecrunch');
    assert.equal(M.MOVEMENTS.romaniandeadlift, undefined);
    assert.deepEqual(M.movementsFor('push'), ['dip', 'ohp', 'shoulderfly', 'chestfly', 'tricepext']);
    assert.equal(M.EXERCISE_KEY['Shoulder Fly'], 'shoulderfly');
  } finally { M.setCustom([]); }
  assert.deepEqual(M.customKeys(), []);
});

test('setCustom skips entries that clash or are bad, and says why', () => {
  try {
    const {errors} = M.setCustom([
      {...CRUNCH, key: 'pullup'},                       // a built-in key
      {...CRUNCH, key: 'crunchb', name: 'Face Pull'},   // a built-in log name
      CRUNCH,
      {...CRUNCH, key: 'crunchc'},                      // the same name again
      {...CRUNCH, key: 'crunchd', name: 'Other', day: 'arms'},
    ]);
    assert.deepEqual(Object.keys(errors).sort(), ['crunchb', 'crunchc', 'crunchd', 'pullup']);
    assert.match(errors.pullup, /key already used/);
    assert.match(errors.crunchb, /already used/);
    assert.match(errors.crunchc, /already used/);
    assert.match(errors.crunchd, /day/);
    assert.deepEqual(M.customKeys(), ['cablecrunch']);
    assert.equal(M.MOVEMENTS.pullup.name, 'Weighted Pull-Up');
    assert.equal(M.EXERCISE_KEY['Face Pull'], 'facepull');
  } finally { M.setCustom([]); }
});

/* ---------- rules, plan and volume ---------- */
test('effective rules cover added exercises: the stored rule, or a stand-in with a reason', () => {
  try {
    M.setCustom([CRUNCH, RDL]);
    const {rules, errors} = R.effective({cablecrunch: CRUNCH_RULE, romaniandeadlift: {...RDL_RULE, backoffPct: 0}, gone: CRUNCH_RULE});
    assert.deepEqual(rules.cablecrunch, CRUNCH_RULE);
    assert.deepEqual(rules.romaniandeadlift, R.CUSTOM_FALLBACK);
    assert.match(errors.romaniandeadlift, /backoff %/);
    assert.match(errors.gone, /no such movement/);
    assert.equal(errors.cablecrunch, undefined);
    assert.equal(R.isDefault('cablecrunch', CRUNCH_RULE), false);  // always stored
    const none = R.effective({});
    assert.match(none.errors.cablecrunch, /no progression rule stored/);
    assert.deepEqual(none.rules.pullup, R.DEFAULT_RULES.pullup);
  } finally { M.setCustom([]); }
  assert.equal(R.effective({}).rules.cablecrunch, undefined);
});

test('problems lists every issue of a half-filled rule', () => {
  assert.deepEqual(R.problems({}), [
    'scheme must be top set + backoff or straight sets', 'progression must be linear or double progression',
    'increment must be more than 0 and at most 50 kg']);
  assert.deepEqual(R.problems({scheme: 'topset', progression: 'double', inc: 2.5}).length, 7);
  assert.deepEqual(R.problems(RDL_RULE), []);
  assert.equal(R.problem(RDL_RULE), null);
});

test('an added exercise goes through warm-ups, working sets, advance and the result text', () => {
  try {
    M.setCustom([CRUNCH, RDL, {...CRUNCH, key: 'ringdip', name: 'Ring Dip', kind: 'belt', category: 'compound', pattern: 'vertical_push'}]);
    assert.equal(Plan.kindOf('romaniandeadlift'), 'barbell');
    assert.equal(Plan.kindOf('pullup'), 'belt');
    assert.equal(Plan.kindOf('nothing'), null);
    // top set + backoff on a barbell hinge
    const rdl = {weight: 100, reps: 5};
    assert.deepEqual(Plan.warmups('romaniandeadlift', rdl).map(w => w.load), [20, 50, 70, 85]);
    const ws = Plan.workingSets('romaniandeadlift', rdl, RDL_RULE);
    assert.deepEqual(ws.top, {load: 100, reps: 5});
    assert.equal(ws.sets.length, 4);
    assert.equal(ws.target, 2);
    assert.equal(ws.sets[0].load, 85);
    assert.equal(Plan.resultText('romaniandeadlift', rdl, RDL_RULE, 3), '5 reps top @ 100 kg, 3×6 backoff @ 85 kg');
    const next = {...rdl};
    R.advance(RDL_RULE, R.outcomeFromCount(3, ws.target), next);
    assert.deepEqual(next, {weight: 105, reps: 5});
    // straight-set double progression on a cable isolation
    const cc = {weight: 20, reps: 15, sets: 3};
    assert.deepEqual(Plan.warmups('cablecrunch', cc), [{load: 10, reps: 10}]);
    assert.equal(Plan.resultText('cablecrunch', cc, CRUNCH_RULE, 3), '3 × 15 @ 20 kg');
    R.advance(CRUNCH_RULE, 'normal', cc);
    assert.deepEqual(cc, {weight: 22.5, reps: 10, sets: 3});
    // a belt exercise shows added weight
    assert.ok(Plan.isAdded('ringdip'));
    assert.equal(Plan.resultText('ringdip', {weight: 10, reps: 8, sets: 3}, CRUNCH_RULE, 3), '3 × 8 @ +10 kg');
  } finally { M.setCustom([]); }
});

test('weekly volume counts an added exercise to its pattern, retired or not, and skips it once deleted', () => {
  const history = [
    {date: '2026-10-27T12:00:00.000Z', exercise: 'Romanian Deadlift', result: '5 reps top @ 100 kg, 3×6 backoff @ 85 kg'},
    {date: '2026-10-27T12:10:00.000Z', exercise: 'Cable Crunch', result: '3 × 15 @ 20 kg'},
    {date: '2026-10-27T12:20:00.000Z', exercise: 'Squat', result: '3 reps top @ 110 kg, 2×5 backoff @ 87.5 kg'},
  ];
  const now = new Date('2026-10-28T12:00:00Z');
  try {
    M.setCustom([CRUNCH, {...RDL, retired: true}]);
    const {weeks, skipped} = V.weeklyByPattern(history, now);
    assert.equal(skipped, 0);
    assert.deepEqual(weeks[weeks.length - 1].sets, {hinge: 4, isolation: 3, squat: 3});
  } finally { M.setCustom([]); }
  assert.equal(V.weeklyByPattern(history, now).skipped, 2);
});
