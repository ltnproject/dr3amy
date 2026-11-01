import { h, icon, btn, iconBtn, modal, confirmBox, promptBox, empty, download, shareFile, fmtBytes, fmtDate, slug } from '../../core/utilities/ui.js';
import * as S from '../../core/storage/storage.js';
import * as E from '../../core/document-engine/engine.js';

export default async function mount(root, ctx, params) {
  let recs = [], sel = params.sel || null, q = '', type = '';
  const load = async () => { recs = (await S.allDocs()).sort((a, b) => b.doc.metadata.modified.localeCompare(a.doc.metadata.modified)); };
  const save = async (r, doc) => { E.touch(doc); r.doc = doc; await S.saveDoc(r.id, doc, Date.now()); };
  const create = async (t = 'document') => {
    const sel$ = h('select', {}, E.TYPES.map(x => h('option', { value: x, selected: x === t }, E.TYPE_LABEL[x]))), name = h('input', { type: 'text', required: true, value: 'Untitled', maxlength: 120 });
    const f = h('form', { onsubmit: async e => { e.preventDefault(); const d = E.create(sel$.value, name.value.trim() || 'Untitled'); await S.saveDoc(d.metadata.id, d, Date.now()); sel = d.metadata.id; m.close(); await load(); render(); ctx.toast('Created ' + d.metadata.name); } },
      h('label', {}, 'Type', sel$), h('label', {}, 'Name', name), h('div', { class: 'row end' }, btn('Cancel', () => m.close()), h('button', { class: 'btn primary', type: 'submit' }, 'Create')));
    const m = modal('New file', f); name.select();
  };
  const editData = r => {
    const ta = h('textarea', { style: { minHeight: '280px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '12px' }, spellcheck: 'false' }, JSON.stringify(r.doc.data, null, 2)), err = h('ul', { class: 'msgs err' });
    const m = modal('Edit data (JSON)', h('div', { class: 'stack' }, ta, err), [btn('Cancel', () => m.close()), btn('Validate and save', async () => {
      err.replaceChildren(); let data;
      try { data = JSON.parse(ta.value); } catch (e) { err.append(h('li', {}, 'Invalid JSON: ' + e.message)); return; }
      const cand = { ...r.doc, data }, v = E.validate(cand);
      if (!v.ok) { v.errors.slice(0, 10).forEach(x => err.append(h('li', {}, x))); return; }
      await save(r, cand); m.close(); render(); ctx.toast('Saved');
    }, 'primary')]);
  };
  const preview = r => {
    const d = r.doc, x = d.data;
    if (d.$type === 'document') { const ta = h('textarea', { 'aria-label': 'Document text', style: { minHeight: '180px' } }, x.content); return h('div', { class: 'stack' }, ta, h('div', {}, btn('Save text', async () => { r.doc.data.content = ta.value; await save(r, r.doc); render(); ctx.toast('Saved'); }, 'primary'))); }
    if (d.$type === 'calendar') { const up = [...x.events].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5); return h('div', {}, h('p', {}, `${x.events.length} events · ${x.categories.length} categories · ${x.timezone}`), h('ul', { class: 'msgs warn' }, up.map(e => h('li', {}, `${e.start.replace('T', ' ')} — ${e.title}`)))); }
    if (d.$type === 'project') return h('ul', { class: 'msgs' }, x.tasks.map(t => h('li', {}, (t.done ? '☑ ' : '☐ ') + t.title)));
    return h('pre', { class: 'json' }, JSON.stringify(x, null, 2).slice(0, 4000));
  };
  const detail = r => {
    const d = r.doc, v = E.validate(d);
    return h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, d.metadata.name), h('span', { class: 'badge ' + (v.ok ? 'ok' : 'bad') }, v.ok ? 'Valid' : 'Invalid')),
      !v.ok ? h('ul', { class: 'msgs err' }, v.errors.slice(0, 8).map(e => h('li', {}, e))) : null,
      v.warnings.length ? h('ul', { class: 'msgs warn' }, v.warnings.slice(0, 5).map(e => h('li', {}, e))) : null,
      preview(r),
      h('dl', { class: 'kv' }, [['Type', E.TYPE_LABEL[d.$type]], ['Format', 'dr3amy ' + d.$version], ['Created', fmtDate(d.metadata.created)], ['Modified', fmtDate(d.metadata.modified)], ['Size', fmtBytes(E.size(d))], ['ID', d.metadata.id]].map(([k, val]) => [h('dt', {}, k), h('dd', {}, val)])),
      h('div', { class: 'row' },
        d.$type === 'calendar' ? btn('Open', () => ctx.go('calendar?doc=' + r.id), 'primary') : null,
        btn('Rename', async () => { const n = await promptBox('Rename', 'Name', d.metadata.name); if (n) { d.metadata.name = n; await save(r, d); await load(); render(); } }),
        btn('Edit data', () => editData(r)),
        btn('Duplicate', async () => { const c = structuredClone(d); c.metadata.id = crypto.randomUUID(); c.metadata.name += ' copy'; await S.saveDoc(c.metadata.id, c, Date.now()); sel = c.metadata.id; await load(); render(); }),
        btn('Export', () => download(slug(d.metadata.name) + '.dr3amy', E.serialize(d)), '', 'export'),
        btn('Share', () => shareFile(slug(d.metadata.name) + '.dr3amy', E.serialize(d), 'application/json'), '', 'share'),
        btn('Delete', async () => { if (await confirmBox(`Delete “${d.metadata.name}” from this browser? Export it first if you need a copy.`)) { await S.delDoc(r.id); sel = null; await load(); render(); } }, 'danger', 'trash')));
  };
  const render = () => {
    const list = recs.filter(r => (!type || r.doc.$type === type) && r.doc.metadata.name.toLowerCase().includes(q.toLowerCase()));
    const cur = recs.find(r => r.id === sel);
    const search = h('input', { type: 'search', placeholder: 'Search files', 'aria-label': 'Search files', value: q, oninput: e => { q = e.target.value; render(); const i = root.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(q.length, q.length); } });
    root.replaceChildren(h('div', { class: 'page' },
      h('div', { class: 'row', style: { marginBottom: '16px' } }, h('h1', { class: 'grow' }, 'Files'), btn('Import', ctx.importPrompt, '', 'import'), btn('New file', () => create(), 'primary', 'plus')),
      h('div', { class: 'files' },
        h('div', { class: 'stack' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, search), h('select', { 'aria-label': 'Filter by type', style: { width: 'auto' }, onchange: e => { type = e.target.value; render(); } }, h('option', { value: '' }, 'All types'), E.TYPES.map(t => h('option', { value: t, selected: t === type }, E.TYPE_LABEL[t])))),
          list.length ? h('div', { class: 'list' }, list.map(r => h('button', { class: 'item', 'aria-selected': r.id === sel, onclick: () => { sel = r.id; render(); } }, icon('file'), h('div', { class: 'grow' }, h('div', {}, r.doc.metadata.name), h('div', { class: 'meta' }, fmtDate(r.doc.metadata.modified))), h('span', { class: 'chip-type' }, E.TYPE_LABEL[r.doc.$type]))))
            : h('div', { class: 'list' }, empty(recs.length ? 'No matches' : 'No files yet', recs.length ? 'Try a different search or filter.' : 'Create a file or import a .dr3amy file. You can also drop files anywhere on this page.', btn('New file', () => create(), 'primary')))),
        cur ? detail(cur) : h('div', { class: 'panel' }, empty('Select a file', 'Preview, validate, rename, export or edit its data here.')))));
  };
  await load(); render();
  if (params.new) create(params.new);
}
