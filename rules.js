/* Progression rules for H2-2026.html: how each movement is prescribed and how a logged session moves
   its working set. A rule per movement key (each arm variant has its own):
     scheme       'topset'   = one top set (working set weight × reps), then backoff sets at backoffPct %
                               of it, rounded to backoffRound kg, backoffReps reps each; backoffSets of
                               them is the target and up to backoffMax can be ticked (the rest are bonus)
                  'straight' = working set sets × reps, all sets is the target
     progression  'linear'   = success adds inc kg (a top-set lift that beats its backoff target adds
                               bonusInc instead)
                  'double'   = success adds 1 rep (top-set reps for a top-set lift) up to repCap; a
                               success at the cap adds inc kg and resets reps to repFloor
   Fields a rule doesn't use are null. DEFAULT_RULES are the program's rules; progress.md can override
   any of them in its optional Progression rules table (progress.js), and only rules that differ from
   the default are stored there. Loaded as a plain <script> in the page and with require() in the node
   tests. */
(function(root){
'use strict';

const Movements = root.Movements || require('./movements.js');

const SCHEMES = {topset: 'Top set + backoff', straight: 'Straight sets'};
const PROGRESSIONS = {linear: 'Linear', double: 'Double progression'};
const FIELDS = ['scheme', 'progression', 'inc', 'bonusInc', 'repFloor', 'repCap',
  'backoffPct', 'backoffReps', 'backoffSets', 'backoffMax', 'backoffRound'];
/* the fields each part of a rule uses */
const TOPSET_FIELDS = ['backoffPct', 'backoffReps', 'backoffSets', 'backoffMax', 'backoffRound'];
const DOUBLE_FIELDS = ['repFloor', 'repCap'];

function round2(x){ return Math.round(x*100)/100; }
function fmt(v){ return round2(v).toFixed(2).replace(/\.?0+$/, ''); }

/* ---------- defaults (the program as it was hard-coded before rules were editable) ---------- */
function topset(inc, bonusInc, backoffRound){
  return normalize({scheme: 'topset', progression: 'linear', inc, bonusInc,
    backoffPct: 80, backoffReps: 5, backoffSets: 2, backoffMax: 5, backoffRound});
}
function straightDouble(inc, repFloor, repCap){ return normalize({scheme: 'straight', progression: 'double', inc, repFloor, repCap}); }
function straightLinear(inc){ return normalize({scheme: 'straight', progression: 'linear', inc}); }

const DEFAULT_RULES = {
  pullup:      topset(1.25, 2.5, 1.25),
  latpulldown: straightDouble(1.25, 10, 20),
  invertedrow: straightDouble(2.5, 5, 15),
  bicepcurl:   straightDouble(2.5, 10, 20),
  facepull:    straightDouble(1.25, 10, 20),
  dip:         topset(1.25, 2.5, 1.25),
  ohp:         straightDouble(2.5, 3, 7),
  shoulderfly: straightDouble(1.25, 10, 20),
  chestfly:    straightDouble(1.25, 8, 20),
  tricepext:   straightDouble(2.5, 10, 20),
  squat:       topset(2.5, 5, 2.5),
  frontsquat:  straightLinear(2.5),
};
/* an arm variant starts with its movement's rule */
for(const [key, m] of Object.entries(Movements.MOVEMENTS))
  if(m.variantOf && DEFAULT_RULES[m.variantOf]) DEFAULT_RULES[key] = {...DEFAULT_RULES[m.variantOf]};
/* single arm or single leg work always adds 1.25 kg, whatever the two-limb variant adds */
for(const [key, m] of Object.entries(Movements.MOVEMENTS))
  if(m.arms === 'single' && DEFAULT_RULES[key]) DEFAULT_RULES[key].inc = 1.25;

/* ---------- shape and validation ---------- */
/* every field present, the ones this rule's scheme / progression don't use set to null */
function normalize(rule){
  const out = {};
  for(const f of FIELDS) out[f] = rule[f] == null ? null : rule[f];
  if(out.scheme !== 'topset'){ for(const f of TOPSET_FIELDS) out[f] = null; }
  if(out.progression !== 'double'){ for(const f of DOUBLE_FIELDS) out[f] = null; }
  if(out.scheme !== 'topset' || out.progression !== 'linear') out.bonusInc = null;
  return out;
}
function isNum(v){ return typeof v === 'number' && Number.isFinite(v); }
function isInt(v, lo, hi){ return Number.isInteger(v) && v >= lo && v <= hi; }
function inRange(v, lo, hi){ return isNum(v) && v > lo && v <= hi; }

/* everything wrong with a rule, as sentences for the user ([] when it is usable). A missing scheme
   or progression is reported, and the fields that depend on it are checked once it is chosen. */
function problems(rule){
  if(!rule || typeof rule !== 'object') return ['not a rule'];
  const out = [];
  const scheme = Object.hasOwn(SCHEMES, rule.scheme), prog = Object.hasOwn(PROGRESSIONS, rule.progression);
  if(!scheme) out.push('scheme must be top set + backoff or straight sets');
  if(!prog) out.push('progression must be linear or double progression');
  if(!inRange(rule.inc, 0, 50)) out.push('increment must be more than 0 and at most 50 kg');
  if(rule.scheme === 'topset'){
    if(!inRange(rule.backoffPct, 0, 100)) out.push('backoff % must be more than 0 and at most 100');
    if(!isInt(rule.backoffReps, 1, 50)) out.push('backoff reps must be a whole number from 1 to 50');
    if(!isInt(rule.backoffSets, 1, 10)) out.push('backoff sets (target) must be a whole number from 1 to 10');
    if(!isInt(rule.backoffMax, isInt(rule.backoffSets, 1, 10) ? rule.backoffSets : 1, 10)) out.push('most backoff sets must be a whole number from the target to 10');
    if(!inRange(rule.backoffRound, 0, 25)) out.push('backoff rounding must be more than 0 and at most 25 kg');
    if(rule.progression === 'linear' && !(isNum(rule.bonusInc) && rule.bonusInc >= rule.inc && rule.bonusInc <= 50))
      out.push('bonus increment must be at least the increment and at most 50 kg');
  }
  if(rule.progression === 'double'){
    if(!isInt(rule.repFloor, 1, 99)) out.push('rep floor must be a whole number from 1 to 99');
    if(!isInt(rule.repCap, isInt(rule.repFloor, 1, 99) ? rule.repFloor + 1 : 2, 100)) out.push('rep cap must be a whole number above the rep floor, at most 100');
  }
  return out;
}
/* the first thing wrong with a rule, as a sentence for the user, or null when it is usable */
function problem(rule){ return problems(rule)[0] || null; }

function sameRule(a, b){ return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)); }
function isDefault(key, rule){ return !!DEFAULT_RULES[key] && sameRule(DEFAULT_RULES[key], rule); }

