import { parseLocal, addDays } from './dates.js';
/** Event bounds. All-day `end` is stored inclusive and returned exclusive. */
export function bounds(ev) {
  const s = parseLocal(ev.start);
  let e;
  if (ev.allDay) e = addDays(parseLocal(ev.end || ev.start), 1);
  else e = ev.end ? parseLocal(ev.end) : new Date(s.getTime() + 3600000);
  if (!(e > s)) e = ev.allDay ? addDays(s, 1) : new Date(s.getTime() + 3600000);
  return [s, e];
}
/** Expand an event into occurrences overlapping [from, to). */
export function occurrences(ev, from, to) {
  const [s, e] = bounds(ev);
  if (isNaN(s)) return [];
  const dur = e - s, out = [];
  const push = st => { const en = new Date(st.getTime() + dur); if (en > from && st < to) out.push({ ev, start: st, end: en }); };
  const r = ev.rrule;
  if (!r) { push(s); return out; }
  const step = r.interval || 1, until = r.until ? addDays(parseLocal(r.until), 1) : null;
  let n = 0;
  for (let i = 0; i < 20000; i++) {
    let st;
    if (r.freq === 'daily') st = addDays(s, i * step);
    else if (r.freq === 'weekly') st = addDays(s, 7 * i * step);
    else {
      const mo = r.freq === 'monthly' ? i * step : 12 * i * step;
      st = new Date(s.getFullYear(), s.getMonth() + mo, s.getDate(), s.getHours(), s.getMinutes());
      if (st.getDate() !== s.getDate()) continue; // Jan 31 -> skip months without a 31st
    }
    if (st >= to || (until && st >= until)) break;
    n++;
    if (r.count && n > r.count) break;
    push(st);
  }
  return out;
}
