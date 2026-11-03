import { h, icon, typeTile, btn, empty, fmtBytes, fmtDate, promptBox } from '../../core/utilities/ui.js';
import * as S from '../../core/storage/storage.js';
import * as E from '../../core/document-engine/engine.js';
import { download } from '../../core/utilities/ui.js';
import { makeBackup } from '../settings/settings.js';

const greet = () => { const t = new Date().getHours(); return t < 5 ? 'Still up?' : t < 12 ? 'Good morning' : t < 18 ? 'Good afternoon' : 'Good evening'; };
export default async function mount(root, ctx) {
  const recs = await S.allDocs(), u = await S.usage();
  const recent = [...recs].sort((a, b) => (b.opened || 0) - (a.opened || 0) || b.doc.metadata.modified.localeCompare(a.doc.metadata.modified)).slice(0, 7);
  const tile = (k, name, desc) => h('a', { href: '#/' + k }, h('div', { class: 'tile-icon t-' + k }, icon(k, 24)), h('div', {}, h('b', {}, name), h('span', {}, desc)));
  const open = r => ctx.go(r.doc.$type === 'calendar' ? 'calendar?doc=' + r.id : 'files?sel=' + r.id);
  const counts = E.TYPES.map(t => [t, recs.filter(r => r.doc.$type === t).length]).filter(x => x[1]);
  const pct = u.quota && u.usage ? Math.max(1, Math.min(100, u.usage / u.quota * 100)) : 1;
  root.append(h('div', { class: 'page' },
    h('h1', {}, greet()), h('p', { class: 'sub' }, 'Everything here lives in this browser. No account, no cloud.'),
    h('div', { class: 'launch' }, tile('calendar', 'Calendar', 'Day, week, month, year'), tile('files', 'Files', 'Your .dr3amy documents'), tile('settings', 'Settings', 'Appearance, storage, backup')),
    h('div', { class: 'cols' },
      h('div', { class: 'section' }, h('h2', {}, 'Recent documents'),
        recent.length ? h('div', { class: 'list' }, recent.map(r => h('button', { class: 'item', onclick: () => open(r) }, typeTile(r.doc.$type), h('div', { class: 'grow' }, h('div', {}, r.doc.metadata.name), h('div', { class: 'meta' }, 'Modified ' + fmtDate(r.doc.metadata.modified))), h('span', { class: 'chip-type' }, E.TYPE_LABEL[r.doc.$type]))))
          : h('div', { class: 'list' }, empty('Nothing here yet', 'Create a calendar or import a .dr3amy or .ics file to get started.', btn('New calendar', async () => { const n = await promptBox('New calendar', 'Name', 'Personal Calendar'); if (!n) return; const d = E.create('calendar', n); await S.saveDoc(d.metadata.id, d, Date.now()); ctx.go('calendar?doc=' + d.metadata.id); }, 'primary'), btn('Import file', ctx.importPrompt)))),
      h('div', {},
        h('div', { class: 'section' }, h('h2', {}, 'Quick actions'), h('div', { class: 'quick' },
          btn('New event', () => ctx.go('calendar?new=1'), 'primary', 'plus'), btn('New document', () => ctx.go('files?new=document'), '', 'file'), btn('Import', ctx.importPrompt, '', 'import'),
          btn('Back up all', async () => { download(...(await makeBackup())); ctx.toast('Backup downloaded'); }, '', 'export'))),
        h('div', { class: 'section' }, h('h2', {}, 'Local storage'),
          h('div', { class: 'panel' }, h('div', { class: 'bar', role: 'img', 'aria-label': 'Browser storage used' }, h('i', { style: { width: pct + '%' } })),
            h('p', {}, `${recs.length} document${recs.length === 1 ? '' : 's'} · ${fmtBytes(u.usage)} used by this site`),
            counts.length ? h('p', { class: 'sub' }, counts.map(([t, n]) => `${n} ${E.TYPE_LABEL[t].toLowerCase()}`).join(' · ')) : null,
            h('p', { class: 'sub' }, u.persisted ? 'Persistent storage is on.' : 'Browsers may clear this data under storage pressure. Back up regularly.'),
            h('a', { href: '#/settings' }, 'Manage storage'))))) ));
}
