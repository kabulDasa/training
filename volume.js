/* Weekly working sets per movement pattern, from the session log, for the H2 Chart tab.
   Working sets are read from each log's result text: main lifts are the top set plus the backoff sets
   ("3 reps top @ +25 kg, 2×5 backoff @ +20 kg" = 3), skill work with a band is the top set plus the
   backoffs ("Green band × 3, 3 backoff" = 4), everything else is "<sets> × <reps>" (the prescribed sets:
   a hold still logs them all, since the sets were done, just short of the target reps). Each working set
   counts once, to its movement's pattern (movements.js); retired skill movements still count.
   Weeks are ISO weeks (Monday to Sunday) in local time, so a session counts in the week it was trained.
   Loaded as a plain <script> in the page and with require() in the node tests. */
(function(root){
'use strict';

const Movements = root.Movements || require('./movements.js');

/* working sets in one logged result, or 0 when the text isn't in a known shape */
function setsOf(result){
  const text = String(result || '');
  let m = text.match(/\btop @[^,]*,\s*(\d+)\s*×\s*\d+\s*backoff/);
  if(m) return 1 + Number(m[1]);
  m = text.match(/×\s*\d+,\s*(\d+)\s*backoff/);
  if(m) return 1 + Number(m[1]);
  m = text.match(/(?:^|—\s*)(\d+)\s*×/);
  return m ? Number(m[1]) : 0;
}

/* local date of the Monday starting the ISO week that holds `date`, as YYYY-MM-DD */
function weekStart(date){
  const d = new Date(date);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
  const pad = n => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function nextWeek(week){
  const [y, mo, d] = week.split('-').map(Number);
  return weekStart(new Date(y, mo - 1, d + 7));
}

/* {weeks: [{week, sets: {pattern: n}}], skipped} from the oldest logged week through the week of
   `now`, with no gaps (a week with nothing logged has empty sets). skipped counts logs that couldn't
   be credited: an unknown exercise name or a result with no set count. */
function weeklyByPattern(history, now = new Date()){
  const byWeek = {};
  let skipped = 0;
  for(const h of history){
    const key = Movements.EXERCISE_KEY[h.exercise];
    const sets = setsOf(h.result);
    const time = new Date(h.date);
    if(!key || !sets || isNaN(time)){ skipped++; continue; }
    const week = weekStart(time), pattern = Movements.MOVEMENTS[key].pattern;
    byWeek[week] = byWeek[week] || {};
    byWeek[week][pattern] = (byWeek[week][pattern] || 0) + sets;
  }
  const logged = Object.keys(byWeek).sort();
  if(logged.length === 0) return {weeks: [], skipped};
  const last = [logged[logged.length - 1], weekStart(now)].sort()[1];
  const weeks = [];
  for(let w = logged[0]; w <= last; w = nextWeek(w)) weeks.push({week: w, sets: byWeek[w] || {}});
  return {weeks, skipped};
}

/* mean sets per week for each pattern over the last `n` weeks before the current one */
function recentAverage(weeks, n = 4){
  const done = weeks.slice(0, -1).slice(-n);
  const avg = {};
  for(const p of Object.keys(Movements.PATTERNS))
    avg[p] = done.length ? done.reduce((s, w) => s + (w.sets[p] || 0), 0) / done.length : null;
  return avg;
}

const api = {setsOf, weekStart, weeklyByPattern, recentAverage};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Volume = api;
})(typeof window !== 'undefined' ? window : globalThis);
