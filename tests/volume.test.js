// Tests for volume.js (run: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../progress.js');
const V = require('../volume.js');

/* midday UTC, so the local date is the same day in any time zone this runs in */
const at = day => `${day}T12:00:00.000Z`;
const log = (day, exercise, result) => ({date: at(day), exercise, result});

test('setsOf counts top set + backoffs, band skill work, and plain sets', () => {
  assert.equal(V.setsOf('3 reps top @ +25 kg, 2×5 backoff @ +20 kg'), 3);
  assert.equal(V.setsOf('1 rep top @ +12.5 kg, 5×3 backoff @ +10 kg'), 6);
  assert.equal(V.setsOf('3 reps top @ 107.5 kg, 1×5 backoff @ 85 kg'), 2);
  assert.equal(V.setsOf('Green band × 3, 3 backoff'), 4);
  assert.equal(V.setsOf('2 × 20 @ 10 kg'), 2);
  assert.equal(V.setsOf('Tucked Front Lever — 3 × 3s'), 3);
  assert.equal(V.setsOf('undefined — 3 × 12'), 3);
  assert.equal(V.setsOf('odd | text'), 0);
  assert.equal(V.setsOf(null), 0);
});

test('weekStart is the Monday of the ISO week', () => {
  assert.equal(V.weekStart(at('2026-10-26')), '2026-10-26'); // Monday
  assert.equal(V.weekStart(at('2026-10-28')), '2026-10-26');
  assert.equal(V.weekStart(at('2026-11-01')), '2026-10-26'); // Sunday
  assert.equal(V.weekStart(at('2026-11-02')), '2026-11-02');
  assert.equal(V.weekStart(at('2027-01-01')), '2026-12-28'); // across the year end
});

test('weeklyByPattern credits each set to its pattern, fills gap weeks, runs to the current week', () => {
  const {weeks, skipped} = V.weeklyByPattern([
    log('2026-10-05', 'Pull-up', '3 reps top @ +22.5 kg, 2×5 backoff @ +17.5 kg'),
    log('2026-10-06', 'Lat Pulldown', '2 × 16 @ 12.5 kg'),
    log('2026-10-07', 'Dumbbell Row', '2 × 15 @ 20 kg'),
    log('2026-10-07', 'Bicep Curl', '2 × 12 @ 12.5 kg'),
    log('2026-10-08', 'Dip', '3 reps top @ +25 kg, 2×5 backoff @ +20 kg'),
    log('2026-10-08', 'OHP', '3 × 7 @ 52.5 kg'),
    log('2026-10-20', 'Front Squat', '2 × 20 @ 27.5 kg'),
  ], new Date(at('2026-10-28')));
  assert.equal(skipped, 0);
  assert.deepEqual(weeks.map(w => w.week), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(weeks[0].sets, {vertical_pull: 5, horizontal_pull: 2, isolation: 2, vertical_push: 6});
  assert.deepEqual(weeks[1].sets, {});
  assert.deepEqual(weeks[2].sets, {squat: 2});
  assert.deepEqual(weeks[3].sets, {});
});

test('retired skill movements still count; unknown or unreadable logs are skipped', () => {
  const {weeks, skipped} = V.weeklyByPattern([
    log('2026-07-12', 'Muscle-up', 'Green band × 3, 3 backoff'),
    log('2026-07-12', 'Tuck Front Lever', 'Tucked Front Lever — 3 × 3s'),
    log('2026-07-12', 'Hanging Knee Raise', '3 × 10'),
    log('2026-07-12', 'Deadlift', '3 × 5 @ 180 kg'),
    log('2026-07-12', 'OHP', 'odd | text'),
  ], new Date(at('2026-07-12')));
  assert.equal(skipped, 2);
  assert.deepEqual(weeks, [{week: '2026-07-06', sets: {vertical_pull: 4, horizontal_pull: 3, isolation: 3}}]);
});

test('weeklyByPattern with no logs is empty', () => {
  assert.deepEqual(V.weeklyByPattern([], new Date()), {weeks: [], skipped: 0});
});

test('recentAverage leaves out the current week', () => {
  const weeks = [{week: 'a', sets: {squat: 9}}, {week: 'b', sets: {squat: 2}}, {week: 'c', sets: {squat: 4}},
    {week: 'd', sets: {}}, {week: 'e', sets: {squat: 6}}, {week: 'now', sets: {squat: 100}}];
  const avg = V.recentAverage(weeks, 4);
  assert.equal(avg.squat, 3);
  assert.equal(avg.hinge, 0);
  assert.equal(V.recentAverage([{week: 'now', sets: {}}]).squat, null);
});

test('every session in the fixture log is credited', () => {
  const {history} = P.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'progress.md'), 'utf8'));
  const {skipped} = V.weeklyByPattern(history);
  assert.equal(skipped, 0);
});

test('both arm variants of a movement count, each to the movement pattern', () => {
  const {weeks, skipped} = V.weeklyByPattern([
    log('2026-10-26', 'Shoulder Fly', '2 × 10 @ 12.5 kg'),
    log('2026-10-26', 'Shoulder Fly (single arm)', '2 × 10 @ 6.25 kg'),
    log('2026-10-27', 'Lat Pulldown (both arms)', '2 × 20 @ 22.5 kg'),
    log('2026-10-27', 'Dumbbell Row (both arms)', '2 × 14 @ 40 kg'),
  ], new Date(at('2026-10-28')));
  assert.equal(skipped, 0);
  assert.deepEqual(weeks, [{week: '2026-10-26', sets: {isolation: 4, vertical_pull: 2, horizontal_pull: 2}}]);
});

test('cardio rows are neither counted nor reported as skipped', () => {
  const {weeks, skipped} = V.weeklyByPattern([
    {date: '2026-10-26T10:00:00', exercise: 'Dip', result: '3 reps top @ +25 kg, 2×5 backoff @ +20 kg'},
    {date: '2026-10-26T11:00:00', exercise: 'Cardio', result: '5 km in 27:30 (5:30/km) · run'},
    {date: '2026-10-27T11:00:00', exercise: 'Cardio', result: 'by hand'},
  ], new Date(2026, 9, 28));
  assert.equal(skipped, 0);
  assert.deepEqual(weeks, [{week: '2026-10-26', sets: {vertical_push: 3}}]);
});

test('weeklyCardio totals distance and time per week, with no gaps', () => {
  const row = (date, result) => ({date, exercise: 'Cardio', result});
  const weeks = V.weeklyCardio([
    row('2026-10-05T10:00:00', '5 km in 27:30 (5:30/km) · run'),
    {date: '2026-10-06T10:00:00', exercise: 'Dip', result: '3 × 5 @ 10 kg'},
    row('2026-10-07T10:00:00', '10.25 km in 1:00:00 (5:51/km) · bike'),
    row('2026-10-08T10:00:00', 'by hand'),
    row('2026-10-19T10:00:00', '3 km in 15:00 (5:00/km)'),
  ], new Date(2026, 9, 28));
  assert.deepEqual(weeks.map(w => w.week), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.equal(weeks[0].km, 15.25);
  assert.equal(weeks[0].seconds, 1650 + 3600);
  assert.deepEqual(weeks[0].sessions.map(s => s.note), ['run', 'bike']);
  assert.deepEqual({km: weeks[1].km, seconds: weeks[1].seconds, sessions: weeks[1].sessions}, {km: 0, seconds: 0, sessions: []});
  assert.equal(weeks[2].sessions[0].note, '');
  assert.deepEqual(V.weeklyCardio([], new Date()), []);
});
