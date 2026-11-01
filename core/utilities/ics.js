import { parseLocal, addDays, ymd, ymdhm } from './dates.js';
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const cmp = s => s.replace(/[-:]/g, '');
const fold = l => { const o = []; while (l.length > 73) { o.push(l.slice(0, 73)); l = ' ' + l.slice(73); } o.push(l); return o.join('\r\n'); };
const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };

/** Export a calendar document as iCalendar. Times are floating local times (no TZID). */
export function toICS(doc) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dr3amy//Calendar 1.0//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(doc.metadata.name)];
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  for (const ev of doc.data.events) {
    L.push('BEGIN:VEVENT', 'UID:' + ev.id + '@dr3amy', 'DTSTAMP:' + stamp, 'SUMMARY:' + esc(ev.title));
    if (ev.allDay) L.push('DTSTART;VALUE=DATE:' + cmp(ev.start), 'DTEND;VALUE=DATE:' + cmp(ymd(addDays(parseLocal(ev.end || ev.start), 1))));
    else { L.push('DTSTART:' + cmp(ev.start) + '00'); if (ev.end) L.push('DTEND:' + cmp(ev.end) + '00'); }
    if (ev.location) L.push('LOCATION:' + esc(ev.location));
    if (ev.description) L.push('DESCRIPTION:' + esc(ev.description));
    const cat = doc.data.categories.find(c => c.id === ev.category);
    if (cat) L.push('CATEGORIES:' + esc(cat.name));
    if (ev.rrule) {
      let r = 'RRULE:FREQ=' + FREQ[ev.rrule.freq];
      if (ev.rrule.interval > 1) r += ';INTERVAL=' + ev.rrule.interval;
      if (ev.rrule.count) r += ';COUNT=' + ev.rrule.count;
      if (ev.rrule.until) r += ';UNTIL=' + cmp(ev.rrule.until);
      L.push(r);
    }
    if (ev.reminder != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(ev.title), 'TRIGGER:-PT' + ev.reminder + 'M', 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

function dt(v, params) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  if (!m[4] || /VALUE=DATE(?!-)/i.test(params || '')) return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
  if (m[7]) return { date: ymdhm(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]))), allDay: false };
  return { date: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, allDay: false };
}

/** Parse VEVENTs from iCalendar text. Unsupported properties are ignored. */
export function fromICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null, alarm = false;
  for (const raw of lines) {
    const ln = raw.trim();
    if (ln === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (ln === 'END:VEVENT') { if (cur) { const e = build(cur); if (e) out.push(e); } cur = null; continue; }
    if (!cur) continue;
    if (ln === 'BEGIN:VALARM') { alarm = true; continue; }
    if (ln === 'END:VALARM') { alarm = false; continue; }
    const i = ln.indexOf(':'); if (i < 0) continue;
    const [name, ...pr] = ln.slice(0, i).split(';');
    cur[(alarm ? 'ALARM_' : '') + name.toUpperCase()] = { v: ln.slice(i + 1), p: pr.join(';') };
  }
  return out;
}
function build(c) {
  const s = c.DTSTART && dt(c.DTSTART.v, c.DTSTART.p);
  if (!s) return null;
  const ev = { id: crypto.randomUUID(), title: unesc(c.SUMMARY?.v || 'Untitled'), allDay: s.allDay, start: s.date, category: 'default' };
  const e = c.DTEND && dt(c.DTEND.v, c.DTEND.p);
  if (s.allDay) { const end = e ? ymd(addDays(parseLocal(e.date), -1)) : s.date; ev.end = end < s.date ? s.date : end; }
  else if (e && e.date > s.date) ev.end = e.date;
  if (c.LOCATION) ev.location = unesc(c.LOCATION.v);
  if (c.DESCRIPTION) ev.description = unesc(c.DESCRIPTION.v);
  if (c.RRULE) {
    const o = Object.fromEntries(c.RRULE.v.split(';').map(x => x.split('=')));
    const f = (o.FREQ || '').toLowerCase();
    if (FREQ[f]) {
      ev.rrule = { freq: f };
      if (+o.INTERVAL > 1) ev.rrule.interval = +o.INTERVAL;
      if (+o.COUNT > 0) ev.rrule.count = +o.COUNT;
      const u = o.UNTIL && dt(o.UNTIL, '');
      if (u) ev.rrule.until = u.date.slice(0, 10);
    }
  }
  if (c.ALARM_TRIGGER) { const m = /^-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i.exec(c.ALARM_TRIGGER.v); if (m) ev.reminder = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0); }
  return ev;
}
