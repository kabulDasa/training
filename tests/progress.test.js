// Tests for progress.js (run: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
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

/* progress.md lives on the `data` branch, not in this checkout. The fixture is a trimmed copy;
   the real file is checked too when `git fetch origin data` has been run (no network here). */
const ROOT = path.join(__dirname, '..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'progress.md'), 'utf8');
function dataBranchFile() {
  try {
    return execFileSync('git', ['show', 'origin/data:progress.md'],
      {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20});
  } catch (e) {
    if (e.status === 128) return null;  // git: no such ref (not fetched) or not a repo
    throw e;
  }
}
const REAL = dataBranchFile();
const body = t => t.slice(t.indexOf('## Current working sets'));

test('fixture progress.md has the current header and round-trips', () => {
  P.validate(P.parse(FIXTURE));
  assert.equal(FIXTURE, P.serialize(P.parse(FIXTURE)));
});

test('origin/data progress.md round-trips byte for byte below the header',
  {skip: REAL === null && 'no origin/data (git fetch origin data)'}, () => {
    const data = P.parse(REAL);
    P.validate(data);
    assert.equal(body(P.serialize(data)), body(REAL));
  });

test('progress.md is not tracked on this branch', () => {
  // it lives on the data branch only, so a copy here could only go stale
  assert.equal(execFileSync('git', ['ls-files', 'progress.md'], {cwd: ROOT, encoding: 'utf8'}), '');
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
  const store = P.makeStore({owner: 'kabulDasa', repo: 'training', branch: 'data', path: 'progress.md', token: 'tkn'}, gh.fetch);
  const {data, sha} = await store.load();
  assert.deepEqual(data, SAMPLE);
  assert.equal(gh.calls[0].url, 'https://api.github.com/repos/kabulDasa/training/contents/progress.md?ref=data');
  assert.equal(gh.calls[0].opts.headers.Authorization, 'Bearer tkn');

  const next = {...SAMPLE, state: {...SAMPLE.state, squat: {weight: 110}}};
  const sha2 = await store.save(next, sha, 'Log Squat');
  assert.equal(sha2, 'sha1');
  assert.deepEqual(P.parse(gh.text), next);
  const put = JSON.parse(gh.calls[1].opts.body);
  assert.equal(put.message, 'Log Squat');
  assert.equal(put.branch, 'data');

  await assert.rejects(store.save(SAMPLE, sha, 'stale'), P.ConflictError);
  await assert.rejects(store.save({state: [], history: []}, sha2, 'bad'));  // validated before sending

  // a 409 that isn't about the sha (e.g. a branch ruleset) is shown, not treated as a conflict
  gh.failWith = [409, 'Repository rule violations found'];
  await assert.rejects(store.save(SAMPLE, sha2, 'x'), e => !(e instanceof P.ConflictError) && /rule/.test(e.message));
});

test('load refuses a file whose sections are missing or invalid', async () => {
  const cfg = {owner: 'o', repo: 'r', branch: 'data', path: 'progress.md', token: ''};
  const broken = fakeGitHub(P.serialize(SAMPLE).replace('## Session log', '# Session log'));
  await assert.rejects(P.makeStore(cfg, broken.fetch).load(), /Session log/);
  const badOutcome = fakeGitHub(P.serialize(SAMPLE).replace('| normal |', '| maybe |'));
  await assert.rejects(P.makeStore(cfg, badOutcome.fetch).load(), /bad history entry/);
});

test('a missing file names the branch', async () => {
  const notFound = async () => ({ok: false, status: 404, json: async () => ({message: 'Not Found'})});
  const store = P.makeStore({owner: 'o', repo: 'r', branch: 'data', path: 'progress.md', token: ''}, notFound);
  await assert.rejects(store.load(), /progress\.md not found on branch data of o\/r/);
});

test('a hung request times out', async () => {
  // fetch that never resolves until aborted
  const hang = (_, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), {name: 'AbortError'}))));
  const store = P.makeStore({owner: 'o', repo: 'r', branch: 'data', path: 'progress.md', token: ''}, hang);
  const t = Date.now();
  const orig = global.setTimeout;
  global.setTimeout = (fn) => orig(fn, 10);  // speed up the 20 s timer
  try { await assert.rejects(store.load(), /did not answer/); } finally { global.setTimeout = orig; }
  assert.ok(Date.now() - t < 1000);
});

test('store without a token sends no Authorization header', async () => {
  const gh = fakeGitHub(P.serialize(SAMPLE));
  await P.makeStore({owner: 'o', repo: 'r', branch: 'data', path: 'progress.md', token: ''}, gh.fetch).load();
  assert.equal(gh.calls[0].opts.headers.Authorization, undefined);
});

