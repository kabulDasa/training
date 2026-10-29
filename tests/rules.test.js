// Tests for rules.js (run: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');
const {MOVEMENTS, ARM_VARIANTS} = require('../movements.js');
const Progress = require('../progress.js');

const D = R.DEFAULT_RULES;
const step = (key, outcome, s) => { const n = {...s}; R.advance(D[key], outcome, n); return n; };

test('every current movement and arm variant has a usable default rule', () => {
  const current = Object.keys(MOVEMENTS).filter(k => !MOVEMENTS[k].retired);
  assert.deepEqual(Object.keys(D).sort(), current.sort());
  for(const [key, rule] of Object.entries(D)){
    assert.equal(R.problem(rule), null, key);
    assert.deepEqual(rule, R.normalize(rule), key);
  }
});

test('an arm variant starts with its movement\'s rule, as its own copy', () => {
  for(const v of Object.values(ARM_VARIANTS)) assert.deepEqual(D[v.single], D[v.both]);
  assert.notEqual(D.shoulderfly, D.shoulderflysingle);
});

/* the progression hard-coded in H2-2026.html before rules were editable */
test('defaults: top-set lifts add kg, more for beating the backoff target', () => {
  for(const key of ['pullup', 'dip']){
    assert.deepEqual(step(key, 'hold', {weight:25, reps:3}), {weight:25, reps:3});
    assert.deepEqual(step(key, 'normal', {weight:25, reps:3}), {weight:26.25, reps:3});
    assert.deepEqual(step(key, 'double', {weight:25, reps:3}), {weight:27.5, reps:3});
  }
  assert.deepEqual(step('squat', 'normal', {weight:110, reps:3}), {weight:112.5, reps:3});
  assert.deepEqual(step('squat', 'double', {weight:110, reps:3}), {weight:115, reps:3});
  assert.deepEqual(step('frontsquat', 'normal', {weight:30, reps:20, sets:2}), {weight:32.5, reps:20, sets:2});
  assert.deepEqual(step('frontsquat', 'hold', {weight:30, reps:20, sets:2}), {weight:30, reps:20, sets:2});
});

test('defaults: double progression caps and resets', () => {
  const cases = [
    // key, reps below the cap -> +1; at the cap -> +kg, reset
    ['ohp', 7, 2.5, 3],
    ['latpulldown', 20, 1.25, 10], ['facepull', 20, 1.25, 10], ['shoulderfly', 20, 1.25, 10],
    ['bicepcurl', 20, 2.5, 10], ['tricepext', 20, 2.5, 10],
    ['chestfly', 20, 1.25, 8], ['invertedrow', 15, 2.5, 5],
    ['shoulderflysingle', 20, 1.25, 10], ['invertedrowboth', 15, 2.5, 5],
  ];
  for(const [key, cap, inc, floor] of cases){
    assert.deepEqual(step(key, 'normal', {weight:10, reps:cap - 1, sets:2}), {weight:10, reps:cap, sets:2}, key);
    assert.deepEqual(step(key, 'normal', {weight:10, reps:cap, sets:2}), {weight:10 + inc, reps:floor, sets:2}, key);
    assert.deepEqual(step(key, 'hold', {weight:10, reps:cap, sets:2}), {weight:10, reps:cap, sets:2}, key);
  }
});

test('edited rules: shoulder fly cap 15, OHP linear, a top-set lift on double progression', () => {
  const fly = {...D.shoulderfly, repCap:15};
  const s = {weight:12.5, reps:15, sets:2};
  R.advance(fly, 'normal', s);
  assert.deepEqual(s, {weight:13.75, reps:10, sets:2});
  // reps already past a lowered cap progress the load on the next success
  const past = {weight:12.5, reps:17, sets:2};
  R.advance(fly, 'normal', past);
  assert.deepEqual(past, {weight:13.75, reps:10, sets:2});

  const ohp = R.normalize({...D.ohp, progression:'linear'});
  const o = {weight:55, reps:5, sets:3};
  R.advance(ohp, 'normal', o);
  assert.deepEqual(o, {weight:57.5, reps:5, sets:3});

  const dip = R.normalize({...D.dip, progression:'double', repFloor:3, repCap:5});
  const d = {weight:27.5, reps:4};
  R.advance(dip, 'double', d);  // bonus backoffs count as a success, one rep
  assert.deepEqual(d, {weight:27.5, reps:5});
  R.advance(dip, 'normal', d);
  assert.deepEqual(d, {weight:28.75, reps:3});
});