/* a custom movement (movements.js setCustom) has no default: its rule is always stored. Until a
   usable one is, it follows this stand-in (and Settings says why). */
const CUSTOM_FALLBACK = straightDouble(2.5, 8, 12);

/* {rules, errors}: the rule in force for every movement key, built-in and registered custom (a
   stored rule when it is usable, else the default) and a message for each stored rule that was
   ignored or custom movement without a usable rule. stored is progress.md's Progression rules table
   ({key: rule}), possibly hand-edited. */
function effective(stored){
  const rules = {}, errors = {};
  const has = key => !!stored && Object.hasOwn(stored, key);
  for(const key of Object.keys(DEFAULT_RULES)){
    const s = has(key) ? stored[key] : null;
    const err = s ? problem(s) : null;
    if(err) errors[key] = err;
    rules[key] = s && !err ? normalize(s) : {...DEFAULT_RULES[key]};
  }
  for(const key of Movements.customKeys()){
    const err = has(key) ? problem(stored[key]) : 'no progression rule stored';
    if(err) errors[key] = err;
    rules[key] = err ? {...CUSTOM_FALLBACK} : normalize(stored[key]);
  }
  for(const key of Object.keys(stored || {}))
    if(!Object.hasOwn(rules, key)) errors[key] = 'no such movement';
  return {rules, errors};
}

/* ---------- applying a rule ---------- */
/* hold below the target, normal at it, double past it (only a top-set lift can tick past it) */
function outcomeFromCount(n, target){
  if(n < target) return 'hold';
  if(n === target) return 'normal';
  return 'double';
}

