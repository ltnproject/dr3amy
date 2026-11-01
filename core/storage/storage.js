// IndexedDB persistence. Stores: docs {id, doc, opened}, prefs {key -> value}.
let dbp;
const open = () => dbp ||= new Promise((res, rej) => {
  if (!('indexedDB' in globalThis)) return rej(new Error('IndexedDB is not available in this browser or mode.'));
  const r = indexedDB.open('dr3amy', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'id' }); r.result.createObjectStore('prefs'); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async (store, mode, fn) => {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result); t.onerror = t.onabort = () => rej(t.error);
  });
};
export const getDoc = id => tx('docs', 'readonly', s => s.get(id));
export const allDocs = () => tx('docs', 'readonly', s => s.getAll());
export const delDoc = id => tx('docs', 'readwrite', s => s.delete(id));
export async function saveDoc(id, doc, opened) {
  const old = await getDoc(id);
  return tx('docs', 'readwrite', s => s.put({ id, doc, opened: opened ?? old?.opened ?? 0 }));
}
export const setPref = (k, v) => tx('prefs', 'readwrite', s => s.put(v, k));
export async function allPrefs() {
  const d = await open();
  return new Promise((res, rej) => {
    const out = {}, t = d.transaction('prefs'), c = t.objectStore('prefs').openCursor();
    c.onsuccess = () => { const x = c.result; if (x) { out[x.key] = x.value; x.continue(); } };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
  });
}
export async function clearAll() { await tx('docs', 'readwrite', s => s.clear()); await tx('prefs', 'readwrite', s => s.clear()); }
export async function usage() {
  const o = { usage: null, quota: null, persisted: null };
  try { const e = await navigator.storage.estimate(); o.usage = e.usage; o.quota = e.quota; } catch {}
  try { o.persisted = await navigator.storage.persisted(); } catch {}
  return o;
}
export const requestPersist = async () => { try { return await navigator.storage.persist(); } catch { return false; } };
