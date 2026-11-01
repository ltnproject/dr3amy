import { h, icon, btn, iconBtn, modal, confirmBox, promptBox, empty, download, shareFile, pickFiles, toast, slug } from '../../core/utilities/ui.js';
import * as S from '../../core/storage/storage.js';
import * as E from '../../core/document-engine/engine.js';
import { occurrences } from '../../core/utilities/recurrence.js';
import { toICS, fromICS } from '../../core/utilities/ics.js';
import { addDays, startOfDay, startOfWeek, sameDay, ymd, ymdhm, parseLocal } from '../../core/utilities/dates.js';

const st = { view: null, cursor: new Date(), q: '', hidden: new Set() };

export default async function mount(root, ctx, params) {
  st.view ||= ctx.prefs.calView || 'month';
  let recs = (await S.allDocs()).filter(r => r.doc.$type === 'calendar').sort((a, b) => a.doc.metadata.name.localeCompare(b.doc.metadata.name));
  let rec = recs.find(r => r.id === params.doc) || recs.find(r => r.id === ctx.prefs.lastCalendar) || recs[0];
  const ws = +ctx.prefs.weekStart || 0, today = new Date();
  const tf = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !ctx.prefs.hour24 });
  const doc = () => rec.doc, cats = () => doc().data.categories;
  const color = ev => (cats().find(c => c.id === ev.category) || cats()[0] || { color: '#7c5cff' }).color;
  const persist = async () => { E.touch(doc()); await S.saveDoc(rec.id, doc(), Date.now()); };
  const reload = async () => { recs = (await S.allDocs()).filter(r => r.doc.$type === 'calendar').sort((a, b) => a.doc.metadata.name.localeCompare(b.doc.metadata.name)); rec = recs.find(r => r.id === rec?.id) || recs[0]; };
  const newCal = async () => {
    const n = await promptBox('New calendar', 'Name', recs.length ? 'New calendar' : 'Personal Calendar'); if (!n) return;
    const d = E.create('calendar', n); await S.saveDoc(d.metadata.id, d, Date.now()); await reload(); rec = recs.find(r => r.id === d.metadata.id); ctx.setPref('lastCalendar', rec.id); render();
  };

  function range() {
    const c = st.cursor;
    if (st.view === 'day') return [startOfDay(c), addDays(startOfDay(c), 1)];
    if (st.view === 'week') { const s = startOfWeek(c, ws); return [s, addDays(s, 7)]; }
    if (st.view === 'year') return [new Date(c.getFullYear(), 0, 1), new Date(c.getFullYear() + 1, 0, 1)];
    const s = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1), ws); return [s, addDays(s, 42)];
  }
  const matches = ev => { const q = st.q.trim().toLowerCase(); return !st.hidden.has(ev.category || cats()[0]?.id) && (!q || [ev.title, ev.location, ev.description].some(x => (x || '').toLowerCase().includes(q))); };
  const occs = (from, to) => doc().data.events.filter(matches).flatMap(ev => occurrences(ev, from, to)).sort((a, b) => a.start - b.start);
  const onDay = (list, d) => { const a = startOfDay(d), b = addDays(a, 1); return list.filter(o => o.start < b && o.end > a); };
  const title = () => { const c = st.cursor, o = { year: 'numeric' };
    if (st.view === 'day') return c.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (st.view === 'year') return String(c.getFullYear());
    if (st.view === 'week') { const [a, b] = range(); return a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + addDays(b, -1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    return c.toLocaleDateString(undefined, { month: 'long', ...o }); };
  const nav = dir => { const c = st.cursor, v = st.view; st.cursor = v === 'day' ? addDays(c, dir) : v === 'week' ? addDays(c, 7 * dir) : v === 'year' ? new Date(c.getFullYear() + dir, c.getMonth(), 1) : new Date(c.getFullYear(), c.getMonth() + dir, 1); render(); };
  const setView = v => { st.view = v; ctx.setPref('calView', v); render(); };

  const chip = o => h('button', { class: 'chip' + (o.ev.allDay ? ' ad' : ''), style: { '--c': color(o.ev), borderColor: color(o.ev) }, title: o.ev.title, onclick: e => { e.stopPropagation(); editor(o.ev); } }, (o.ev.allDay ? '' : tf(o.start) + ' ') + (o.ev.title || '(untitled)'));

  function monthView() {
    const [from, to] = range(), list = occs(from, to), days = [...Array(42)].map((_, i) => addDays(from, i));
    return h('div', {}, h('div', { class: 'mhead' }, days.slice(0, 7).map(d => h('div', {}, d.toLocaleDateString(undefined, { weekday: 'short' })))),
      h('div', { class: 'mgrid' }, days.map(d => { const ev = onDay(list, d);
        return h('div', { class: 'cell' + (d.getMonth() !== st.cursor.getMonth() ? ' dim' : '') + (sameDay(d, today) ? ' today' : ''), onclick: () => editor(null, { date: d }) },
          h('div', { class: 'dn' }, d.getDate()), ev.slice(0, 3).map(chip), ev.length > 3 ? h('button', { class: 'more', onclick: e => { e.stopPropagation(); st.cursor = d; setView('day'); } }, `+${ev.length - 3} more`) : null); })));
  }
  function timeGrid(days) {
    const [from, to] = [days[0], addDays(days[days.length - 1], 1)], list = occs(from, to), n = days.length, HH = 48, wrap = h('div', { style: { '--n': n } });
    wrap.append(h('div', { class: 'tg-head' }, h('div'), days.map(d => h('div', { class: 'tg-day' + (sameDay(d, today) ? ' today' : ''), onclick: () => { st.cursor = d; setView('day'); } }, d.toLocaleDateString(undefined, { weekday: 'short' }), h('b', {}, d.getDate())))));
    wrap.append(h('div', { class: 'tg-ad' }, h('div'), days.map(d => h('div', {}, onDay(list, d).filter(o => o.ev.allDay).map(chip)))));
    const body = h('div', { class: 'tg-body' }, h('div', { class: 'hours' }, [...Array(24)].map((_, i) => h('div', {}, i ? new Date(2000, 0, 1, i).toLocaleTimeString([], { hour: 'numeric', hour12: !ctx.prefs.hour24 }) : ''))));
    for (const d of days) {
      const a = startOfDay(d), b = addDays(a, 1), col = h('div', { class: 'col', onclick: e => { if (e.target !== col) return; const m = Math.floor(e.offsetY / HH * 2) * 30, x = new Date(a); x.setMinutes(m); editor(null, { date: x }); } });
      const lanes = [], items = onDay(list, d).filter(o => !o.ev.allDay).map(o => { const s = Math.max(o.start, a), e = Math.min(o.end, b); let l = lanes.findIndex(end => end <= s); if (l < 0) l = lanes.length; lanes[l] = e; return { o, s, e, l }; });
      for (const it of items) col.append(h('button', { class: 'ev', style: { '--c': color(it.o.ev), top: (it.s - a) / 3600000 * HH + 'px', height: Math.max((it.e - it.s) / 3600000 * HH, 20) + 'px', left: it.l / lanes.length * 100 + '%', width: 100 / lanes.length - 1 + '%' }, onclick: e => { e.stopPropagation(); editor(it.o.ev); } }, it.o.ev.title || '(untitled)', h('small', {}, tf(it.o.start))));
      if (sameDay(d, today)) col.append(h('div', { class: 'now', style: { top: (today - a) / 3600000 * HH + 'px' } }));
      body.append(col);
    }
    wrap.append(body); requestAnimationFrame(() => { const sc = root.querySelector('.cal-body'); if (sc && !sc.scrollTop) sc.scrollTop = 7 * HH; }); return wrap;
  }
  function yearView() {
    const y = st.cursor.getFullYear(), list = occs(new Date(y, 0, 1), new Date(y + 1, 0, 1));
    return h('div', { class: 'year' }, [...Array(12)].map((_, m) => { const first = startOfWeek(new Date(y, m, 1), ws), days = [...Array(42)].map((_, i) => addDays(first, i));
      return h('div', { class: 'mini' }, h('h3', {}, new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long' })),
        h('table', {}, h('tr', {}, days.slice(0, 7).map(d => h('th', {}, d.toLocaleDateString(undefined, { weekday: 'narrow' })))), [...Array(6)].map((_, r) => h('tr', {}, days.slice(r * 7, r * 7 + 7).map(d => d.getMonth() !== m ? h('td') : h('td', {}, h('button', { class: (onDay(list, d).length ? 'has ' : '') + (sameDay(d, today) ? 'today' : ''), 'aria-label': d.toDateString(), onclick: () => { st.cursor = d; setView('day'); } }, d.getDate())))))));
    }));
  }
  function results() {
    const list = occs(addDays(st.cursor, -365), addDays(st.cursor, 365));
    return h('div', { class: 'page' }, h('h2', { style: { marginBottom: '10px' } }, `${list.length} result${list.length === 1 ? '' : 's'} within a year of ${st.cursor.toLocaleDateString()}`),
      list.length ? h('div', { class: 'list' }, list.slice(0, 200).map(o => h('button', { class: 'item', onclick: () => editor(o.ev) }, h('i', { style: { width: '10px', height: '10px', borderRadius: '50%', background: color(o.ev) } }), h('div', { class: 'grow' }, h('div', {}, o.ev.title), h('div', { class: 'meta' }, o.start.toLocaleDateString(undefined, { dateStyle: 'medium' }) + (o.ev.allDay ? ' · all day' : ' · ' + tf(o.start)) + (o.ev.location ? ' · ' + o.ev.location : '')))))) : empty('No matching events', 'Try other words or turn categories back on.'));
  }

  function editor(ev, opts = {}) {
    const isNew = !ev, d = opts.date || new Date(), base = new Date(d);
    if (isNew && !opts.date) { base.setMinutes(0, 0, 0); base.setHours(base.getHours() + 1); }
    else if (isNew && d.getHours() === 0 && d.getMinutes() === 0) base.setHours(9);
    const v = ev || { id: crypto.randomUUID(), title: '', allDay: false, start: ymdhm(base), end: ymdhm(new Date(base.getTime() + 3600000)), category: cats()[0]?.id, reminder: ctx.prefs.defaultReminder === '' ? null : +ctx.prefs.defaultReminder };
    const f = {}, field = (k, el) => (f[k] = el);
    const when = () => f.allDay.checked ? 'date' : 'datetime-local';
    const setType = () => { for (const k of ['start', 'end']) { const el = f[k], val = el.value; el.type = when(); el.value = el.type === 'date' ? val.slice(0, 10) : val.length === 10 ? val + (k === 'start' ? 'T09:00' : 'T10:00') : val; } };
    const r = v.rrule || {};
    const body = h('form', { class: 'stack', onsubmit: async e => {
      e.preventDefault();
      const out = { ...v, title: f.title.value.trim(), allDay: f.allDay.checked, start: f.start.value, end: f.end.value || f.start.value, category: f.category.value, reminder: f.reminder.value === '' ? null : +f.reminder.value };
      if (out.end < out.start) return toast('End must not be before start.', 'error');
      for (const k of ['location', 'description']) { if (f[k].value.trim()) out[k] = f[k].value.trim(); else delete out[k]; }
      if (f.freq.value) { out.rrule = { freq: f.freq.value }; if (+f.interval.value > 1) out.rrule.interval = +f.interval.value; if (f.endsMode.value === 'until' && f.until.value) out.rrule.until = f.until.value; if (f.endsMode.value === 'count' && +f.count.value > 0) out.rrule.count = +f.count.value; } else delete out.rrule;
      if (out.reminder != null && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      const i = doc().data.events.findIndex(x => x.id === v.id); if (i >= 0) doc().data.events[i] = out; else doc().data.events.push(out);
      await persist(); m.close(); st.cursor = parseLocal(out.start); render(); toast(isNew ? 'Event added' : 'Event saved');
    } },
      h('label', {}, 'Title', field('title', h('input', { type: 'text', required: true, value: v.title, maxlength: 200 }))),
      h('label', { class: 'inline' }, field('allDay', h('input', { type: 'checkbox', checked: !!v.allDay, onchange: setType })), 'All day'),
      h('div', { class: 'grid2' }, h('label', {}, 'Starts', field('start', h('input', { type: v.allDay ? 'date' : 'datetime-local', required: true, value: v.start }))), h('label', {}, 'Ends', field('end', h('input', { type: v.allDay ? 'date' : 'datetime-local', value: v.end || v.start })))),
      h('div', { class: 'grid2' }, h('label', {}, 'Category', field('category', h('select', {}, cats().map(c => h('option', { value: c.id, selected: c.id === v.category }, c.name))))),
        h('label', {}, 'Reminder', field('reminder', h('select', {}, [['', 'None'], [0, 'At time of event'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']].map(([a, b]) => h('option', { value: a, selected: String(v.reminder ?? '') === String(a) }, b)))))),
      h('label', {}, 'Location', field('location', h('input', { type: 'text', value: v.location || '' }))),
      h('label', {}, 'Description', field('description', h('textarea', {}, v.description || ''))),
      h('div', { class: 'grid2' }, h('label', {}, 'Repeat', field('freq', h('select', {}, [['', 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([a, b]) => h('option', { value: a, selected: r.freq === a }, b))))), h('label', {}, 'Every (interval)', field('interval', h('input', { type: 'number', min: 1, value: r.interval || 1 })))),
      h('div', { class: 'grid2' }, h('label', {}, 'Repeat ends', field('endsMode', h('select', {}, [['never', 'Never'], ['until', 'On date'], ['count', 'After N times']].map(([a, b]) => h('option', { value: a, selected: (r.until ? 'until' : r.count ? 'count' : 'never') === a }, b))))),
        h('div', { class: 'stack' }, h('label', {}, 'End date', field('until', h('input', { type: 'date', value: r.until || '' }))), h('label', {}, 'Occurrences', field('count', h('input', { type: 'number', min: 1, value: r.count || 5 }))))),
      h('div', { class: 'row end' }, !isNew ? btn('Delete', async () => { if (await confirmBox('Delete this event' + (v.rrule ? ' and all its repeats?' : '?'))) { doc().data.events = doc().data.events.filter(x => x.id !== v.id); await persist(); m.close(); render(); toast('Event deleted'); } }, 'danger') : null, h('div', { class: 'grow' }), btn('Cancel', () => m.close()), h('button', { class: 'btn primary', type: 'submit' }, isNew ? 'Add event' : 'Save changes')));
    const m = modal(isNew ? 'New event' : 'Edit event', body); f.title.focus();
  }

  function categoryEditor() {
    const draft = structuredClone(cats()), box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(...draft.map((c, i) => h('div', { class: 'row' }, h('input', { type: 'color', value: c.color, 'aria-label': 'Color', oninput: e => c.color = e.target.value }), h('div', { class: 'grow' }, h('input', { type: 'text', value: c.name, 'aria-label': 'Name', oninput: e => c.name = e.target.value })), iconBtn('trash', 'Remove category', () => { if (draft.length > 1) { draft.splice(i, 1); draw(); } }))), btn('Add category', () => { draft.push({ id: crypto.randomUUID().slice(0, 8), name: 'New category', color: '#3b82f6' }); draw(); }, '', 'plus'));
    draw();
    const m = modal('Categories', box, [btn('Cancel', () => m.close()), btn('Save', async () => { if (draft.some(c => !c.name.trim())) return toast('Names cannot be empty.', 'error'); const ids = new Set(draft.map(c => c.id)); doc().data.categories = draft; doc().data.events.forEach(e => { if (!ids.has(e.category)) e.category = draft[0].id; }); await persist(); m.close(); render(); }, 'primary')]);
  }
  const slugName = () => slug(doc().metadata.name);
  const importInto = async () => {
    const files = await pickFiles('.dr3amy,.json,.ics,text/calendar'); let added = 0; const bad = [];
    for (const f of files) { const t = await f.text(); let evs = [];
      if (/\.ics$/i.test(f.name)) evs = fromICS(t);
      else { const r = E.parse(t); if (!r.ok || r.doc.$type !== 'calendar') { bad.push(f.name + ': ' + (r.ok ? 'not a calendar' : r.errors[0])); continue; } evs = r.doc.data.events.map(e => ({ ...e, id: crypto.randomUUID() })); const have = new Set(cats().map(c => c.id)); r.doc.data.categories.forEach(c => { if (!have.has(c.id)) doc().data.categories.push(c); }); }
      doc().data.events.push(...evs); added += evs.length; }
    if (added) await persist(); render(); toast(`${added} event(s) imported` + (bad.length ? '. Skipped: ' + bad.join('; ') : ''), bad.length ? 'error' : '');
  };

  function render() {
    if (!rec) { root.replaceChildren(h('div', { class: 'page' }, empty('No calendars yet', 'Create a calendar stored on this device, or import a .dr3amy or .ics file.', btn('New calendar', newCal, 'primary'), btn('Import file', ctx.importPrompt)))); return; }
    const mi = (ic, label, fn) => h('button', { type: 'button', onclick: e => { e.currentTarget.closest('details').open = false; fn(); } }, icon(ic, 16), label);
    const menu = h('details', { class: 'menu' }, h('summary', { class: 'icon-btn', 'aria-label': 'Calendar menu', title: 'Calendar menu' }, icon('more')), h('div', { class: 'pop' },
      mi('export', 'Export .dr3amy', () => download(slugName() + '.dr3amy', E.serialize(doc()))), mi('export', 'Export .ics', () => download(slugName() + '.ics', toICS(doc()), 'text/calendar')),
      mi('share', 'Share…', () => shareFile(slugName() + '.dr3amy', E.serialize(doc()), 'application/json')), mi('share', 'Share as .ics…', () => shareFile(slugName() + '.ics', toICS(doc()), 'text/calendar')), h('hr'),
      mi('import', 'Import events…', importInto), mi('plus', 'New calendar', newCal), mi('files', 'Categories…', categoryEditor),
      mi('files', 'Rename calendar', async () => { const n = await promptBox('Rename calendar', 'Name', doc().metadata.name); if (n) { doc().metadata.name = n; await persist(); await reload(); render(); } }),
      mi('trash', 'Delete calendar', async () => { if (await confirmBox(`Delete “${doc().metadata.name}” and its ${doc().data.events.length} events from this browser?`)) { await S.delDoc(rec.id); await reload(); render(); } })));
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, ['day', 'week', 'month', 'year'].map(v => h('button', { 'aria-pressed': st.view === v, onclick: () => setView(v) }, v[0].toUpperCase() + v.slice(1))));
    const search = h('input', { type: 'search', placeholder: 'Search events', 'aria-label': 'Search events', value: st.q, oninput: e => { st.q = e.target.value; clearTimeout(search.t); search.t = setTimeout(() => { render(); const i = root.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(st.q.length, st.q.length); }, 200); } });
    const bar = h('div', { class: 'cal-bar' }, h('select', { 'aria-label': 'Calendar', onchange: e => { rec = recs.find(r => r.id === e.target.value); ctx.setPref('lastCalendar', rec.id); render(); } }, recs.map(r => h('option', { value: r.id, selected: r.id === rec.id }, r.doc.metadata.name))),
      iconBtn('left', 'Previous', () => nav(-1)), btn('Today', () => { st.cursor = new Date(); render(); }), iconBtn('right', 'Next', () => nav(1)), h('h2', { class: 'grow' }, title()), seg, search, btn('New event', () => editor(null), 'primary', 'plus'), menu);
    const catBar = h('div', { class: 'cats' }, cats().map(c => h('button', { class: 'cat', 'aria-pressed': !st.hidden.has(c.id), onclick: () => { st.hidden.has(c.id) ? st.hidden.delete(c.id) : st.hidden.add(c.id); render(); } }, h('i', { style: { background: c.color } }), c.name)));
    const [from] = range();
    const body = st.q.trim() ? results() : st.view === 'month' ? monthView() : st.view === 'year' ? yearView() : timeGrid(st.view === 'day' ? [startOfDay(st.cursor)] : [...Array(7)].map((_, i) => addDays(from, i)));
    root.replaceChildren(h('div', { class: 'page wide' }, bar, catBar, h('div', { class: 'cal-body' }, body)));
  }
  const key = e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || !rec) return;
    const k = e.key, v = { d: 'day', w: 'week', m: 'month', y: 'year' }[k];
    if (k === 'n') { e.preventDefault(); editor(null); } else if (k === 't') { st.cursor = new Date(); render(); } else if (k === 'ArrowLeft') nav(-1); else if (k === 'ArrowRight') nav(1); else if (v) setView(v);
    else if (k === '/') { e.preventDefault(); root.querySelector('input[type=search]')?.focus(); }
  };
  addEventListener('keydown', key);
  if (rec) ctx.setPref('lastCalendar', rec.id);
  render();
  if (params.new && rec) editor(null);
  return () => removeEventListener('keydown', key);
}
