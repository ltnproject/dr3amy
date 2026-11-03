import { h, btn, modal, confirmBox, pickFiles, download, fmtBytes, toast } from '../../core/utilities/ui.js';
import * as S from '../../core/storage/storage.js';
import * as E from '../../core/document-engine/engine.js';
import { ymd } from '../../core/utilities/dates.js';
const ACC = { violet: ['#7c5cff', '#3b82f6'], ocean: ['#3b82f6', '#0ea5c9'], orchid: ['#b45cff', '#6366f1'], rose: ['#f0508c', '#8b5cf6'] };

/** Returns [filename, text, mime] for a full backup (a workspace document). */
export async function makeBackup() {
  const recs = await S.allDocs(), prefs = await S.allPrefs();
  const w = E.create('workspace', 'Dr3amy Backup ' + ymd(new Date()), { items: recs.map(r => r.doc), preferences: prefs });
  return ['dr3amy-backup-' + ymd(new Date()) + '.dr3amy', E.serialize(w), 'application/octet-stream'];
}

export default async function mount(root, ctx) {
  const P = ctx.prefs, u = await S.usage(), n = (await S.allDocs()).length;
  const row = (title, sub, ctl) => h('div', { class: 'setrow' }, h('div', {}, h('div', {}, title), sub ? h('div', { class: 'sub' }, sub) : null), ctl);
  const sel = (key, opts, num) => h('select', { 'aria-label': key, onchange: e => ctx.setPref(key, num ? +e.target.value : e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(P[key]) === String(v) }, l)));
  const group = (title, ...rows) => h('section', {}, h('h2', { style: { margin: '0 0 8px' } }, title), h('div', { class: 'setgrp' }, rows));
  const sw = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent color' }, Object.entries(ACC).map(([k, [a, b]]) => h('button', { class: 'swatch', 'aria-label': k, 'aria-pressed': P.accent === k, title: k, style: { background: `linear-gradient(135deg,${a},${b})` }, onclick: async () => { await ctx.setPref('accent', k); sw.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.title === k)); } })));
  const persist = h('span', { class: 'sub' }, u.persisted ? 'On' : 'Off');
  root.append(h('div', { class: 'page', style: { maxWidth: '760px' } }, h('h1', { style: { marginBottom: '20px' } }, 'Settings'),
    group('Appearance', row('Theme', 'Follows your system by default', sel('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])), row('Accent color', null, sw)),
    group('Preferences', row('Week starts on', null, sel('weekStart', [[0, 'Sunday'], [1, 'Monday']], true)), row('Time format', null, h('select', { 'aria-label': 'Time format', onchange: e => ctx.setPref('hour24', e.target.value === '24') }, h('option', { value: '12', selected: !P.hour24 }, '12-hour'), h('option', { value: '24', selected: P.hour24 }, '24-hour'))),
      row('Default reminder', 'For new events', sel('defaultReminder', [['', 'None'], [0, 'At time of event'], [10, '10 minutes before'], [30, '30 minutes before'], [60, '1 hour before']])), row('Default calendar view', null, sel('calView', [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['year', 'Year']]))),
    group('Storage and backup',
      row('Used by Dr3amy', `${n} document${n === 1 ? '' : 's'}. Browser quota: ${fmtBytes(u.quota)}.`, h('b', {}, fmtBytes(u.usage))),
      row('Persistent storage', 'Asks the browser not to clear your data automatically. It may be declined, and it is still not a substitute for backups.', h('div', { class: 'row' }, persist, btn('Request', async () => { const ok = await S.requestPersist(); persist.textContent = ok ? 'On' : 'Declined by browser'; }))),
      row('Back up everything', 'Downloads one .dr3amy workspace file with all documents and preferences.', btn('Download backup', async () => { download(...(await makeBackup())); toast('Backup downloaded'); }, 'primary')),
      row('Restore from backup', 'Documents with the same ID are replaced.', btn('Choose file…', async () => {
        const [f] = await pickFiles('.dr3amy,application/octet-stream', false); if (!f) return;
        const r = E.parse(new Uint8Array(await f.arrayBuffer()));
        if (!r.ok || r.doc.$type !== 'workspace') return toast(r.ok ? 'That file is not a backup (type must be workspace).' : r.errors[0], 'error');
        if (!(await confirmBox(`Restore ${r.doc.data.items.length} document(s)? Matching IDs will be overwritten.`, 'Restore'))) return;
        for (const it of r.doc.data.items) { it.metadata.id ||= crypto.randomUUID(); await S.saveDoc(it.metadata.id, it, Date.now()); }
        const pf = r.doc.data.preferences || {}; for (const [k, v] of Object.entries(pf)) await ctx.setPref(k, v);
        toast('Restored'); ctx.refresh();
      })),
      row('Erase all data', 'Deletes every document and preference from this browser.', btn('Erase…', async () => { if (await confirmBox('Erase everything stored by Dr3amy in this browser? This cannot be undone.', 'Erase all')) { await S.clearAll(); location.reload(); } }, 'danger'))),
    group('Privacy', h('div', { class: 'setrow' }, h('div', { class: 'stack' },
      h('p', {}, 'Dr3amy has no accounts, no analytics, and no telemetry. After the page loads it makes no network requests; your documents never leave this device unless you export or share them.'),
      h('p', { class: 'sub' }, 'Data is stored in this browser’s IndexedDB. That is convenient but not permanent: clearing site data, uninstalling the browser, private windows, or storage pressure can erase it. Browsers on different devices do not sync. Export files to keep real copies.')))),
    group('About', row('Dr3amy', 'Format version ' + E.VERSION + ' · reads 1.x and migrates 0.9', h('b', {}, 'v1.1.0')), row('Keyboard shortcuts', null, btn('Show', ctx.shortcuts)))));
}
