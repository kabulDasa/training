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
  for(const key of Object.keys(MOVEMENTS).filter(k=>!MOVEMENTS[k].retired)) assert.ok(P.KIND[key], key);
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
  const sq = P.workingSets('squat', {weight:100});
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
    assert.equal(P.KIND[v.single], P.KIND[v.both], base);
});
