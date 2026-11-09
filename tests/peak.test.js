'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../peak.js');
const P = require('../progress.js');

const KEY = {'Pull-up': 'pullup', 'Dip': 'dip', 'Squat': 'squat'};
const keyOf = e => KEY[e] || null;
const HIST = [
  {date: '2026-10-24T09:00:00Z', exercise: 'Pull-up', result: '3 reps top @ +23.75 kg, 2×5 backoff @ +18.75 kg'},
  {date: '2026-10-28T09:00:00Z', exercise: 'Squat', result: '3 reps top @ 107.5 kg, 2×5 backoff @ 85 kg'},
  {date: '2026-11-09T09:00:00Z', exercise: 'Pull-up', result: '3 reps top @ +26.25 kg RPE 8.5, 1×3 backoff @ +22.5 kg'},
  {date: '2026-11-09T09:05:00Z', exercise: 'Face Pull', result: '2 × 17 @ 15 kg'},
];

test('pctOf follows the RPE chart', () => {
  assert.equal(K.pctOf(1, 10), 1);
  assert.equal(K.pctOf(3, 10), 0.922);
  assert.equal(K.pctOf(1, 9), 0.955);
  assert.equal(K.pctOf(3, 8), 0.863);
  assert.equal(K.pctOf(0, 8), null);
  assert.equal(K.pctOf(3, 5.5), null);
  assert.equal(K.pctOf(3, 8.25), null);
});

test('parseTop reads the top set, with or without RPE', () => {
  assert.deepEqual(K.parseTop('3 reps top @ +26.25 kg RPE 8.5, 1×3 backoff @ +22.5 kg'), {reps: 3, load: 26.25, rpe: 8.5});
  assert.deepEqual(K.parseTop('1 rep top @ 110 kg, 2×5 backoff @ 87.5 kg'), {reps: 1, load: 110, rpe: null});
  assert.equal(K.parseTop('2 × 17 @ 15 kg'), null);
});

test('latestTop is the newest top set for the key', () => {
  assert.deepEqual(K.latestTop(HIST, 'pullup', keyOf), {date: '2026-11-09T09:00:00Z', reps: 3, load: 26.25, rpe: 8.5});
  assert.equal(K.latestTop(HIST, 'dip', keyOf), null);
});

test('e1rm uses bodyweight + belt for weighted calisthenics, RPE 9 when none was logged', () => {
  // 101.25 kg for 3 @ RPE 8.5 (87.8%)
  assert.equal(Math.round(K.e1rm({reps: 3, load: 26.25, rpe: 8.5}, 75, true)*10)/10, 115.3);
  assert.equal(Math.round(K.e1rm({reps: 3, load: 107.5, rpe: null}, 75, false)*10)/10, 120.5);
  assert.equal(K.e1rm({reps: 3, load: 26.25, rpe: 8}, null, true), null);
});

test('loadFor rounds down to the increment and gives belt weight back', () => {
  assert.equal(K.loadFor(115.3, 1, 75, true, 1.25), 40);
  assert.equal(K.loadFor(120.5, 0.92, 0, false, 2.5), 110);
  assert.equal(K.loadFor(60, 0.5, 75, true, 1.25), 0);
});

test('weeks and the next competition', () => {
  assert.equal(K.mondayOf('2026-11-09'), '2026-11-09');
  assert.equal(K.mondayOf('2026-11-15'), '2026-11-09');
  assert.equal(K.weeksOut('2026-11-11', '2026-11-14'), 0);
  assert.equal(K.weeksOut('2026-11-09', '2027-01-09'), 8);
  const comps = [{date: '2026-10-01', name: 'old'}, {date: '2027-03-06', name: 'B'}, {date: '2027-01-09', name: 'A'}];
  assert.deepEqual(K.nextComp(comps, '2026-11-09'), {date: '2027-01-09', name: 'A'});
  assert.equal(K.nextComp(comps, '2027-03-07'), null);
  assert.equal(K.nextComp(undefined, '2027-03-07'), null);
});

