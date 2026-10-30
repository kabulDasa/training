// Tests for plan.js (run: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../plan.js');
const {MOVEMENTS, movementsFor} = require('../movements.js');

const KEY = {'Pull-up':'pullup', 'Dip':'dip', 'Squat':'squat', 'Dumbbell Row':'invertedrow', 'Inverted Row':'invertedrow'};
const keyOf = e => KEY[e] || null;
const DAY = 86400000;
const NOW = Date.parse('2026-10-28T12:00:00Z');
const ago = d => new Date(NOW - d*DAY).toISOString();

test('every current movement has a prescription kind', () => {
  for(const key of Object.keys(MOVEMENTS).filter(k=>!MOVEMENTS[k].retired && k!=='cardio')) assert.ok(P.KIND[key], key);
});

test('backoff is 80% rounded to the increment', () => {
  assert.equal(P.backoffOf(25, 1.25), 20);
  assert.equal(P.backoffOf(107.5, 2.5), 85);
});

test('belt warm-ups start at bodyweight and stay below the top set', () => {
  const w = P.warmups('pullup', {weight:22.5, reps:3});
  assert.equal(w[0].load, 0);
  assert.deepEqual(w.map(x=>x.reps), [5, 3, 2, 1]);
  assert.ok(w.every(x=>x.load < 22.5));
  for(let i=1;i<w.length;i++) assert.ok(w[i].load > w[i-1].load);
  assert.deepEqual(P.warmups('dip', {weight:0, reps:3}), []);
});

test('squat warm-ups ramp from the empty bar', () => {
  const w = P.warmups('squat', {weight:107.5});
  assert.equal(w[0].load, 20);
  assert.ok(w.every(x=>x.load < 107.5));
});

test('barbell warm-ups keep 5 kg jumps and skip when the bar is the load', () => {
  assert.deepEqual(P.warmups('ohp', {weight:45, reps:5, sets:3}).map(x=>x.load), [20, 32.5, 37.5]);
  assert.deepEqual(P.warmups('frontsquat', {weight:22.5}).map(x=>x.load), [20]);
  assert.deepEqual(P.barbellWarmups(20), []);
});

test('accessories get one half-weight feeler set', () => {
  assert.deepEqual(P.warmups('bicepcurl', {weight:10, reps:17, sets:2}), [{load:5, reps:10}]);
  assert.deepEqual(P.warmups('bicepcurl', {weight:2.5, reps:17, sets:2}), []);
});

test('working sets: top set + 5 backoff taps (2 target) vs plain sets', () => {
  // the top set's reps are the working set's (the page fills squat's 3 from its default)
  const sq = P.workingSets('squat', {weight:100, reps:3});
  assert.deepEqual(sq.top, {load:100, reps:3});
  assert.equal(sq.sets.length, 5);
  assert.equal(sq.target, 2);
  assert.deepEqual(sq.sets.map(s=>s.bonus), [false, false, true, true, true]);
  assert.equal(sq.sets[0].load, 80);
  const row = P.workingSets('invertedrow', {weight:20, reps:14, sets:2});
  assert.equal(row.top, null);
  assert.deepEqual(row.sets, [{load:20, reps:14, bonus:false}, {load:20, reps:14, bonus:false}]);
  assert.equal(row.target, 2);
});

test('freshness levels', () => {
  assert.deepEqual(P.freshness(null, NOW), {days:null, level:'never'});
  assert.equal(P.freshness(ago(0), NOW).level, 'fresh');
  assert.equal(P.freshness(ago(7), NOW).level, 'fresh');
  assert.equal(P.freshness(ago(8), NOW).level, 'due');
  assert.equal(P.freshness(ago(14), NOW).level, 'due');
  assert.equal(P.freshness(ago(15), NOW).level, 'stale');
  assert.equal(P.freshness(new Date(NOW + DAY).toISOString(), NOW).days, 0);
});

test('age labels', () => {
  assert.equal(P.ageLabel(null), 'never');
  assert.equal(P.ageLabel(0), 'today');
  assert.equal(P.ageLabel(3), '3 d ago');
  assert.equal(P.ageLabel(20), '2 wk ago');
});

const HIST = [
  {date: ago(20), exercise:'Inverted Row'},
  {date: ago(10), exercise:'Squat'},
  {date: ago(5),  exercise:'Pull-up'},
  {date: ago(3),  exercise:'Dip'},
];

test('lastTrained finds the newest row for a key, across shared names', () => {
  assert.equal(P.lastTrained(HIST, 'pullup', keyOf), ago(5));
  assert.equal(P.lastTrained(HIST, 'invertedrow', keyOf), ago(20));
  assert.equal(P.lastTrained(HIST, 'ohp', keyOf), null);
});

test('suggestDay picks the day trained longest ago', () => {
  assert.equal(P.suggestDay(movementsFor, HIST, keyOf), 'legs');
  assert.equal(P.suggestDay(movementsFor, [], keyOf), 'pull');
  assert.equal(P.suggestDay(movementsFor, [...HIST, {date: ago(1), exercise:'Squat'}], keyOf), 'pull');
});