test('outcome from ticked sets', () => {
  assert.equal(R.outcomeFromCount(1, 2), 'hold');
  assert.equal(R.outcomeFromCount(2, 2), 'normal');
  assert.equal(R.outcomeFromCount(3, 2), 'double');
});

test('normalize clears the fields a rule doesn\'t use', () => {
  const r = R.normalize({...D.pullup, scheme:'straight'});
  for(const f of ['bonusInc', 'backoffPct', 'backoffReps', 'backoffSets', 'backoffMax', 'backoffRound', 'repFloor', 'repCap'])
    assert.equal(r[f], null, f);
  assert.equal(r.inc, 1.25);
  assert.deepEqual(Object.keys(r), R.FIELDS);
  assert.equal(R.normalize({...D.ohp, progression:'linear'}).repCap, null);
  assert.ok(R.sameRule(D.ohp, {...D.ohp, backoffPct:80}));  // unused field ignored
  assert.ok(R.isDefault('ohp', {...D.ohp}));
  assert.ok(!R.isDefault('ohp', {...D.ohp, repCap:8}));
});

test('problem() names what is wrong', () => {
  assert.equal(R.problem(D.squat), null);
  const bad = [
    [null, /rule/],
    [{...D.ohp, scheme:'pyramid'}, /scheme/],
    [{...D.ohp, progression:'wave'}, /progression/],
    [{...D.ohp, inc:0}, /increment/],
    [{...D.ohp, inc:NaN}, /increment/],
    [{...D.ohp, inc:'2.5'}, /increment/],
    [{...D.ohp, repFloor:7, repCap:7}, /rep cap/],
    [{...D.ohp, repFloor:0}, /rep floor/],
    [{...D.ohp, repFloor:3.5}, /rep floor/],
    [{...D.ohp, repCap:null}, /rep cap/],
    [{...D.pullup, backoffPct:0}, /backoff %/],
    [{...D.pullup, backoffPct:120}, /backoff %/],
    [{...D.pullup, backoffReps:0}, /backoff reps/],
    [{...D.pullup, backoffSets:0}, /target/],
    [{...D.pullup, backoffMax:1}, /most backoff/],
    [{...D.pullup, backoffMax:11}, /most backoff/],
    [{...D.pullup, backoffRound:0}, /rounding/],
    [{...D.pullup, bonusInc:1}, /bonus/],
    [{...D.pullup, bonusInc:null}, /bonus/],
  ];
  for(const [rule, re] of bad) assert.match(R.problem(rule), re, JSON.stringify(rule));
  // a top-set rule on double progression needs no bonus increment
  assert.equal(R.problem(R.normalize({...D.pullup, progression:'double', repFloor:3, repCap:5})), null);
});

test('effective: stored rules win when usable, the rest are defaults', () => {
  const stored = {
    shoulderfly: {...D.shoulderfly, repCap:15},
    ohp: {...D.ohp, repCap:2},          // cap below the floor: ignored
    bogus: {...D.ohp},                  // no such movement
  };
  const {rules, errors} = R.effective(stored);
  assert.equal(rules.shoulderfly.repCap, 15);
  assert.equal(rules.shoulderflysingle.repCap, 20);  // the other variant keeps its own
  assert.deepEqual(rules.ohp, D.ohp);
  assert.match(errors.ohp, /rep cap/);
  assert.match(errors.bogus, /no such movement/);
  assert.equal(rules.bogus, undefined);
  assert.deepEqual(R.effective(undefined).rules, D);
  // the defaults are copies: changing one doesn't change DEFAULT_RULES
  rules.squat.inc = 99;
  assert.equal(D.squat.inc, 2.5);
});