test('phases taper from triples to singles', () => {
  assert.equal(K.phaseFor(12).reps, 3);
  assert.equal(K.phaseFor(7).reps, 2);
  assert.deepEqual([5, 4, 3].map(w => K.phaseFor(w).reps), [1, 1, 1]);
  assert.equal(K.phaseFor(2).rpe, 9);
  assert.equal(K.phaseFor(1).phase, 'Meet simulation');
  assert.equal(K.phaseFor(1).backoff, null);
  assert.equal(K.phaseFor(0).reps, null);
});

test('plan: weeks to the competition, singles near the end, three rising attempts', () => {
  const r = K.plan({history: HIST, keyOf, key: 'pullup', bw: 75, belt: true, inc: 1.25, today: '2026-11-09', comp: {date: '2027-01-09', name: 'A'}});
  assert.equal(r.weeks.length, 9);
  assert.equal(r.weeks[0].start, '2026-11-09');
  assert.equal(r.weeks.at(-1).phase, 'Competition');
  assert.equal(r.weeks.at(-2).top.reps, 1);
  // projected gain: 0.5% a week for the 6 weeks before the 2-week taper
  assert.ok(Math.abs(r.e1rmComp - r.e1rmNow*1.03) < 1e-9);
  const loads = r.attempts.map(a => a.load);
  assert.ok(loads[0] < loads[1] && loads[1] < loads[2]);
  // a peak-phase backoff is 85% of the top single's belt weight, like the tracker
  const peak = r.weeks.find(w => w.phase === 'Peak');
  assert.equal(peak.backoffLoad, K.loadFor(peak.top.load, 0.85, 0, false, 1.25));
});

test('plan without a competition: the estimate only; errors when it cannot estimate', () => {
  const r = K.plan({history: HIST, keyOf, key: 'squat', bw: 75, belt: false, inc: 2.5, today: '2026-11-09', comp: null});
  assert.equal(r.maxNow, 120);
  assert.equal(r.assumedRpe, true);
  assert.deepEqual(r.weeks, []);
  assert.match(K.plan({history: HIST, keyOf, key: 'dip', bw: 75, belt: true, inc: 1.25, today: '2026-11-09', comp: null}).error, /No top set/);
  assert.match(K.plan({history: HIST, keyOf, key: 'pullup', bw: null, belt: true, inc: 1.25, today: '2026-11-09', comp: null}).error, /bodyweight/);
});

test('progress.md keeps an optional Competitions table', () => {
  const base = {state: {pullup: {weight: 25, reps: 3}}, history: []};
  assert.ok(!P.serialize(base).includes('Competitions'));
  const data = {...base, competitions: [{date: '2027-03-06', name: 'Spring Open'}, {date: '2027-01-09', name: ''}]};
  const text = P.serialize(data);
  assert.match(text, /## Competitions\n\n\| Date \| Name \|\n\|---\|---\|\n\| 2027-01-09 \|  \|\n\| 2027-03-06 \| Spring Open \|\n$/);
  const back = P.parse(text);
  assert.deepEqual(back.competitions, [{date: '2027-01-09', name: ''}, {date: '2027-03-06', name: 'Spring Open'}]);
  assert.doesNotThrow(() => P.validate(back));
  assert.throws(() => P.validate({...base, competitions: [{date: '2027-02-30', name: ''}]}), /competition date/);
  assert.throws(() => P.validate({...base, competitions: [{date: '2027-01-09', name: ''}, {date: '2027-01-09', name: 'x'}]}), /two competitions/);
});

test('a save from a page without competitions keeps the loaded table', async () => {
  const text = P.serialize({state: {}, history: [], competitions: [{date: '2027-01-09', name: 'A'}]});
  const puts = [];
  const fetchImpl = async (url, opts = {}) => {
    if(opts.method === 'PUT'){ puts.push(JSON.parse(opts.body)); return new Response(JSON.stringify({content: {sha: 'b'}}), {status: 200}); }
    return new Response(JSON.stringify({type: 'file', encoding: 'base64', content: P.b64encode(text), sha: 'a'}), {status: 200});
  };
  const store = P.makeStore({owner: 'o', repo: 'r', branch: 'data', path: 'progress.md', token: 't'}, fetchImpl);
  await store.load();
  await store.save({state: {}, history: []}, 'a', 'm');
  assert.match(P.b64decode(puts[0].content), /\| 2027-01-09 \| A \|/);
});