test('checklist chips: warm-ups plus the top set when there is one', () => {
  assert.equal(P.checklistLength('squat', {weight:107.5}), P.warmups('squat', {weight:107.5}).length + 1);
  assert.equal(P.checklistLength('bicepcurl', {weight:10, reps:17, sets:2}), 1);
});

test('splitFinish logs movements with anything ticked and skips the rest, in plan order', () => {
  const ticked = {pullup:3, latpulldown:0, invertedrow:1, bicepcurl:0};
  assert.deepEqual(P.splitFinish(Object.keys(ticked), k=>ticked[k]),
    {log:['pullup', 'invertedrow'], skip:['latpulldown', 'bicepcurl']});
  assert.deepEqual(P.splitFinish(['dip'], ()=>0), {log:[], skip:['dip']});
});

test('seedVariant: same reps and sets, about half (single arm) or double (both arms) the load', () => {
  assert.deepEqual(P.seedVariant({weight:12.5, reps:10, sets:2}, 'single'), {weight:6.25, reps:10, sets:2});
  assert.deepEqual(P.seedVariant({weight:11.25, reps:17, sets:2}, 'single'), {weight:6.25, reps:17, sets:2});
  assert.deepEqual(P.seedVariant({weight:12.5, reps:15, sets:2}, 'both'), {weight:25, reps:15, sets:2});
  assert.deepEqual(P.seedVariant({weight:11.25, reps:8, sets:2}, 'both'), {weight:22.5, reps:8, sets:2});
  assert.equal(P.seedVariant({weight:3.75, reps:8, sets:2}, 'single').weight, 2.5);
});

test('seedVariant: a given start weight wins', () => {
  assert.deepEqual(P.seedVariant({weight:11.25, reps:10, sets:2}, 'single', 6.25), {weight:6.25, reps:10, sets:2});
});

test('seedVariant copies the working set instead of sharing it', () => {
  const sib = {weight:10, reps:12, sets:2};
  const v = P.seedVariant(sib, 'both');
  v.reps = 13;
  assert.equal(sib.reps, 12);
});

test('arm variants are prescribed like their movement', () => {
  for(const [base, v] of Object.entries(require('../movements.js').ARM_VARIANTS))
    if(base !== 'frontsquat') assert.equal(P.KIND[v.single], P.KIND[v.both], base);
});

test('the lunge / split squat seeds at half the front squat with its own reps, and one feeler warm-up', () => {
  assert.deepEqual(P.seedVariant({weight:30, reps:20, sets:2}, 'single', undefined, 10), {weight:15, reps:10, sets:2});
  assert.deepEqual(P.seedVariant({weight:30, reps:20, sets:2}, 'single'), {weight:15, reps:20, sets:2});
  assert.deepEqual(P.warmups('frontsquatsingle', {weight:15}), [{load:7.5, reps:10}]);
  assert.equal(P.resultText('frontsquatsingle', {weight:15, reps:10, sets:2}, null, 2), '2 × 10 @ 15 kg');
});

/* ---------- working sets under an edited rule ---------- */
const R = require('../rules.js');
const V = require('../volume.js');

test('working sets follow the rule passed in', () => {
  const dipStraight = R.normalize({scheme:'straight', progression:'linear', inc:1.25});
  const ws = P.workingSets('dip', {weight:20, reps:5, sets:3}, dipStraight);
  assert.equal(ws.top, null);
  assert.equal(ws.target, 3);
  assert.deepEqual(ws.sets[0], {load:20, reps:5, bonus:false});
  const flyTop = R.normalize({scheme:'topset', progression:'linear', inc:1.25, bonusInc:2.5,
    backoffPct:75, backoffReps:8, backoffSets:3, backoffMax:4, backoffRound:1.25});
  const t = P.workingSets('shoulderfly', {weight:12.5, reps:10, sets:2}, flyTop);
  assert.deepEqual(t.top, {load:12.5, reps:10});
  assert.equal(t.target, 3);
  assert.deepEqual(t.sets.map(s=>s.bonus), [false, false, false, true]);
  assert.deepEqual(t.sets[0], {load:10, reps:8, bonus:false});  // 75% of 12.5, to 1.25 kg
  // the top set adds a checklist chip; straight sets have none
  assert.equal(P.checklistLength('shoulderfly', {weight:12.5, reps:10, sets:2}, flyTop), 2);
  assert.equal(P.checklistLength('dip', {weight:20, reps:5, sets:3}, dipStraight), P.warmups('dip', {weight:20}).length);
});

test('backoff % defaults to 80', () => {
  assert.equal(P.backoffOf(25, 1.25), P.backoffOf(25, 1.25, 80));
  assert.equal(P.backoffOf(100, 2.5, 70), 70);
});

