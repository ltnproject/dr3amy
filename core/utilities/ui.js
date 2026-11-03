// Small DOM helpers. All user content is inserted as text nodes, never as HTML.
export const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [a, b] of Object.entries(v)) a.startsWith('--') ? e.style.setProperty(a, b) : (e.style[a] = b); }
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  files: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  x: 'M6 6l12 12M18 6 6 18', plus: 'M12 5v14M5 12h14', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  import: 'M12 4v11M7 10l5 5 5-5M5 20h14', export: 'M12 16V5M7 10l5-5 5 5M5 20h14', share: 'M12 16V4M8 8l4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', file: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
};
export const icon = (n, size = 18) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[n] || ''); s.append(p); return s;
};
export const btn = (label, fn, cls = '', ic) => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, ic ? icon(ic, 16) : null, label);
export const iconBtn = (ic, label, fn) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick: fn }, icon(ic));

export function modal(title, body, actions = [], onClose) {
  const d = h('dialog', { class: 'modal', 'aria-label': title });
  const close = () => { if (d.open) d.close(); d.remove(); onClose && onClose(); };
  d.append(h('header', {}, h('h2', {}, title), iconBtn('x', 'Close', close)), h('div', { class: 'mbody' }, body), actions.length ? h('footer', {}, actions) : null);
  d.addEventListener('cancel', e => { e.preventDefault(); close(); });
  d.addEventListener('click', e => { if (e.target === d) close(); });
  document.body.append(d); d.showModal();
  return { el: d, close };
}
export const confirmBox = (msg, ok = 'Delete') => new Promise(res => {
  const m = modal('Please confirm', h('p', {}, msg), [btn('Cancel', () => m.close()), btn(ok, () => { res(true); m.close(); }, 'danger')], () => res(false));
});
export const promptBox = (title, label, val = '') => new Promise(res => {
  const i = h('input', { type: 'text', value: val, required: true, maxlength: 120 });
  let done = false;
  const f = h('form', { onsubmit: e => { e.preventDefault(); if (!i.value.trim()) return; done = true; res(i.value.trim()); m.close(); } },
    h('label', {}, label, i), h('div', { class: 'row end' }, btn('Cancel', () => m.close()), h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
  const m = modal(title, f, [], () => { if (!done) res(null); });
  i.focus(); i.select();
});
export function toast(msg, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg); box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}
export function download(name, data, mime = 'application/octet-stream') {
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/** Native share sheet (AirDrop appears here on Apple devices). Falls back to a download. */
export async function shareFile(name, data, mime) {
  const file = new File([data], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  download(name, data, mime);
  toast('Sharing is not supported here, so the file was downloaded instead.');
  return 'downloaded';
}
export const pickFiles = (accept, multiple = true) => new Promise(res => {
  const i = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
  i.addEventListener('change', () => { res([...i.files]); i.remove(); });
  document.body.append(i); i.click();
});
export const fmtBytes = n => n == null ? 'unknown' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
export const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
export const slug = s => (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
export const empty = (title, text, ...actions) => h('div', { class: 'empty' }, h('img', { src: 'assets/icons/logo.svg', alt: '', width: 56, height: 56 }), h('h3', {}, title), h('p', {}, text), h('div', { class: 'row center' }, actions));

const TILE_ICON = { calendar: 'calendar', settings: 'settings' };
export const typeTile = type => h('span', { class: 'ftile t-' + type, 'aria-hidden': 'true' }, icon(TILE_ICON[type] || 'file', 16));
