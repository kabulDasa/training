/* progress.md format + GitHub storage for Q2-2026.html.
   progress.md holds two Markdown tables: "Current working sets" (Key | Weight | Reps | Sets) and
   "Session log" (oldest first, one row per logged session; Before is the working set the log
   replaced, which undo restores, and is blank on rows logged before the column existed), plus an
   optional "Bodyweight" table (Date | Bodyweight (kg), one row per day, oldest first) and an optional
   "Progression rules" table (one row per movement key whose rule differs from the H2 page's default;
   rules.js says what the columns mean and checks the values make sense), plus an optional "Custom
   movements" table (exercises added from the H2 Settings tab: Key | Name | Day | Type | Pattern |
   Load | Muscles | Retired; movements.js registers them). The page
   reads and writes it through the GitHub contents API on the repo's `data` branch, so every save is
   a commit there and never touches `main`, which GitHub Pages serves the site from. Loaded as a plain
   <script> in the page and with require() in the node tests. */
(function(root){
'use strict';

const STATE_FIELDS = ['weight', 'reps', 'sets'];
const HISTORY_FIELDS = ['date', 'exercise', 'result', 'outcome', 'weight', 'volume', 'before'];
/* Before cell units, e.g. "12.5 kg, 18 reps, 2 sets" */
const UNITS = {weight: ['kg', 'kg'], reps: ['rep', 'reps'], sets: ['set', 'sets']};
const OUTCOMES = ['hold', 'normal', 'double'];
const KEY_RE = /^[a-z][a-z0-9]*$/;
/* Progression rules columns after Key: [field, header]. scheme and progression are words, the rest
   numbers; a blank cell is a field the rule doesn't use (null). */
const RULE_COLUMNS = [
  ['scheme', 'Scheme'], ['progression', 'Progression'], ['inc', 'Increment (kg)'], ['bonusInc', 'Bonus increment (kg)'],
  ['repFloor', 'Rep floor'], ['repCap', 'Rep cap'], ['backoffPct', 'Backoff %'], ['backoffReps', 'Backoff reps'],
  ['backoffSets', 'Backoff sets'], ['backoffMax', 'Backoff max'], ['backoffRound', 'Backoff rounding (kg)'],
];
const RULE_WORDS = {scheme: ['topset', 'straight'], progression: ['linear', 'double']};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/* Custom movements columns after Key and Name: [field, header, allowed words]. Muscles is
   "lats 1, biceps 0.5" (blank = none), Retired is "yes" or blank. The words match movements.js. */
const CUSTOM_COLUMNS = [
  ['day', 'Day', ['pull', 'push', 'legs']],
  ['category', 'Type', ['compound', 'isolation', 'skill', 'cardio']],
  ['pattern', 'Pattern', ['vertical_pull', 'horizontal_pull', 'vertical_push', 'horizontal_push', 'squat', 'hinge', 'isolation']],
  ['kind', 'Load', ['belt', 'barbell', 'accessory']],
];
const CUSTOM_FIELDS = ['key', 'name', ...CUSTOM_COLUMNS.map(c => c[0]), 'muscles', 'retired'];
const MUSCLE_RE = /^[a-z][a-z_]*$/;
function fmtMuscles(m){ return Object.entries(m || {}).map(([k, w]) => `${k} ${w}`).join(', '); }
function parseMuscles(text){
  const out = {};
  text = text.trim();
  if(!text) return out;
  for(const part of text.split(',')){
    const m = /^([a-z_]+)\s+(\S+)$/i.exec(part.trim());
    if(!m) throw new Error(`bad muscles: ${JSON.stringify(text)}`);
    out[m[1].toLowerCase()] = num(m[2]);
  }
  return out;
}

const HEADER = `# Q2 2026 progress

Written by \`Q2-2026.html\` through the GitHub API whenever a session is logged; each change is a commit
to this \`data\` branch (the site's code is on \`main\`). Hand edits are fine (keep the table layout):
pull the \`data\` branch first; the page will ask to reload if it was open.
`;

/* ---------- markdown format ---------- */

function num(text){
  text = text.trim();
  if(!text) return null;
  const n = Number(text);
  if(!Number.isFinite(n)) throw new Error(`not a finite number: ${JSON.stringify(text)}`);
  return n;
}
function fmt(v){ return v == null ? '' : String(v); }
/* working set {weight, reps, sets} <-> "12.5 kg, 18 reps, 2 sets"; null <-> '' */
function fmtSet(set){
  if(set == null) return '';
  return STATE_FIELDS.filter(f => f in set).map(f => `${set[f]} ${UNITS[f][set[f] === 1 ? 0 : 1]}`).join(', ');
}
function parseSet(text){
  text = text.trim();
  if(!text) return null;
  const set = {};
  for(const part of text.split(',')){
    const m = /^(\S+)\s+(\S+)$/.exec(part.trim());
    const f = m && STATE_FIELDS.find(k => UNITS[k].includes(m[2]));
    if(!f || f in set) throw new Error(`bad working set: ${JSON.stringify(text)}`);
    set[f] = num(m[1]);
  }
  return set;
}
function cell(text){ return String(text).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' '); }

/* split a table row into cells, honouring \| and \\ escapes */
function splitRow(line){
  let body = line.trim();
  if(body.startsWith('|')) body = body.slice(1);
  const cells = [];
  let cur = '';
  for(let i = 0; i < body.length; i++){
    const c = body[i];
    if(c === '\\' && i + 1 < body.length){ cur += body[++i]; continue; }
    if(c === '|'){ cells.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if(cur.trim()) cells.push(cur.trim());  /* row written without a closing | */
  return cells;
}

/* {section heading: [row cells, ...]} for each '## ' section's table, header rows skipped */
function tables(text){
  const out = {};
  let section = null, seenHeader = false;
  for(const line of text.split(/\r?\n/)){
    if(line.startsWith('## ')){ section = line.slice(3).trim(); seenHeader = false; out[section] = []; continue; }
    if(section === null || !line.trim().startsWith('|')) continue;
    if(!seenHeader){ seenHeader = true; continue; }
    if(/^\|?[\s:|-]+\|?$/.test(line.trim())) continue;
    out[section].push(splitRow(line));
  }
  return out;
}

function parse(text){
  const t = tables(text);
  /* a broken heading would otherwise load as empty and the next save would wipe the file */
  for(const s of ['Current working sets', 'Session log'])
    if(!(s in t)) throw new Error(`progress.md has no "## ${s}" section`);
  const state = {};
  for(const row of t['Current working sets'] || []){
    const key = row[0];
    if(!KEY_RE.test(key)) throw new Error(`bad exercise key: ${JSON.stringify(key)}`);
    const entry = {};
    STATE_FIELDS.forEach((f, i) => {
      const v = num(row[i + 1] || '');
      if(v !== null) entry[f] = v;
    });
    state[key] = entry;
  }
  const history = (t['Session log'] || []).map(row => {
    const [date, exercise, result, outcome, weight, volume, before] = HISTORY_FIELDS.map((_, i) => row[i] || '');
    return {date, exercise, result, outcome, weight: num(weight), volume: num(volume), before: parseSet(before)};
  });
  const data = {state, history};
  /* optional: files written before bodyweight logging existed have no such section */
  if('Bodyweight' in t)
    data.bodyweight = t['Bodyweight'].map(row => {
      const date = (row[0] || '').trim();
      if(!DATE_RE.test(date)) throw new Error(`bad bodyweight date: ${JSON.stringify(date)}`);
      return {date, kg: num(row[1] || '')};
    });
  /* optional too: only movements whose rule differs from the default have a row */
  if('Progression rules' in t){
    data.rules = {};
    for(const row of t['Progression rules']){
      const key = (row[0] || '').trim();
      if(!KEY_RE.test(key)) throw new Error(`bad progression rule key: ${JSON.stringify(key)}`);
      if(Object.hasOwn(data.rules, key)) throw new Error(`two progression rules for ${key}`);
      const rule = {};
      RULE_COLUMNS.forEach(([f], i) => {
        const text = (row[i + 1] || '').trim();
        rule[f] = RULE_WORDS[f] ? text.toLowerCase() : num(text);
      });
      data.rules[key] = rule;
    }
  }
  /* optional as well: exercises added from the Settings tab */
  if('Custom movements' in t){
    data.custom = t['Custom movements'].map(row => {
      const key = (row[0] || '').trim();
      if(!KEY_RE.test(key)) throw new Error(`bad custom movement key: ${JSON.stringify(key)}`);
      const c = {key, name: (row[1] || '').trim()};
      CUSTOM_COLUMNS.forEach(([f], i) => { c[f] = (row[i + 2] || '').trim().toLowerCase(); });
      c.muscles = parseMuscles(row[CUSTOM_COLUMNS.length + 2] || '');
      const retired = (row[CUSTOM_COLUMNS.length + 3] || '').trim().toLowerCase();
      if(retired && retired !== 'yes') throw new Error(`custom movement ${key}: Retired must be yes or blank`);
      c.retired = retired === 'yes';
      return c;
    });
  }
  return data;
}

function serialize(data){
  const lines = [HEADER, '## Current working sets', '',
    '| Key | Weight (kg) | Reps | Sets |', '|---|---|---|---|'];
  for(const [key, entry] of Object.entries(data.state))
    lines.push('| ' + [key, ...STATE_FIELDS.map(f => fmt(entry[f]))].join(' | ') + ' |');
  lines.push('', '## Session log', '',
    '| Date | Exercise | Result | Outcome | Weight (kg) | Volume (kg × reps) | Before |',
    '|---|---|---|---|---|---|---|');
  for(const h of data.history)
    lines.push('| ' + [cell(h.date), cell(h.exercise), cell(h.result), h.outcome, fmt(h.weight), fmt(h.volume), fmtSet(h.before)].join(' | ') + ' |');
  /* only once there is an entry, so files without bodyweight round-trip unchanged */
  if(data.bodyweight && data.bodyweight.length){
    lines.push('', '## Bodyweight', '', '| Date | Bodyweight (kg) |', '|---|---|');
    for(const b of [...data.bodyweight].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      lines.push(`| ${b.date} | ${fmt(b.kg)} |`);
  }
  /* likewise only once a rule differs from the default */
  if(data.rules && Object.keys(data.rules).length){
    lines.push('', '## Progression rules', '',
      '| ' + ['Key', ...RULE_COLUMNS.map(c => c[1])].join(' | ') + ' |',
      '|' + '---|'.repeat(RULE_COLUMNS.length + 1));
    for(const [key, rule] of Object.entries(data.rules))
      lines.push('| ' + [key, ...RULE_COLUMNS.map(([f]) => fmt(rule[f]))].join(' | ') + ' |');
  }
  /* and only once an exercise has been added */
  if(data.custom && data.custom.length){
    lines.push('', '## Custom movements', '',
      '| ' + ['Key', 'Name', ...CUSTOM_COLUMNS.map(c => c[1]), 'Muscles', 'Retired'].join(' | ') + ' |',
      '|' + '---|'.repeat(CUSTOM_COLUMNS.length + 4));
    for(const c of data.custom)
      lines.push('| ' + [c.key, cell(c.name), ...CUSTOM_COLUMNS.map(([f]) => c[f]), fmtMuscles(c.muscles), c.retired ? 'yes' : ''].join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

/* YYYY-MM-DD that names a real calendar day (Date would roll 2026-02-30 over to March) */
function isRealDate(d){
  if(!DATE_RE.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().slice(0, 10) === d;
}
function isNum(v){ return typeof v === 'number' && Number.isFinite(v); }

/* a non-empty working set ({} would be written as an empty cell and read back as null) */
function isSet(v){
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0
    && Object.entries(v).every(([f, n]) => STATE_FIELDS.includes(f) && isNum(n));
}

/* throw unless data looks like {state: {key: {...}}, history: [...]} */
function validate(data){
  if(!data || typeof data.state !== 'object' || Array.isArray(data.state) || !Array.isArray(data.history))
    throw new Error('expected {state: {...}, history: [...]}');
  for(const [key, entry] of Object.entries(data.state)){
    if(!KEY_RE.test(key) || !entry || typeof entry !== 'object') throw new Error(`bad state entry: ${key}`);
    for(const [f, v] of Object.entries(entry))
      if(!STATE_FIELDS.includes(f) || !isNum(v)) throw new Error(`bad field ${key}.${f}`);
  }
  for(const h of data.history){
    if(!h || !OUTCOMES.includes(h.outcome)) throw new Error('bad history entry');
    for(const f of ['date', 'exercise', 'result'])
      if(typeof h[f] !== 'string' || !h[f]) throw new Error(`history entry missing ${f}`);
    for(const f of ['weight', 'volume'])
      if(h[f] != null && !isNum(h[f])) throw new Error(`bad history ${f}`);
    if(h.before != null && !isSet(h.before)) throw new Error('bad history before');
  }
  if(data.bodyweight !== undefined){
    if(!Array.isArray(data.bodyweight)) throw new Error('bodyweight must be a list');
    const seen = new Set();
    for(const b of data.bodyweight){
      if(!b || typeof b.date !== 'string' || !isRealDate(b.date))
        throw new Error('bad bodyweight date');
      if(!isNum(b.kg) || b.kg <= 0 || b.kg >= 500) throw new Error(`bad bodyweight on ${b.date}`);
      if(seen.has(b.date)) throw new Error(`two bodyweight entries on ${b.date}`);
      seen.add(b.date);
    }
  }
  /* the shape only; whether a rule makes sense (rep cap above the floor, …) is rules.js's call */
  if(data.rules !== undefined){
    if(!data.rules || typeof data.rules !== 'object' || Array.isArray(data.rules)) throw new Error('rules must be an object');
    for(const [key, rule] of Object.entries(data.rules)){
      if(!KEY_RE.test(key) || !rule || typeof rule !== 'object') throw new Error(`bad progression rule: ${key}`);
      for(const [f] of RULE_COLUMNS){
        const v = rule[f];
        if(RULE_WORDS[f] ? !RULE_WORDS[f].includes(v) : v != null && !isNum(v)) throw new Error(`bad progression rule ${key}.${f}`);
      }
      for(const f of Object.keys(rule))
        if(!RULE_COLUMNS.some(c => c[0] === f)) throw new Error(`bad progression rule field ${key}.${f}`);
    }
  }
  /* the shape only; whether a name clashes with another movement is movements.js's call */
  if(data.custom !== undefined){
    if(!Array.isArray(data.custom)) throw new Error('custom movements must be a list');
    const keys = new Set();
    for(const c of data.custom){
      if(!c || typeof c !== 'object' || typeof c.key !== 'string' || !KEY_RE.test(c.key)) throw new Error('bad custom movement key');
      if(keys.has(c.key)) throw new Error(`two custom movements ${c.key}`);
      keys.add(c.key);
      if(typeof c.name !== 'string' || !c.name.trim() || /[\r\n]/.test(c.name)) throw new Error(`bad custom movement name: ${c.key}`);
      for(const [f, , words] of CUSTOM_COLUMNS)
        if(!words.includes(c[f])) throw new Error(`bad custom movement ${c.key}.${f}`);
      if(!c.muscles || typeof c.muscles !== 'object' || Array.isArray(c.muscles)) throw new Error(`bad custom movement ${c.key}.muscles`);
      for(const [m, w] of Object.entries(c.muscles))
        if(!MUSCLE_RE.test(m) || !isNum(w) || w <= 0 || w > 1) throw new Error(`bad custom movement ${c.key}.muscles.${m}`);
      if(typeof c.retired !== 'boolean') throw new Error(`bad custom movement ${c.key}.retired`);
      for(const f of Object.keys(c))
        if(!CUSTOM_FIELDS.includes(f)) throw new Error(`bad custom movement field ${c.key}.${f}`);
    }
  }
}

/* ---------- GitHub contents API ---------- */

function b64encode(text){
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64){
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

class ConflictError extends Error {}

const TIMEOUT_MS = 20000;
/* GitHub's wording when the sha sent with a PUT is no longer the file's current sha */
const STALE_SHA_RE = /does not match|is at [0-9a-f]+ but expected|sha/i;

/* bodyweight last loaded per file URL. A save without a bodyweight key (a page that predates
   bodyweight logging, e.g. Q2-2026.html) keeps these rows instead of dropping the section. That
   is safe because the save is made against the loaded sha: if the file changed since, GitHub
   refuses it as a conflict. */
const LOADED_BODYWEIGHT = new Map();
/* the same for the Progression rules table (pages that predate editable rules: Q2-2026.html, a
   cached older H2-2026.html) */
const LOADED_RULES = new Map();
/* and for the Custom movements table */
const LOADED_CUSTOM = new Map();

/* cfg: {owner, repo, branch, path, token}. token may be empty for reads of a public repo. */
function makeStore(cfg, fetchImpl){
  const rawFetch = fetchImpl || ((...a) => fetch(...a));
  /* a weak signal must not leave a save hanging forever with later saves queued behind it */
  async function f(u, opts){
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try{ return await rawFetch(u, ctl ? {...opts, signal: ctl.signal} : opts); }
    catch(e){ throw e && e.name === 'AbortError' ? new Error('GitHub did not answer within 20 s') : e; }
    finally{ if(timer) clearTimeout(timer); }
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = () => {
    const h = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
    if(cfg.token) h['Authorization'] = `Bearer ${cfg.token}`;
    return h;
  };
  async function fail(r){
    let msg = r.status + '';
    try{ msg = (await r.json()).message || msg; }catch(_){}
    if(r.status === 401) msg = 'GitHub token rejected (expired or revoked?)';
    if(r.status === 404) msg = `${cfg.path} not found on branch ${cfg.branch} of ${cfg.owner}/${cfg.repo}, or the token can't see it`;
    if(r.status === 403 && /rate limit/i.test(msg)) msg = 'GitHub rate limit hit: add a token in Settings';
    throw new Error(msg);
  }
  return {
    /* -> {data, sha} */
    async load(){
      const r = await f(`${url}?ref=${encodeURIComponent(cfg.branch)}`, {headers: headers(), cache: 'no-store'});
      if(!r.ok) await fail(r);
      const body = await r.json();
      if(body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string' || !body.content)
        throw new Error(`${cfg.path} is not a readable file (over 1 MB, or a folder?)`);
      const data = parse(b64decode(body.content));
      validate(data);
      LOADED_BODYWEIGHT.set(url, data.bodyweight);
      LOADED_RULES.set(url, data.rules);
      LOADED_CUSTOM.set(url, data.custom);
      return {data, sha: body.sha};
    },
    /* commit data as progress.md on top of sha -> new sha. Throws ConflictError if sha is stale. */
    async save(data, sha, message){
      if(data && data.bodyweight === undefined && LOADED_BODYWEIGHT.get(url))
        data = {...data, bodyweight: LOADED_BODYWEIGHT.get(url)};
      if(data && data.rules === undefined && LOADED_RULES.get(url))
        data = {...data, rules: LOADED_RULES.get(url)};
      if(data && data.custom === undefined && LOADED_CUSTOM.get(url))
        data = {...data, custom: LOADED_CUSTOM.get(url)};
      validate(data);
      const r = await f(url, {
        method: 'PUT', headers: {...headers(), 'Content-Type': 'application/json'},
        body: JSON.stringify({message, content: b64encode(serialize(data)), sha, branch: cfg.branch}),
      });
      if(r.status === 409 || r.status === 422){
        let msg = '';
        try{ msg = (await r.json()).message || ''; }catch(_){}
        if(STALE_SHA_RE.test(msg)) throw new ConflictError('progress.md changed on GitHub since this page loaded');
        throw new Error(msg || String(r.status));
      }
      if(!r.ok) await fail(r);
      LOADED_BODYWEIGHT.set(url, data.bodyweight);
      LOADED_RULES.set(url, data.rules);
      LOADED_CUSTOM.set(url, data.custom);
      return (await r.json()).content.sha;
    },
  };
}

const api = {CUSTOM_COLUMNS, parse, serialize, validate, makeStore, ConflictError, b64encode, b64decode};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Progress = api;
})(typeof window !== 'undefined' ? window : globalThis);
