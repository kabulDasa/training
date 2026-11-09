/* Peak planner for H2-2026.html: from each main lift's newest logged top set (and its RPE), an
   estimated 1RM, a week-by-week taper from triples to singles up to a competition date, and the three
   attempts for that day. Pure functions of the session log, bodyweight and the competition date, so
   the node tests can check them. Loaded as a plain <script> in the page and with require() in the node
   tests.

   Weighted calisthenics are estimated on the system load (bodyweight + belt), so a pull-up at +25 kg
   and 75 kg bodyweight is a 100 kg lift; loads are given back as belt weight. The %1RM for reps at an
   RPE is the usual RPE chart (1 rep at RPE 10 = 100%, each half RPE or extra rep about 1.5–2% less).
   A top set logged without an RPE is taken as RPE 9 (a hard triple). */
(function(root){
'use strict';

const DAY_MS = 86400000, WEEK_MS = 7*DAY_MS;
/* the main lifts the planner covers, in page order */
const LIFTS = ['pullup', 'dip', 'squat'];
const ASSUMED_RPE = 9;
/* e1RM gain per training week up to the taper, on the system load; conservative for a lifter
   whose linear gains just ran out. The last two weeks are a taper: no gain counted. */
const WEEKLY_GAIN = 0.005, TAPER_WEEKS = 2, MAX_GAIN_WEEKS = 12;

/* %1RM by (reps - 1)*2 + (10 - rpe)*2: one step per half RPE, two per rep */
const PCT = [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6,
  77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3];
/* fraction of 1RM that reps at rpe are, or null outside 1–10 reps, RPE 6–10 */
function pctOf(reps, rpe){
  if(!Number.isInteger(reps) || reps < 1 || reps > 10 || !(rpe >= 6 && rpe <= 10) || rpe*2 !== Math.round(rpe*2)) return null;
  return PCT[(reps - 1)*2 + (10 - rpe)*2] / 100;
}

/* {reps, load, rpe} from a top-set Result cell ("3 reps top @ +26.25 kg RPE 8, 2×3 backoff @ …";
   load is belt weight for weighted calisthenics, rpe null when none was logged), or null */
function parseTop(result){
  const m = /^(\d+) reps? top @ \+?(\d+(?:\.\d+)?) kg(?: RPE (\d+(?:\.5)?))?,/.exec(String(result == null ? '' : result).trim());
  if(!m) return null;
  return {reps: Number(m[1]), load: Number(m[2]), rpe: m[3] ? Number(m[3]) : null};
}
/* the newest top set logged for key: {date, reps, load, rpe}, or null. keyOf maps a log name to its key. */
function latestTop(history, key, keyOf){
  for(let i = history.length - 1; i >= 0; i--){
    if(keyOf(history[i].exercise) !== key) continue;
    const t = parseTop(history[i].result);
    if(t) return {date: history[i].date, ...t};
  }
  return null;
}

/* estimated 1RM (system load for a belt lift) from a top set; bw is needed for belt lifts */
function e1rm(top, bw, belt){
  const pct = pctOf(top.reps, top.rpe == null ? ASSUMED_RPE : top.rpe);
  if(!pct || (belt && !(bw > 0))) return null;
  return ((belt ? bw : 0) + top.load) / pct;
}
/* the load to put on for frac of a 1RM: belt weight for a belt lift (never below 0), rounded down to inc */
function loadFor(total, frac, bw, belt, inc){
  const raw = total*frac - (belt ? bw : 0);
  return Math.max(0, Math.round(Math.floor(raw/inc + 1e-9)*inc*100)/100);
}

/* the next competition on or after today (YYYY-MM-DD strings), or null */
function nextComp(competitions, today){
  const up = (competitions || []).filter(c => c.date >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return up[0] || null;
}
function utc(d){ return Date.parse(d + 'T00:00:00Z'); }
function iso(t){ return new Date(t).toISOString().slice(0, 10); }
/* Monday of the week a YYYY-MM-DD date falls in */
function mondayOf(d){
  const t = utc(d), wd = (new Date(t).getUTCDay() + 6) % 7;
  return iso(t - wd*DAY_MS);
}
/* whole weeks from today's week to the competition's week (0 = competition week) */
function weeksOut(today, compDate){ return Math.round((utc(mondayOf(compDate)) - utc(mondayOf(today))) / WEEK_MS); }

/* what a week w weeks out from the competition trains: the top set (reps @ rpe) and the backoffs
   (sets × reps @ pct of the top set) */
function phaseFor(w){
  if(w <= 0) return {phase: 'Competition', note: 'Three attempts', reps: null, rpe: null, backoff: null};
  if(w === 1) return {phase: 'Meet simulation', note: 'Opener single in full gear, filmed; nothing heavier', reps: 1, rpe: 7.5, backoff: null};
  if(w === 2) return {phase: 'Heavy single', note: 'About your second attempt; light backoffs', reps: 1, rpe: 9, backoff: {sets: 1, reps: 2, pct: 85}};
  if(w <= 5) return {phase: 'Peak', note: 'Top single, then backoffs', reps: 1, rpe: {5: 8, 4: 8.5, 3: 8.5}[w], backoff: {sets: 2, reps: 2, pct: 85}};
  if(w <= 8) return {phase: 'Strength', note: 'Top double, then backoffs', reps: 2, rpe: 8, backoff: {sets: 2, reps: 3, pct: 85}};
  return {phase: 'Build', note: 'Current program: top triple', reps: 3, rpe: 8, backoff: {sets: 2, reps: 3, pct: 85}};
}

/* attempts as a share of the competition-day e1RM: open where a bad day still makes it, a second
   that is a sure lift on a good day, a third at or just past the estimate (only if the second moved well) */
const ATTEMPTS = [['Opener', 0.92], ['Second', 0.97], ['Third', 1.01]];

/* the plan for one lift:
   opts {history, keyOf, key, bw, belt, inc, today (YYYY-MM-DD), comp ({date, name} or null)}
   -> {top, assumedRpe, e1rmNow, maxNow, weeks: [...], e1rmComp, attempts: [...]} or {error} */
function plan(opts){
  const {history, keyOf, key, bw, belt, inc, today, comp} = opts;
  const top = latestTop(history, key, keyOf);
  if(!top) return {error: 'No top set logged yet.'};
  if(belt && !(bw > 0)) return {error: 'Log your bodyweight (Chart tab) to estimate a weighted lift.'};
  const now = e1rm(top, bw, belt);
  if(!now) return {error: `Can't estimate from ${top.reps} reps${top.rpe != null ? ` @ RPE ${top.rpe}` : ''} (the chart covers 1–10 reps at RPE 6–10).`};
  const out = {top, assumedRpe: top.rpe == null, e1rmNow: now, maxNow: loadFor(now, 1, bw, belt, inc), weeks: [], e1rmComp: null, attempts: []};
  if(!comp) return out;
  const total = weeksOut(today, comp.date);
  /* e1RM as projected for a week w out: 0.5% a week from now until the taper */
  const at = w => now * (1 + WEEKLY_GAIN*Math.min(MAX_GAIN_WEEKS, Math.max(0, total - Math.max(w, TAPER_WEEKS))));
  const start = utc(mondayOf(today));
  for(let w = total; w >= 0; w--){
    const p = phaseFor(w), est = at(w);
    const week = {weeksOut: w, start: iso(start + (total - w)*WEEK_MS), ...p, top: null, backoffLoad: null};
    if(p.reps){
      week.top = {reps: p.reps, rpe: p.rpe, load: loadFor(est, pctOf(p.reps, p.rpe), bw, belt, inc)};
      /* backoffs are a % of the top set's load as the tracker counts it (belt weight for a belt lift) */
      if(p.backoff) week.backoffLoad = loadFor(week.top.load, p.backoff.pct/100, 0, false, inc);
    }
    out.weeks.push(week);
  }
  out.e1rmComp = at(0);
  out.attempts = ATTEMPTS.map(([label, frac]) => ({label, frac, load: loadFor(out.e1rmComp, frac, bw, belt, inc)}));
  return out;
}

const api = {LIFTS, ASSUMED_RPE, WEEKLY_GAIN, pctOf, parseTop, latestTop, e1rm, loadFor, nextComp, mondayOf, weeksOut, phaseFor, plan};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Peak = api;
})(typeof window !== 'undefined' ? window : globalThis);