test('result text keeps a shape volume.js counts, for either scheme', () => {
  const top = P.resultText('pullup', {weight:25, reps:3}, undefined, 4);
  assert.equal(top, '3 reps top @ +25 kg, 4×5 backoff @ +20 kg');
  assert.equal(V.setsOf(top), 5);
  assert.equal(P.resultText('squat', {weight:110, reps:1}, undefined, 2), '1 rep top @ 110 kg, 2×5 backoff @ 87.5 kg');
  const straight = P.resultText('dip', {weight:20, reps:6, sets:3},
    R.normalize({scheme:'straight', progression:'double', inc:1.25, repFloor:5, repCap:8}), 1);
  assert.equal(straight, '3 × 6 @ +20 kg');  // belt weight keeps its +
  assert.equal(V.setsOf(straight), 3);
  assert.equal(P.resultText('ohp', {weight:55, reps:4, sets:3}, undefined, 3), '3 × 4 @ 55 kg');
});

test('parseDuration takes mm:ss and h:mm:ss, and nothing else', () => {
  assert.equal(P.parseDuration('27:30'), 1650);
  assert.equal(P.parseDuration(' 1:05:00 '), 3900);
  assert.equal(P.parseDuration('90:00'), 5400);
  for(const bad of ['', null, '27', '27:5', '27:60', '1:60:00', '0:00', '0:00:00', 'abc', '1:2:3:4', '-5:00', '1:05:00x'])
    assert.equal(P.parseDuration(bad), null, String(bad));
});

test('formatDuration shows hours only from an hour up', () => {
  assert.equal(P.formatDuration(1650), '27:30');
  assert.equal(P.formatDuration(65), '1:05');
  assert.equal(P.formatDuration(3900), '1:05:00');
});

test('cleanNote keeps a note safe for a table cell', () => {
  assert.equal(P.cleanNote('  run   easy '), 'run easy');
  assert.equal(P.cleanNote('bike|hills\n\tx'), 'bike hills x');
  assert.equal(P.cleanNote(null), '');
  assert.equal(P.cleanNote('x'.repeat(60)).length, 40);
});

test('readCardio: empty, errors and a logged session', () => {
  assert.deepEqual(P.readCardio({km: '', time: '', note: 'run'}), {empty: true});
  assert.deepEqual(P.readCardio({km: ' ', time: ' '}), {empty: true});
  assert.match(P.readCardio({km: '5', time: ''}).error, /both/);
  assert.match(P.readCardio({km: '', time: '27:30'}).error, /both/);
  for(const km of ['0', '0.001', 'abc', '-5', '1e3', '1001', '5.2.1']) assert.match(P.readCardio({km, time: '27:30'}).error, /Distance/, km);
  for(const time of ['27', '27:99', '0:00']) assert.match(P.readCardio({km: '5', time}).error, /Time/, time);
  assert.deepEqual(P.readCardio({km: '5', time: '27:30', note: ' run '}),
    {km: 5, seconds: 1650, note: 'run', result: '5 km in 27:30 (5:30/km) · run'});
  assert.equal(P.readCardio({km: '5,25', time: '1:05:00'}).result, '5.25 km in 1:05:00 (12:23/km)');
  assert.equal(P.readCardio({km: '3', time: '10:00', note: 'a|b'}).result, '3 km in 10:00 (3:20/km) · a b');
});

test('a pace that rounds up to a whole minute carries over', () => {
  assert.equal(P.readCardio({km: '3', time: '17:59'}).result, '3 km in 17:59 (6:00/km)');
});

test('parseCardioResult reads back what readCardio writes, and rejects anything else', () => {
  for(const [km, time, note] of [['5', '27:30', 'run'], ['5.25', '1:05:00', ''], ['10', '50:00', 'bike · hills']]){
    const c = P.readCardio({km, time, note});
    assert.deepEqual(P.parseCardioResult(c.result), {km: c.km, seconds: c.seconds, note: c.note});
  }
  for(const bad of ['', null, '2 × 15 @ 12.5 kg', '5 km', '0 km in 10:00 (0:00/km)', '5 km in 0:00 (0:00/km)'])
    assert.equal(P.parseCardioResult(bad), null, String(bad));
});

test('lastCardioForm starts from the newest readable session', () => {
  const row = result => ({exercise: 'Cardio', result});
  assert.deepEqual(P.lastCardioForm([]), {km: '', time: '', note: ''});
  assert.deepEqual(P.lastCardioForm([row('5 km in 27:30 (5:30/km) · run'), {exercise: 'Dip', result: '3 × 5 @ 10 kg'}, row('by hand')]),
    {km: '5', time: '27:30', note: 'run'});
  assert.deepEqual(P.lastCardioForm([row('5 km in 27:30 (5:30/km) · run'), row('3 km in 1:00:00 (20:00/km)')]),
    {km: '3', time: '1:00:00', note: ''});
});

test('cardio has no kind or warm-ups', () => {
  assert.equal(P.kindOf('cardio'), null);
  assert.deepEqual(P.warmups('cardio', {}), []);
});
