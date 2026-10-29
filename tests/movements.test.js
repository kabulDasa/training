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

const current = () => Object.keys(M.MOVEMENTS).filter(k => !M.MOVEMENTS[k].retired);

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

test('every page renderer key is a movement', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'H2-2026.html'), 'utf8');
  const block = html.match(/const RENDERERS = \{([\s\S]*?)\n\};/)[1];
  const keys = [...block.matchAll(/([a-z][a-z0-9]*)\s*:\s*render/g)].map(m => m[1]);
  assert.deepEqual(keys.sort(), current().sort());
});

test('valid day, category, pattern, name and muscle weights', () => {
  for(const [key, m] of Object.entries(M.MOVEMENTS)){
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

test('movement patterns', () => {
  const byPattern = p => Object.keys(M.MOVEMENTS).filter(k => M.MOVEMENTS[k].pattern === p);
  assert.deepEqual(byPattern('vertical_pull'), ['pullup', 'latpulldown', 'muscleup']);
  assert.deepEqual(byPattern('horizontal_pull'), ['invertedrow', 'frontlever']);
  assert.deepEqual(byPattern('vertical_push'), ['dip', 'ohp']);
  assert.deepEqual(byPattern('squat'), ['squat', 'frontsquat']);
  assert.deepEqual(byPattern('isolation'), ['bicepcurl', 'facepull', 'shoulderfly', 'tricepext', 'kneeraise']);
});
