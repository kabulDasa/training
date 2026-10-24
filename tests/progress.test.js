// Tests for progress.js (run: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../progress.js');

const SAMPLE = {
  state: {
    pullup: {weight: 25, reps: 3},
    latpulldown: {weight: 12.45, reps: 18, sets: 2},
    squat: {weight: 107.5},
  },
  history: [
    {date: '2026-10-24T15:03:06.790Z', exercise: 'Pull-up',
     result: '3 reps top @ +23.75 kg, 2×5 backoff @ +18.75 kg', outcome: 'normal', weight: 23.75, volume: 187.5},
    {date: '2026-10-24T15:04:00.000Z', exercise: 'OHP',
     result: 'odd | text \\ with escapes', outcome: 'hold', weight: null, volume: null},
  ],
};

test('round trip', () => assert.deepEqual(P.parse(P.serialize(SAMPLE)), SAMPLE));

test('empty', () => {
  const e = {state: {}, history: []};
  assert.deepEqual(P.parse(P.serialize(e)), e);
});

test('real progress.md round-trips byte for byte below the header', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'progress.md'), 'utf8');
  const data = P.parse(text);
  P.validate(data);
  const body = t => t.slice(t.indexOf('## Current working sets'));
  assert.equal(body(P.serialize(data)), body(text));
});

test('hand edit without closing pipe', () => {
  const text = P.serialize(SAMPLE).replace('| squat | 107.5 |  |  |', '| squat | 110');
  assert.deepEqual(P.parse(text).state.squat, {weight: 110});
});

test('bad key and non-finite cells rejected', () => {
  assert.throws(() => P.parse(P.serialize(SAMPLE).replace('| squat |', '| Squat! |')));
  assert.throws(() => P.parse(P.serialize(SAMPLE).replace('| squat | 107.5 |', '| squat | nan |')));
  assert.throws(() => P.parse(P.serialize(SAMPLE).replace('| squat | 107.5 |', '| squat | Infinity |')));
});

test('validate', () => {
  P.validate(SAMPLE);
  const h0 = SAMPLE.history[0];
  for (const bad of [
    [], {state: {}, history: {}}, {state: [], history: []},
    {state: {'pull up': {}}, history: []},
    {state: {pullup: {weight: '25'}}, history: []},
    {state: {pullup: {bogus: 1}}, history: []},
    {state: {pullup: {weight: NaN}}, history: []},
    {state: {}, history: [{...h0, outcome: 'maybe'}]},
    {state: {}, history: [{...h0, exercise: ''}]},
    {state: {}, history: [{...h0, volume: true}]},
    {state: {}, history: [{...h0, weight: Infinity}]},
  ]) assert.throws(() => P.validate(bad), undefined, JSON.stringify(bad));
});

test('base64 handles non-ASCII', () => {
  const s = 'Volume (kg × reps) → ✓';
  assert.equal(P.b64decode(P.b64encode(s)), s);
});

/* fake GitHub contents API: one file, sha changes on every write */
function fakeGitHub(initialText) {
  let text = initialText, sha = 'sha0', n = 0;
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({url, opts});
    const json = (status, body) => ({ok: status < 300, status, json: async () => body});
    if (!opts.method) return json(200, {content: P.b64encode(text).replace(/(.{60})/g, '$1\n'), sha});
    const body = JSON.parse(opts.body);
    if (body.sha !== sha) return json(409, {message: 'is at sha0 but expected x'});
    text = P.b64decode(body.content); sha = 'sha' + (++n);
    return json(200, {content: {sha}});
  };
  return {fetch, calls, get text() { return text; }};
}

test('store loads, saves with sha, and reports conflicts', async () => {
  const gh = fakeGitHub(P.serialize(SAMPLE));
  const store = P.makeStore({owner: 'kabulDasa', repo: 'training', branch: 'main', path: 'progress.md', token: 'tkn'}, gh.fetch);
  const {data, sha} = await store.load();
  assert.deepEqual(data, SAMPLE);
  assert.equal(gh.calls[0].url, 'https://api.github.com/repos/kabulDasa/training/contents/progress.md?ref=main');
  assert.equal(gh.calls[0].opts.headers.Authorization, 'Bearer tkn');

  const next = {...SAMPLE, state: {...SAMPLE.state, squat: {weight: 110}}};
  const sha2 = await store.save(next, sha, 'Log Squat');
  assert.equal(sha2, 'sha1');
  assert.deepEqual(P.parse(gh.text), next);
  const put = JSON.parse(gh.calls[1].opts.body);
  assert.equal(put.message, 'Log Squat');
  assert.equal(put.branch, 'main');

  await assert.rejects(store.save(SAMPLE, sha, 'stale'), P.ConflictError);
  await assert.rejects(store.save({state: [], history: []}, sha2, 'bad'));  // validated before sending
});

test('store without a token sends no Authorization header', async () => {
  const gh = fakeGitHub(P.serialize(SAMPLE));
  await P.makeStore({owner: 'o', repo: 'r', branch: 'main', path: 'progress.md', token: ''}, gh.fetch).load();
  assert.equal(gh.calls[0].opts.headers.Authorization, undefined);
});
