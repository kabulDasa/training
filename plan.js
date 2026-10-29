/* Today Plan maths for H2-2026.html: warm-up ladders, working sets, and how long ago each
   movement was trained. Pure functions of the working sets (STATE) and the session log (HISTORY),
   so the node tests can check them. Loaded as a plain <script> in the page and with require() in
   the node tests. */
(function(root){
'use strict';

const DAY_MS = 86400000;
/* trained within FRESH_DAYS = green, within DUE_DAYS = amber, older (or never) = red */
const FRESH_DAYS = 7, DUE_DAYS = 14;
const BAR = 20;
const DAYS = ['pull', 'push', 'legs'];

/* how each movement is prescribed: belt = weighted calisthenics (top set + backoff, load is
   added weight), squat = barbell top set + backoff, barbell = barbell sets × reps,
   accessory = dumbbell/cable sets × reps */
const KIND = {
  pullup:'belt', dip:'belt', squat:'squat', ohp:'barbell', frontsquat:'barbell',
  latpulldown:'accessory', invertedrow:'accessory', bicepcurl:'accessory', facepull:'accessory', shoulderfly:'accessory', chestfly:'accessory', tricepext:'accessory',
  latpulldownboth:'accessory', invertedrowboth:'accessory', bicepcurlboth:'accessory', shoulderflysingle:'accessory', chestflyboth:'accessory', tricepextsingle:'accessory',
};
/* loadable increment of each top-set lift's backoff */
const BACKOFF_INC = {pullup:1.25, dip:1.25, squat:2.5};
const TOP_REPS = {squat:3};
const BACKOFF_REPS = 5, BACKOFF_TAPS = 5, BACKOFF_TARGET = 2;

function round2(x){ return Math.round(x*100)/100; }
function roundTo(x, inc){ return round2(Math.round(x/inc)*inc); }
/* backoff load = 80% of top-set weight, rounded to the nearest loadable increment */
function backoffOf(weight, inc){ return roundTo(weight*0.8, inc); }

/* ---------- warm-up ladders ---------- */
/* weighted pull-up / dip: bodyweight, then 2-3 evenly spaced belt loads below the top set */
function calWarmups(belt){
  if(!belt) return [];
  const n = Math.min(3, Math.max(2, Math.floor(belt/3)));
  const pts = [];
  for(let i=1;i<=n;i++) pts.push(Math.round(belt*i/(n+1)/1.25)*1.25);
  return [0,...pts];
}
/* squat: empty bar, then roughly even 5 kg jumps toward the top set */
function squatWarmups(working){
  if(working<=BAR+10) return [BAR];
  const step = Math.max(5, Math.round((working-BAR)/3/5)*5);
  const pts = [];
  for(let s=BAR;s<working;s+=step) pts.push(s);
  return pts;
}
/* other barbell lifts: empty bar, then ~50/70/85% with at least 5 kg between jumps */
function barbellWarmups(working){
  if(working<=BAR) return [];
  const pts = [BAR];
  for(const p of [0.5, 0.7, 0.85]){
    const w = roundTo(working*p, 2.5);
    if(w >= pts[pts.length-1]+5 && w < working) pts.push(w);
  }
  return pts;
}
/* dumbbell / cable: one feeler set at about half the working weight */
function accessoryWarmups(working){
  return working >= 5 ? [roundTo(working*0.5, 1.25)] : [];
}
/* fewer reps as the ramp gets heavier: 5, 3, 2, then singles */
function rampReps(i){ return [5, 3, 2][i] || 1; }

/* [{load, reps}] for a movement's warm-up; load is added belt weight for belt lifts (0 = BW) */
function warmups(key, s){
  switch(KIND[key]){
    case 'belt':    return calWarmups(s.weight).map((load,i)=>({load, reps: rampReps(i)}));
    case 'squat':   return squatWarmups(s.weight).map((load,i)=>({load, reps: rampReps(i)}));
    case 'barbell': return barbellWarmups(s.weight).map((load,i)=>({load, reps: rampReps(i)}));
    case 'accessory': return accessoryWarmups(s.weight).map(load=>({load, reps: 10}));
    default: return [];
  }
}

/* the working part of a movement: an optional top set, then the tappable sets. target is how
   many tapped sets count as success; sets past it are bonus sets (double progression). */
function workingSets(key, s){
  const kind = KIND[key];
  if(kind==='belt' || kind==='squat'){
    const load = backoffOf(s.weight, BACKOFF_INC[key]);
    return {
      top: {load: s.weight, reps: TOP_REPS[key] || s.reps},
      sets: Array.from({length: BACKOFF_TAPS}, (_,i)=>({load, reps: BACKOFF_REPS, bonus: i>=BACKOFF_TARGET})),
      target: BACKOFF_TARGET,
    };
  }
  return {
    top: null,
    sets: Array.from({length: s.sets}, ()=>({load: s.weight, reps: s.reps, bonus: false})),
    target: s.sets,
  };
}
function isAdded(key){ return KIND[key]==='belt'; }

/* ---------- arm variants ---------- */
/* starting working set for an arm variant that has none yet, from its sibling's (the other arm
   variant's) working set: same reps and sets, about half the load for single arm or double for
   both arms, rounded to 1.25 kg. startWeight, when given, is the load to use instead. */
function seedVariant(sibling, arms, startWeight){
  const weight = startWeight != null ? startWeight
    : roundTo(arms === 'single' ? sibling.weight / 2 : sibling.weight * 2, 1.25);
  return {...sibling, weight};
}

/* ---------- freshness ---------- */
/* ISO date of the newest log for key, or null. keyOf maps an exercise name to its key. */
function lastTrained(history, key, keyOf){
  for(let i=history.length-1;i>=0;i--) if(keyOf(history[i].exercise)===key) return history[i].date;
  return null;
}
/* {days, level}: level is fresh / due / stale / never */
function freshness(lastIso, now){
  if(!lastIso) return {days: null, level: 'never'};
  const days = Math.max(0, Math.floor((now - new Date(lastIso).getTime())/DAY_MS));
  return {days, level: days<=FRESH_DAYS ? 'fresh' : days<=DUE_DAYS ? 'due' : 'stale'};
}
function ageLabel(days){
  if(days==null) return 'never';
  if(days===0) return 'today';
  if(days<14) return days + ' d ago';
  return Math.floor(days/7) + ' wk ago';
}

/* the day whose newest log is oldest (never-trained days first); ties go to program order.
   dayKeys(day) lists a day's current movements (Movements.movementsFor). */
function suggestDay(dayKeys, history, keyOf){
  let best = null, bestT = Infinity;
  for(const day of DAYS){
    const keys = dayKeys(day);
    if(!keys.length) continue;
    const t = Math.max(...keys.map(k=>{ const d = lastTrained(history, k, keyOf); return d ? new Date(d).getTime() : -Infinity; }));
    if(t < bestT){ best = day; bestT = t; }
  }
  return best;
}

/* chips before the working sets (warm-ups, then the top set), which are a checklist only */
function checklistLength(key, s){ return warmups(key, s).length + (workingSets(key, s).top ? 1 : 0); }
/* Finish logs only planned movements with at least one chip ticked; the rest are skipped, so
   their working set and freshness stay as they were. ticked(key) = number of ticked chips. */
function splitFinish(plan, ticked){
  const log = [], skip = [];
  plan.forEach(key=>(ticked(key) > 0 ? log : skip).push(key));
  return {log, skip};
}

const api = {
  DAYS, KIND, FRESH_DAYS, DUE_DAYS, backoffOf, calWarmups, squatWarmups, barbellWarmups, accessoryWarmups,
  warmups, workingSets, isAdded, lastTrained, freshness, ageLabel, suggestDay, checklistLength, splitFinish,
  seedVariant,
};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Plan = api;
})(typeof window !== 'undefined' ? window : globalThis);
