import { h, icon, modal, btn, toast, pickFiles } from '../core/utilities/ui.js';
import * as S from '../core/storage/storage.js';
import * as E from '../core/document-engine/engine.js';
import { fromICS } from '../core/utilities/ics.js';
import { startReminders } from '../apps/calendar/reminders.js';

export const ACCENTS = { violet: ['#7c5cff', '#3b82f6'], ocean: ['#3b82f6', '#0ea5c9'], orchid: ['#b45cff', '#6366f1'], rose: ['#f0508c', '#8b5cf6'] };
const DEFAULTS = { theme: 'system', accent: 'violet', weekStart: 0, hour24: false, defaultReminder: '', calView: 'month' };
const APPS = { home: ['Home', () => import('../apps/home/home.js')], calendar: ['Calendar', () => import('../apps/calendar/calendar.js')], files: ['Files', () => import('../apps/files/files.js')], settings: ['Settings', () => import('../apps/settings/settings.js')] };
const ctx = { prefs: { ...DEFAULTS }, toast };
let cleanup = null, view;

ctx.applyPrefs = () => {
  const r = document.documentElement, p = ctx.prefs, a = ACCENTS[p.accent] || ACCENTS.violet;
  if (p.theme === 'system') r.removeAttribute('data-theme'); else r.dataset.theme = p.theme;
  r.style.setProperty('--a1', a[0]); r.style.setProperty('--a2', a[1]);
};
ctx.setPref = async (k, v) => { ctx.prefs[k] = v; ctx.applyPrefs(); try { await S.setPref(k, v); } catch (e) { toast('Could not save preference: ' + e.message, 'error'); } };
ctx.go = (route) => { if (location.hash === '#/' + route) route$(); else location.hash = '#/' + route; };
ctx.refresh = () => route$();

/** Import .dr3amy / .json / .ics files into local storage. Shows a per-file report. */
ctx.importFiles = async (files) => {
  const rows = [];
  for (const f of files) {
    const row = { name: f.name, ok: false, msgs: [] };
    try {
      const text = await f.text();
      let doc, warnings = [];
      if (/\.ics$/i.test(f.name)) {
        const events = fromICS(text);
        if (!events.length) { row.msgs.push('No events found in this .ics file.'); rows.push(row); continue; }
        doc = E.create('calendar', f.name.replace(/\.ics$/i, '') || 'Imported calendar'); doc.data.events = events;
        const v = E.validate(doc); if (!v.ok) { row.msgs.push(...v.errors); rows.push(row); continue; }
        warnings.push(`${events.length} event(s) imported. Unsupported iCalendar properties were ignored.`);
      } else {
        const r = E.parse(text);
        if (!r.ok) { row.msgs.push(...r.errors); row.unsupported = r.unsupported; rows.push(row); continue; }
        doc = r.doc; warnings = r.warnings;
        if (await S.getDoc(doc.metadata.id)) { doc.metadata.id = crypto.randomUUID(); doc.metadata.name += ' (imported)'; warnings.push('A document with this ID already existed, so a copy was added.'); }
      }
      await S.saveDoc(doc.metadata.id, doc, Date.now());
      row.ok = true; row.id = doc.metadata.id; row.msgs.push(...warnings);
    } catch (e) { row.msgs.push('Unexpected error: ' + e.message); }
    rows.push(row);
  }
  const m = modal('Import results', h('div', { class: 'stack' }, rows.map(r => h('div', {}, h('b', {}, r.name + ' '), h('span', { class: 'badge ' + (r.ok ? 'ok' : 'bad') }, r.ok ? 'Imported' : r.unsupported ? 'Unsupported version' : 'Rejected'),
    r.msgs.length ? h('ul', { class: 'msgs ' + (r.ok ? 'warn' : 'err') }, r.msgs.slice(0, 8).map(x => h('li', {}, x)), r.msgs.length > 8 ? h('li', {}, `…and ${r.msgs.length - 8} more`) : null) : null))),
    [btn('Done', () => m.close(), 'primary')], () => ctx.refresh());
  return rows;
};
ctx.importPrompt = async () => { const f = await pickFiles('.dr3amy,.json,.ics,application/json,text/calendar'); if (f.length) ctx.importFiles(f); };

async function route$() {
  const [path, qs] = (location.hash.slice(2) || 'home').split('?');
  const name = APPS[path] ? path : 'home', params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.querySelectorAll('.side a.nav').forEach(a => a.getAttribute('href') === '#/' + name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  document.title = (name === 'home' ? '' : APPS[name][0] + ' · ') + 'Dr3amy';
  view.replaceChildren(); view.scrollTop = 0;
  try { const mod = await APPS[name][1](); cleanup = await mod.default(view, ctx, params); }
  catch (e) { console.error(e); view.replaceChildren(h('div', { class: 'page' }, h('h2', {}, 'Something went wrong'), h('p', { class: 'sub' }, e.message))); }
}

function shortcuts() {
  const rows = [['g then h / c / f / s', 'Go to Home, Calendar, Files, Settings'], ['?', 'Show shortcuts'], ['Calendar: n', 'New event'], ['Calendar: t', 'Jump to today'], ['Calendar: ← →', 'Previous / next'], ['Calendar: d w m y', 'Day, week, month, year'], ['Calendar: /', 'Search']];
  const m = modal('Keyboard shortcuts', h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])), [btn('Close', () => m.close())]);
}
ctx.shortcuts = shortcuts;

async function boot() {
  const app = document.getElementById('app');
  try { Object.assign(ctx.prefs, await S.allPrefs()); }
  catch (e) { app.append(h('div', { class: 'page' }, h('h1', {}, 'Storage unavailable'), h('p', { class: 'sub' }, 'Dr3amy stores everything in your browser’s IndexedDB, which is blocked here (' + e.message + '). Private browsing modes often disable it. Open Dr3amy in a normal window.'))); return; }
  ctx.applyPrefs();
  const nav = (k, ic) => h('a', { class: 'nav', href: '#/' + k }, icon(ic), APPS[k][0]);
  view = h('main', { id: 'view' });
  app.append(h('div', { class: 'shell' },
    h('nav', { class: 'side', 'aria-label': 'Dr3amy apps' }, h('a', { class: 'brand', href: '#/home' }, h('img', { src: 'assets/icons/logo.svg', alt: '' }), 'Dr3amy'), nav('home', 'home'), nav('calendar', 'calendar'), nav('files', 'files'), nav('settings', 'settings'), h('div', { class: 'foot' }, 'Local-first · v1.0')), view));
  addEventListener('hashchange', route$);
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) ctx.importFiles([...e.dataTransfer.files]); });
  let g = 0;
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    if (e.key === '?') return shortcuts();
    if (g && Date.now() - g < 1200) { const k = { h: 'home', c: 'calendar', f: 'files', s: 'settings' }[e.key]; g = 0; if (k) ctx.go(k); return; }
    if (e.key === 'g') g = Date.now();
  });
  startReminders(ctx);
  route$();
}
boot();
