/* Which lines a chart shows, for the H2 Chart tab's clickable legends. selected is the set of series
   ids the user picked; none picked means every line shows. Loaded as a plain <script> in the page
   and with require() in the node tests. */
(function(root){
'use strict';

/* selected with id added, or taken out if it was in (taking out the last one shows every line again) */
function toggle(selected, id){
  const next = new Set(selected);
  if(!next.delete(id)) next.add(id);
  return next;
}
/* the series to draw: the picked ones, or all when no picked series is in the list (its only log
   may have been undone) */
function visible(series, selected){
  const picked = series.filter(s=>selected.has(s.id));
  return picked.length ? picked : series;
}

const api = {toggle, visible};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.ChartSelect = api;
})(typeof window !== 'undefined' ? window : globalThis);
