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
     result: '3 reps top @ +23.75 kg, 2×5 backoff @ +18.75 kg', outcome: 'normal', weight: 23.75, volume: 187.5,
     before: {weight: 23.75, reps: 3}},
    {date: '2026-10-24T15:04:00.000Z', exercise: 'OHP',
     result: 'odd | text \\ with escapes', outcome: 'hold', weight: null, volume: null, before: null},
    {date: '2026-10-25T09:00:00.000Z', exercise: 'Lat Pulldown',
     result: '2 × 18 @ 12.45 kg', outcome: 'normal', weight: null, volume: 448.2,
     before: {weight: 12.45, reps: 18, sets: 2}},
    {date: '2026-10-25T09:30:00.000Z', exercise: 'Squat',
     result: '3 reps top @ 107.5 kg, 1×5 backoff @ 85 kg', outcome: 'hold', weight: 107.5, volume: 425,
     before: {weight: 107.5}},
  ],
};

test('round trip', () => assert.deepEqual(P.parse(P.serialize(SAMPLE)), SAMPLE));

test('empty', () => {
  const e = {state: {}, history: []};
  assert.deepEqual(P.parse(P.serialize(e)), e);
});

test('real progress.md has the current header', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'progress.md'), 'utf8');
  assert.equal(text, P.serialize(P.parse(text)));
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

test('Before cell is readable and parses back', () => {
  const text = P.serialize(SAMPLE);
  assert.match(text, /\| 23\.75 kg, 3 reps \|\n/);
  assert.match(text, /\| 12\.45 kg, 18 reps, 2 sets \|\n/);
  assert.match(text, /\| 107\.5 kg \|\n/);
  const one = {...SAMPLE, history: [{...SAMPLE.history[0], before: {weight: 0, reps: 1, sets: 1}}]};
  assert.match(P.serialize(one), /\| 0 kg, 1 rep, 1 set \|\n/);
  assert.deepEqual(P.parse(P.serialize(one)), one);
  // hand edits: any order, singular or plural
  const edited = text.replace('| 23.75 kg, 3 reps |', '| 3 rep,  25 kg |');
  assert.deepEqual(P.parse(edited).history[0].before, {reps: 3, weight: 25});
});

test('Session log without a Before column (older files) loads with before null', () => {
  // drop the last cell of every Session log line
  const [head, log] = P.serialize(SAMPLE).split('## Session log');
  const old = head + '## Session log' + log.replace(/ \| [^|\n]*\|$/gm, ' |').replace('---|\n', '\n');
  assert.doesNotMatch(old, /Before|kg \|$/m);
  const data = P.parse(old);
  P.validate(data);
  assert.deepEqual(data.history.map(h => h.before), [null, null, null, null]);
  assert.match(P.serialize(data), /\| Before \|/);
});

test('bad Before cells rejected', () => {
  const text = P.serialize(SAMPLE);
  for (const bad of ['107.5 lbs', '107.5', 'kg 107.5', 'x kg', '1 kg, 2 kg', '1 kg,', '1 kg 2 reps'])
    assert.throws(() => P.parse(text.replace('| 107.5 kg |', `| ${bad} |`)), /working set|finite/, bad);
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
    {state: {}, history: [{...h0, before: {}}]},
    {state: {}, history: [{...h0, before: []}]},
    {state: {}, history: [{...h0, before: 25}]},
    {state: {}, history: [{...h0, before: {weight: '25'}}]},
    {state: {}, history: [{...h0, before: {weight: NaN}}]},
    {state: {}, history: [{...h0, before: {bogus: 1}}]},
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
    if (!opts.method) return json(200, {type: 'file', encoding: 'base64', content: P.b64encode(text).replace(/(.{60})/g, '$1\n'), sha});
    const body = JSON.parse(opts.body);
    if (gh.failWith) { const [s, m] = gh.failWith; gh.failWith = null; return json(s, {message: m}); }
    if (body.sha !== sha) return json(409, {message: `progress.md does not match ${body.sha}`});
    text = P.b64decode(body.content); sha = 'sha' + (++n);
    return json(200, {content: {sha}});
  };
  const gh = {fetch, calls, failWith: null, get text() { return text; }, set text(t) { text = t; }};
  return gh;
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

  // a 409 that isn't about the sha (e.g. a branch ruleset) is shown, not treated as a conflict
  gh.failWith = [409, 'Repository rule violations found'];
  await assert.rejects(store.save(SAMPLE, sha2, 'x'), e => !(e instanceof P.ConflictError) && /rule/.test(e.message));
});

test('load refuses a file whose sections are missing or invalid', async () => {
  const cfg = {owner: 'o', repo: 'r', branch: 'main', path: 'progress.md', token: ''};
  const broken = fakeGitHub(P.serialize(SAMPLE).replace('## Session log', '# Session log'));
  await assert.rejects(P.makeStore(cfg, broken.fetch).load(), /Session log/);
  const badOutcome = fakeGitHub(P.serialize(SAMPLE).replace('| normal |', '| maybe |'));
  await assert.rejects(P.makeStore(cfg, badOutcome.fetch).load(), /bad history entry/);
});

test('a hung request times out', async () => {
  // fetch that never resolves until aborted
  const hang = (_, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), {name: 'AbortError'}))));
  const store = P.makeStore({owner: 'o', repo: 'r', branch: 'main', path: 'progress.md', token: ''}, hang);
  const t = Date.now();
  const orig = global.setTimeout;
  global.setTimeout = (fn) => orig(fn, 10);  // speed up the 20 s timer
  try { await assert.rejects(store.load(), /did not answer/); } finally { global.setTimeout = orig; }
  assert.ok(Date.now() - t < 1000);
});

test('store without a token sends no Authorization header', async () => {
  const gh = fakeGitHub(P.serialize(SAMPLE));
  await P.makeStore({owner: 'o', repo: 'r', branch: 'main', path: 'progress.md', token: ''}, gh.fetch).load();
  assert.equal(gh.calls[0].opts.headers.Authorization, undefined);
});