test('fitState fills what a scheme needs and keeps what is there', () => {
  const straight = R.normalize({scheme:'straight', progression:'linear', inc:1.25});
  assert.deepEqual(R.fitState(straight, {weight:27.5, reps:3}), {weight:27.5, reps:3, sets:3});
  assert.deepEqual(R.fitState(D.squat, {weight:110}), {weight:110, reps:3});
  assert.deepEqual(R.fitState(D.ohp, {weight:55}), {weight:55, reps:3, sets:3});
  assert.deepEqual(R.fitState(D.ohp, {weight:55, reps:4, sets:3}), {weight:55, reps:4, sets:3});
  const s = {weight:10, reps:12, sets:2};
  R.fitState(D.shoulderfly, s).reps = 1;
  assert.equal(s.reps, 12);
});

test('rule text: the Settings wording for the defaults', () => {
  assert.equal(R.describe(D.pullup), 'Under 2 backoff sets: hold. Exactly 2: add 1.25 kg. More than 2: add 2.5 kg.');
  assert.equal(R.describe(D.squat), 'Under 2 backoff sets: hold. Exactly 2: add 2.5 kg. More than 2: add 5 kg.');
  assert.equal(R.describe(D.ohp), 'On success, add 1 rep until 7; then add 2.5 kg and reset to 3 reps.');
  assert.equal(R.describe(D.chestfly), 'On success, add 1 rep until 20; then add 1.25 kg and reset to 8 reps.');
  assert.equal(R.describe(D.frontsquat), 'Complete all sets at target to add 2.5 kg; otherwise hold.');
  assert.equal(R.backoffText(D.pullup), 'Backoff: 2 sets of 5 @ 80% of the top set, rounded to 1.25 kg (up to 5)');
  assert.equal(R.backoffText(D.ohp), '');
  assert.match(R.describe(R.normalize({...D.dip, progression:'double', repFloor:3, repCap:5})), /add 1 top-set rep until 5; then add 1.25 kg and reset to 3 reps/);
  assert.equal(R.describe({...D.dip, bonusInc:1.25}), 'Under 2 backoff sets: hold. 2 or more: add 1.25 kg.');
});

test('summary for commit messages', () => {
  assert.equal(R.summary({...D.shoulderfly, repCap:15}), 'straight sets, double 10–15 reps, +1.25 kg');
  assert.equal(R.summary(D.pullup), 'top set + 2×5 backoff @ 80%, linear +1.25 kg (+2.5 kg past 2 backoff sets)');
  assert.equal(R.summary(D.frontsquat), 'straight sets, linear +2.5 kg');
});

test('nextText says what the outcome does next session', () => {
  const plus = kg => `+${kg} kg`;
  assert.equal(R.nextText(D.pullup, 'normal', {weight:25, reps:3}, plus), '+1.25 kg → +26.25 kg next');
  assert.equal(R.nextText(D.pullup, 'double', {weight:25, reps:3}, plus), '+2.5 kg → +27.5 kg next');
  assert.equal(R.nextText(D.pullup, 'hold', {weight:25, reps:3}, plus), 'Hold — repeat +25 kg × 3');
  assert.equal(R.nextText(D.ohp, 'normal', {weight:55, reps:4, sets:3}), '+1 rep → 5 reps next');
  assert.equal(R.nextText(D.ohp, 'normal', {weight:55, reps:7, sets:3}), '+2.5 kg → 57.5 kg × 3 next');
});

test('rules survive progress.md: only the custom ones, and they come back usable', () => {
  const rules = {shoulderfly: {...D.shoulderfly, repCap:15}, dip: R.normalize({...D.dip, scheme:'straight'})};
  const data = {state: {dip: {weight:27.5, reps:5, sets:3}}, history: [], rules};
  const back = Progress.parse(Progress.serialize(data));
  Progress.validate(back);
  assert.deepEqual(back.rules, rules);
  for(const r of Object.values(back.rules)) assert.equal(R.problem(r), null);
});