/* ---------- bodyweight ---------- */
const BW = {...SAMPLE, bodyweight: [{date: '2026-10-20', kg: 75.4}, {date: '2026-10-27', kg: 74.85}]};

test('bodyweight round-trips and is written as its own table', () => {
  const text = P.serialize(BW);
  assert.match(text, /## Bodyweight\n\n\| Date \| Bodyweight \(kg\) \|\n\|---\|---\|\n\| 2026-10-20 \| 75\.4 \|\n\| 2026-10-27 \| 74\.85 \|\n$/);
  assert.deepEqual(P.parse(text), BW);
  P.validate(P.parse(text));
});

test('files without a Bodyweight section load without one and are written unchanged', () => {
  const text = P.serialize(SAMPLE);
  assert.doesNotMatch(text, /Bodyweight/);
  assert.equal(P.parse(text).bodyweight, undefined);
  // an empty list writes no section either
  assert.equal(P.serialize({...SAMPLE, bodyweight: []}), text);
});

test('bodyweight rows are written oldest first', () => {
  const shuffled = {...BW, bodyweight: [...BW.bodyweight].reverse()};
  assert.deepEqual(P.parse(P.serialize(shuffled)).bodyweight, BW.bodyweight);
});

test('bad bodyweight rejected', () => {
  const text = P.serialize(BW);
  assert.throws(() => P.parse(text.replace('| 2026-10-20 |', '| 20/10/2026 |')), /bodyweight date/);
  assert.throws(() => P.parse(text.replace('| 75.4 |', '| heavy |')), /finite/);
  for (const bad of [
    {...SAMPLE, bodyweight: {}},
    {...SAMPLE, bodyweight: [{date: '2026-10-20'}]},
    {...SAMPLE, bodyweight: [{date: '2026-10-20', kg: null}]},
    {...SAMPLE, bodyweight: [{date: '2026-10-20', kg: '75'}]},
    {...SAMPLE, bodyweight: [{date: '2026-10-20', kg: 0}]},
    {...SAMPLE, bodyweight: [{date: '2026-10-20', kg: 900}]},
    {...SAMPLE, bodyweight: [{date: 'yesterday', kg: 75}]},
    {...SAMPLE, bodyweight: [{date: '2026-02-30', kg: 75}]},
    {...SAMPLE, bodyweight: [{date: '2026-13-01', kg: 75}]},
    {...SAMPLE, bodyweight: [{date: '2026-10-20T08:00:00Z', kg: 75}]},
    {...SAMPLE, bodyweight: [{date: '2026-10-20', kg: 75}, {date: '2026-10-20', kg: 76}]},
  ]) assert.throws(() => P.validate(bad), undefined, JSON.stringify(bad));
});

test('a save without a bodyweight key keeps the rows it loaded (older pages)', async () => {
  const gh = fakeGitHub(P.serialize(BW));
  const cfg = {owner: 'bw', repo: 'keep', branch: 'data', path: 'progress.md', token: 't'};
  const {sha} = await P.makeStore(cfg, gh.fetch).load();
  // a separate store instance, as the page makes one per call
  const sha2 = await P.makeStore(cfg, gh.fetch).save({state: SAMPLE.state, history: SAMPLE.history}, sha, 'Log Squat');
  assert.deepEqual(P.parse(gh.text).bodyweight, BW.bodyweight);
  // an explicit list (even empty) wins
  await P.makeStore(cfg, gh.fetch).save({...SAMPLE, bodyweight: []}, sha2, 'Remove bodyweight');
  assert.equal(P.parse(gh.text).bodyweight, undefined);
});

/* ---------- progression rules ---------- */
const FLY = {scheme: 'straight', progression: 'double', inc: 1.25, bonusInc: null, repFloor: 10, repCap: 15,
  backoffPct: null, backoffReps: null, backoffSets: null, backoffMax: null, backoffRound: null};
const DIP = {scheme: 'topset', progression: 'linear', inc: 1.25, bonusInc: 2.5, repFloor: null, repCap: null,
  backoffPct: 75, backoffReps: 6, backoffSets: 2, backoffMax: 4, backoffRound: 1.25};
const RULES = {...BW, rules: {shoulderfly: FLY, dip: DIP}};

test('progression rules round-trip as their own table after Bodyweight', () => {
  const text = P.serialize(RULES);
  assert.match(text, /## Bodyweight[\s\S]*\n## Progression rules\n\n\| Key \| Scheme \| Progression \| Increment \(kg\) \|/);
  assert.match(text, /\| shoulderfly \| straight \| double \| 1\.25 \|  \| 10 \| 15 \|  \|  \|  \|  \|  \|\n/);
  assert.match(text, /\| dip \| topset \| linear \| 1\.25 \| 2\.5 \|  \|  \| 75 \| 6 \| 2 \| 4 \| 1\.25 \|\n$/);
  assert.deepEqual(P.parse(text), RULES);
  P.validate(P.parse(text));
  assert.equal(P.serialize(P.parse(text)), text);
  // without bodyweight the rules table follows the session log
  const noBw = {...SAMPLE, rules: {shoulderfly: FLY}};
  assert.deepEqual(P.parse(P.serialize(noBw)), noBw);
});

test('files without a Progression rules section load without one and are written unchanged', () => {
  const text = P.serialize(BW);
  assert.doesNotMatch(text, /Progression rules/);
  assert.equal(P.parse(text).rules, undefined);
  assert.equal(P.serialize({...BW, rules: {}}), text);
  assert.equal(P.serialize(P.parse(FIXTURE)), FIXTURE);
});

test('hand-edited rule words are read case-insensitively', () => {
  const text = P.serialize(RULES).replace('| shoulderfly | straight | double |', '| shoulderfly | Straight | DOUBLE |');
  assert.deepEqual(P.parse(text).rules.shoulderfly, FLY);
});

test('bad progression rules rejected', () => {
  const text = P.serialize(RULES);
  assert.throws(() => P.parse(text.replace('| shoulderfly | straight |', '| Shoulder Fly | straight |')), /rule key/);
  assert.throws(() => P.parse(text.replace('| dip | topset |', '| shoulderfly | topset |')), /two progression rules/);
  assert.throws(() => P.parse(text.replace('| 75 |', '| lots |')), /finite/);
  assert.throws(() => P.validate(P.parse(text.replace('| straight | double |', '| pyramid | double |'))), /shoulderfly\.scheme/);
  for (const bad of [
    {...SAMPLE, rules: []},
    {...SAMPLE, rules: null},
    {...SAMPLE, rules: {'Shoulder Fly': FLY}},
    {...SAMPLE, rules: {shoulderfly: null}},
    {...SAMPLE, rules: {shoulderfly: {...FLY, progression: 'wave'}}},
    {...SAMPLE, rules: {shoulderfly: {...FLY, inc: '1.25'}}},
    {...SAMPLE, rules: {shoulderfly: {...FLY, inc: NaN}}},
    {...SAMPLE, rules: {shoulderfly: {...FLY, bogus: 1}}},
  ]) assert.throws(() => P.validate(bad), undefined, JSON.stringify(bad));
});

test('a save without a rules key keeps the rules it loaded (older pages); an explicit one wins', async () => {
  const gh = fakeGitHub(P.serialize(RULES));
  const cfg = {owner: 'rules', repo: 'keep', branch: 'data', path: 'progress.md', token: 't'};
  const {sha} = await P.makeStore(cfg, gh.fetch).load();
  // Q2-2026.html or a cached older H2 page: knows neither bodyweight nor rules
  const sha2 = await P.makeStore(cfg, gh.fetch).save({state: SAMPLE.state, history: SAMPLE.history}, sha, 'Log Squat');
  assert.deepEqual(P.parse(gh.text).rules, RULES.rules);
  assert.deepEqual(P.parse(gh.text).bodyweight, BW.bodyweight);
  // H2 changing one rule, then resetting the last one to default
  const sha3 = await P.makeStore(cfg, gh.fetch).save({...RULES, rules: {shoulderfly: FLY}}, sha2, 'Reset progression rule: Weighted Dip');
  assert.deepEqual(P.parse(gh.text).rules, {shoulderfly: FLY});
  await P.makeStore(cfg, gh.fetch).save({...RULES, rules: {}}, sha3, 'Reset progression rule: Shoulder Fly');
  assert.equal(P.parse(gh.text).rules, undefined);
  assert.doesNotMatch(gh.text, /Progression rules/);
  assert.equal(JSON.parse(gh.calls[gh.calls.length - 1].opts.body).message, 'Reset progression rule: Shoulder Fly');
});

test('a cardio row round-trips, with no load, volume or before', () => {
  const data = P.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'progress.md'), 'utf8'));
  const row = {date: '2026-10-30T10:00:00.000Z', exercise: 'Cardio', result: '5 km in 27:30 (5:30/km) · run \\ easy', outcome: 'normal', weight: null, volume: null, before: null};
  data.history.push(row);
  P.validate(data);
  const back = P.parse(P.serialize(data));
  assert.deepEqual(back.history[back.history.length - 1], row);
  P.validate(back);
});