/* move working set s (in place) after a session with this outcome */
function advance(rule, outcome, s){
  if(outcome !== 'normal' && outcome !== 'double') return;
  if(rule.progression === 'linear'){
    const bonus = outcome === 'double' && rule.scheme === 'topset' && rule.bonusInc != null;
    s.weight = round2(s.weight + (bonus ? rule.bonusInc : rule.inc));
    return;
  }
  if(s.reps < rule.repCap) s.reps += 1;
  else { s.weight = round2(s.weight + rule.inc); s.reps = rule.repFloor; }
}

/* the working set with what the rule needs filled in, without touching what is there: a top-set
   lift needs its top-set reps, straight sets need reps and sets (after a scheme switch, say) */
function fitState(rule, s){
  const out = {...s};
  const reps = rule.progression === 'double' ? rule.repFloor : rule.scheme === 'topset' ? 3 : 5;
  if(!isNum(out.reps) || out.reps < 1) out.reps = reps;
  if(rule.scheme === 'straight' && (!isNum(out.sets) || out.sets < 1)) out.sets = 3;
  return out;
}

/* ---------- text ---------- */
/* how the rule progresses, as Settings and the Program card cues show it */
function describe(rule){
  const t = rule.backoffSets;
  if(rule.scheme === 'topset'){
    if(rule.progression === 'double')
      return `Under ${t} backoff sets: hold. ${t} or more: add 1 top-set rep until ${rule.repCap}; then add ${fmt(rule.inc)} kg and reset to ${rule.repFloor} reps.`;
    if(rule.bonusInc === rule.inc)
      return `Under ${t} backoff sets: hold. ${t} or more: add ${fmt(rule.inc)} kg.`;
    return `Under ${t} backoff sets: hold. Exactly ${t}: add ${fmt(rule.inc)} kg. More than ${t}: add ${fmt(rule.bonusInc)} kg.`;
  }
  if(rule.progression === 'double')
    return `On success, add 1 rep until ${rule.repCap}; then add ${fmt(rule.inc)} kg and reset to ${rule.repFloor} reps.`;
  return `Complete all sets at target to add ${fmt(rule.inc)} kg; otherwise hold.`;
}
/* the backoff part of a top-set rule, e.g. "Backoff: 2 sets of 5 @ 80% of the top set (up to 5)" */
function backoffText(rule){
  if(rule.scheme !== 'topset') return '';
  return `Backoff: ${rule.backoffSets} set${rule.backoffSets === 1 ? '' : 's'} of ${rule.backoffReps} @ ${fmt(rule.backoffPct)}% of the top set, rounded to ${fmt(rule.backoffRound)} kg`
    + (rule.backoffMax > rule.backoffSets ? ` (up to ${rule.backoffMax})` : '');
}
/* one line for a commit message, e.g. "straight sets, double 10–20 reps, +1.25 kg" */
function summary(rule){
  const scheme = rule.scheme === 'topset'
    ? `top set + ${rule.backoffSets}×${rule.backoffReps} backoff @ ${fmt(rule.backoffPct)}%`
    : 'straight sets';
  const prog = rule.progression === 'double'
    ? `double ${rule.repFloor}–${rule.repCap} reps, +${fmt(rule.inc)} kg`
    : `linear +${fmt(rule.inc)} kg` + (rule.scheme === 'topset' && rule.bonusInc !== rule.inc ? ` (+${fmt(rule.bonusInc)} kg past ${rule.backoffSets} backoff sets)` : '');
  return `${scheme}, ${prog}`;
}
/* what this outcome does to working set s next session, for the outcome badge.
   loadText(kg) formats a load (e.g. "+20 kg" for belt weight). */
function nextText(rule, outcome, s, loadText){
  const load = loadText || (kg => `${fmt(kg)} kg`);
  if(outcome !== 'normal' && outcome !== 'double') return `Hold — repeat ${load(s.weight)} × ${s.reps}`;
  const next = {...s};
  advance(rule, outcome, next);
  if(next.weight !== s.weight)
    return `+${fmt(next.weight - s.weight)} kg → ${load(next.weight)}${next.reps !== s.reps ? ` × ${next.reps}` : ''} next`;
  return `+1 rep → ${next.reps} reps next`;
}

const api = {
  SCHEMES, PROGRESSIONS, FIELDS, DEFAULT_RULES, CUSTOM_FALLBACK, normalize, problems, problem, sameRule, isDefault, effective,
  outcomeFromCount, advance, fitState, describe, backoffText, summary, nextText,
};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Rules = api;
})(typeof window !== 'undefined' ? window : globalThis);
