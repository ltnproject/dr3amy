// Dr3amy Document Engine: create, parse, validate, migrate, serialize (binary container in codec.js). No DOM dependencies.
import { parseLocal } from '../utilities/dates.js';
import { encodeDocument, decodeDocument, readHeader } from './codec.js';
export const FORMAT = 'dr3amy', VERSION = '1.0', MAX_BYTES = 50 * 1024 * 1024;
export const TYPES = ['calendar', 'document', 'project', 'database', 'settings', 'workspace'];
export const TYPE_LABEL = { calendar: 'Calendar', document: 'Document', project: 'Project', database: 'Database', settings: 'Settings', workspace: 'Workspace' };
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

export const defaultData = {
  calendar: () => ({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', categories: [{ id: 'default', name: 'General', color: '#7c5cff' }], events: [] }),
  document: () => ({ content: '' }),
  project: () => ({ tasks: [] }),
  database: () => ({ columns: [], rows: [] }),
  settings: () => ({ values: {} }),
  workspace: () => ({ items: [] }),
};
export function create(type, name, data) {
  if (!TYPES.includes(type)) throw new Error('Unknown document type: ' + type);
  const t = now();
  return { $format: FORMAT, $version: VERSION, $type: type, metadata: { id: crypto.randomUUID(), name, created: t, modified: t }, data: data ?? defaultData[type]() };
}
export const touch = d => { d.metadata.modified = now(); return d; };
/** Document -> binary .dr3amy bytes (Uint8Array). */
export const serialize = d => encodeDocument(d);
export const size = d => serialize(d).length;

const CHECK = {
  calendar(d, e, W) {
    if (typeof d.timezone !== 'string' || !d.timezone) e('data.timezone', 'required IANA timezone string');
    const cats = new Set();
    if (!Array.isArray(d.categories)) e('data.categories', 'required array');
    else d.categories.forEach((c, i) => {
      if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.color || '')) e(`data.categories[${i}]`, 'needs string id, string name and #RRGGBB color');
      else cats.add(c.id);
    });
    if (!Array.isArray(d.events)) return e('data.events', 'required array');
    const ids = new Set();
    d.events.forEach((v, i) => {
      const p = `data.events[${i}]`;
      if (!isObj(v)) return e(p, 'must be an object');
      if (typeof v.id !== 'string' || !v.id) e(p + '.id', 'required non-empty string');
      else if (ids.has(v.id)) e(p + '.id', 'duplicate id'); else ids.add(v.id);
      if (typeof v.title !== 'string') e(p + '.title', 'required string');
      const ad = v.allDay === true, re = ad ? /^\d{4}-\d\d-\d\d$/ : /^\d{4}-\d\d-\d\dT\d\d:\d\d$/;
      if (!re.test(v.start || '') || isNaN(parseLocal(v.start))) e(p + '.start', ad ? 'must be YYYY-MM-DD' : 'must be YYYY-MM-DDTHH:mm');
      if (v.end != null) { if (!re.test(v.end)) e(p + '.end', 'format must match start'); else if (v.end < v.start) e(p + '.end', 'must not be before start'); }
      if (v.category != null && !cats.has(v.category)) W.push(`${p}.category: unknown category "${v.category}"`);
      if (v.rrule != null) {
        const r = v.rrule;
        if (!isObj(r) || !['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) e(p + '.rrule.freq', 'must be daily, weekly, monthly or yearly');
        else {
          if (r.interval !== undefined && !(Number.isInteger(r.interval) && r.interval >= 1)) e(p + '.rrule.interval', 'must be an integer >= 1');
          if (r.count !== undefined && !(Number.isInteger(r.count) && r.count >= 1)) e(p + '.rrule.count', 'must be an integer >= 1');
          if (r.until !== undefined && !/^\d{4}-\d\d-\d\d$/.test(r.until)) e(p + '.rrule.until', 'must be YYYY-MM-DD');
        }
      }
      if (v.reminder != null && !(Number.isInteger(v.reminder) && v.reminder >= 0)) e(p + '.reminder', 'must be minutes (integer >= 0) or null');
    });
  },
  document: (d, e) => { if (typeof d.content !== 'string') e('data.content', 'required string'); },
  project: (d, e) => {
    if (!Array.isArray(d.tasks)) return e('data.tasks', 'required array');
    d.tasks.forEach((t, i) => { if (!isObj(t) || typeof t.title !== 'string') e(`data.tasks[${i}]`, 'needs a string title'); });
  },
  database: (d, e) => {
    if (!Array.isArray(d.columns)) e('data.columns', 'required array');
    else d.columns.forEach((c, i) => { if (!isObj(c) || typeof c.name !== 'string') e(`data.columns[${i}]`, 'needs a string name'); });
    if (!Array.isArray(d.rows)) e('data.rows', 'required array');
  },
  settings: (d, e) => { if (!isObj(d.values)) e('data.values', 'required object'); },
  workspace: (d, e) => {
    if (!Array.isArray(d.items)) return e('data.items', 'required array');
    d.items.forEach((it, i) => validate(it).errors.forEach(x => e(`data.items[${i}].${x}`, '')));
  },
};

export function validate(doc) {
  const E = [], W = [], e = (p, m) => E.push(m ? `${p}: ${m}` : p);
  if (!isObj(doc)) return { ok: false, errors: ['$: document must be a JSON object'], warnings: [] };
  if (doc.$format !== FORMAT) e('$format', 'must be "dr3amy"');
  if (typeof doc.$version !== 'string' || !/^\d+\.\d+$/.test(doc.$version)) e('$version', 'must be a "MAJOR.MINOR" string');
  if (!TYPES.includes(doc.$type)) e('$type', 'must be one of ' + TYPES.join(', '));
  const m = doc.metadata;
  if (!isObj(m)) e('metadata', 'required object');
  else {
    if (typeof m.name !== 'string' || !m.name.trim()) e('metadata.name', 'required non-empty string');
    for (const k of ['created', 'modified']) if (!TS.test(m[k] || '')) e('metadata.' + k, 'must be a UTC timestamp like 2026-11-01T00:00:00Z');
    if (m.id !== undefined && (typeof m.id !== 'string' || !m.id)) e('metadata.id', 'must be a non-empty string');
  }
  if (!isObj(doc.data)) e('data', 'required object');
  else if (CHECK[doc.$type]) CHECK[doc.$type](doc.data, e, W);
  return { ok: !E.length, errors: E, warnings: W };
}

const MIGRATIONS = { // from-version -> function returning a 1.0 document
  '0.9': d => { d.metadata ??= {}; if (d.metadata.title && !d.metadata.name) { d.metadata.name = d.metadata.title; delete d.metadata.title; } d.$version = '1.0'; return d; },
};
export function versionStatus(v) {
  const [M] = v.split('.').map(Number);
  if (M === 1) return 'ok';
  if (MIGRATIONS[v]) return 'migrate';
  return M > 1 ? 'newer' : 'old';
}

/** Decode + migrate + validate a .dr3amy file (Uint8Array or ArrayBuffer). Never throws. */
export function parse(input) {
  const r = { ok: false, doc: null, errors: [], warnings: [], unsupported: false, migratedFrom: null };
  let bytes;
  try { bytes = input instanceof Uint8Array ? input : new Uint8Array(input); } catch { r.errors.push('Unreadable input.'); return r; }
  if (!bytes.length || bytes.length > MAX_BYTES) { r.errors.push('File is empty or larger than 50 MB.'); return r; }
  let hd; try { hd = readHeader(bytes); } catch (x) { r.errors.push(x.message); return r; }
  const ver = hd.major + '.' + hd.minor, st = versionStatus(ver);
  if (st === 'newer') { r.unsupported = true; r.errors.push(`Format version ${ver} is newer than this build supports (1.x). Update Dr3amy to open it. Nothing was changed.`); return r; }
  if (st === 'old') { r.unsupported = true; r.errors.push(`Format version ${ver} is too old to migrate automatically.`); return r; }
  let d; try { d = decodeDocument(bytes); } catch (x) { r.errors.push(x.message || 'Could not decode file.'); if (x.kind === 'unsupported') r.unsupported = true; return r; }
  if (st === 'migrate') { r.migratedFrom = ver; d = MIGRATIONS[ver](d); r.warnings.push(`Migrated from format ${ver} to ${VERSION}.`); }
  else if (ver !== VERSION) r.warnings.push(`Document is format ${ver}; this build writes ${VERSION}. Unknown fields are preserved.`);
  const v = validate(d);
  r.errors.push(...v.errors); r.warnings.push(...v.warnings);
  if (!r.errors.length) { r.ok = true; r.doc = d; if (!d.metadata.id) d.metadata.id = crypto.randomUUID(); }
  return r;
}
