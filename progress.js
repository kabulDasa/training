/* progress.md format + GitHub storage for Q2-2026.html.
   progress.md holds two Markdown tables: "Current working sets" (Key | Weight | Reps | Sets) and
   "Session log" (oldest first, one row per logged session). The page reads and writes it through
   the GitHub contents API on the repo's `data` branch, so every save is a commit there and never
   touches `main`, which GitHub Pages serves the site from. Loaded as a plain <script> in the page and
   with require() in the node tests. */
(function(root){
'use strict';

const STATE_FIELDS = ['weight', 'reps', 'sets'];
const HISTORY_FIELDS = ['date', 'exercise', 'result', 'outcome', 'weight', 'volume'];
const OUTCOMES = ['hold', 'normal', 'double'];
const KEY_RE = /^[a-z][a-z0-9]*$/;

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
    const [date, exercise, result, outcome, weight, volume] = HISTORY_FIELDS.map((_, i) => row[i] || '');
    return {date, exercise, result, outcome, weight: num(weight), volume: num(volume)};
  });
  return {state, history};
}

function serialize(data){
  const lines = [HEADER, '## Current working sets', '',
    '| Key | Weight (kg) | Reps | Sets |', '|---|---|---|---|'];
  for(const [key, entry] of Object.entries(data.state))
    lines.push('| ' + [key, ...STATE_FIELDS.map(f => fmt(entry[f]))].join(' | ') + ' |');
  lines.push('', '## Session log', '',
    '| Date | Exercise | Result | Outcome | Weight (kg) | Volume (kg × reps) |',
    '|---|---|---|---|---|---|');
  for(const h of data.history)
    lines.push('| ' + [cell(h.date), cell(h.exercise), cell(h.result), h.outcome, fmt(h.weight), fmt(h.volume)].join(' | ') + ' |');
  return lines.join('\n') + '\n';
}

function isNum(v){ return typeof v === 'number' && Number.isFinite(v); }

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
      return {data, sha: body.sha};
    },
    /* commit data as progress.md on top of sha -> new sha. Throws ConflictError if sha is stale. */
    async save(data, sha, message){
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
      return (await r.json()).content.sha;
    },
  };
}

const api = {parse, serialize, validate, makeStore, ConflictError, b64encode, b64decode};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Progress = api;
})(typeof window !== 'undefined' ? window : globalThis);
