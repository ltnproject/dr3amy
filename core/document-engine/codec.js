// Dr3amy binary container ("DR3A"). Spec: documentation/FILE-FORMAT.md. No DOM, no JSON.
export const MAGIC = [0x89, 0x44, 0x52, 0x33, 0x0D, 0x0A, 0x1A, 0x0A]; // \x89 D R 3 \r \n ^Z \n
export const HEADER = 16; // magic(8) major(1) minor(1) type(1) flags(1) payloadLength(u32 LE)
export const TYPE_CODES = { calendar: 1, document: 2, project: 3, database: 4, settings: 5, workspace: 6 };
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODES).map(([k, v]) => [v, k]));
export class FormatError extends Error { constructor(m, kind = 'malformed') { super(m); this.kind = kind; } }
const te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });
const MAX_DEPTH = 64;

let CT;
export function crc32(b, end = b.length) {
  if (!CT) { CT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CT[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < end; i++) c = CT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

class W {
  constructor() { this.b = new Uint8Array(2048); this.n = 0; }
  need(k) { if (this.n + k > this.b.length) { const x = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); x.set(this.b); this.b = x; } }
  byte(v) { this.need(1); this.b[this.n++] = v; }
  bytes(a) { this.need(a.length); this.b.set(a, this.n); this.n += a.length; }
  varint(v) { while (v >= 128) { this.byte((v % 128) | 128); v = Math.floor(v / 128); } this.byte(v); }
  str(s) { const e = te.encode(s); this.varint(e.length); this.bytes(e); }
  f64(v) { this.need(8); new DataView(this.b.buffer).setFloat64(this.n, v, true); this.n += 8; }
  u32(v) { this.need(4); new DataView(this.b.buffer).setUint32(this.n, v >>> 0, true); this.n += 4; }
  out() { return this.b.slice(0, this.n); }
}
// Value tags: 0 null, 1 false, 2 true, 3 int (zigzag varint), 4 float64, 5 string, 6 list, 7 map
function enc(w, v, depth = 0) {
  if (depth > MAX_DEPTH) throw new FormatError('Document is nested too deeply.');
  if (v === null || v === undefined) w.byte(0);
  else if (v === false) w.byte(1);
  else if (v === true) w.byte(2);
  else if (typeof v === 'number') { if (Number.isSafeInteger(v) && Math.abs(v) < 2 ** 51) { w.byte(3); w.varint(v >= 0 ? v * 2 : -v * 2 - 1); } else { w.byte(4); w.f64(v); } }
  else if (typeof v === 'string') { w.byte(5); w.str(v); }
  else if (Array.isArray(v)) { w.byte(6); w.varint(v.length); for (const x of v) enc(w, x, depth + 1); }
  else if (typeof v === 'object') { const ks = Object.keys(v).filter(k => v[k] !== undefined); w.byte(7); w.varint(ks.length); for (const k of ks) { w.str(k); enc(w, v[k], depth + 1); } }
  else throw new FormatError('Cannot encode a value of type ' + typeof v);
}

class R {
  constructor(b, p, end) { this.b = b; this.p = p; this.end = end; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  byte() { if (this.p >= this.end) throw new FormatError('Unexpected end of data.'); return this.b[this.p++]; }
  varint() { let r = 0, m = 1; for (let i = 0; i < 8; i++) { const c = this.byte(); r += (c & 127) * m; if (c < 128) return r; m *= 128; } throw new FormatError('Number is too large.'); }
  str() { const n = this.varint(); if (this.p + n > this.end) throw new FormatError('A string runs past the end of the data.'); const s = td.decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
  f64() { if (this.p + 8 > this.end) throw new FormatError('Unexpected end of data.'); const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
}
function dec(r, depth = 0) {
  if (depth > MAX_DEPTH) throw new FormatError('Document is nested too deeply.');
  const t = r.byte();
  switch (t) {
    case 0: return null; case 1: return false; case 2: return true;
    case 3: { const z = r.varint(); return z % 2 ? -(z + 1) / 2 : z / 2; }
    case 4: return r.f64();
    case 5: return r.str();
    case 6: { const n = r.varint(); if (n > r.end - r.p) throw new FormatError('A list is longer than the data.'); const a = []; for (let i = 0; i < n; i++) a.push(dec(r, depth + 1)); return a; }
    case 7: { const n = r.varint(); if (n > r.end - r.p) throw new FormatError('A map is longer than the data.'); const o = {}; for (let i = 0; i < n; i++) { const k = r.str(); if (k === '__proto__') throw new FormatError('Forbidden key.'); o[k] = dec(r, depth + 1); } return o; }
    default: throw new FormatError('Unknown value tag 0x' + t.toString(16) + '.');
  }
}

/** Validate the fixed header only. */
export function readHeader(b) {
  let i = 0; while (i < b.length && (b[i] === 32 || b[i] === 10 || b[i] === 13 || b[i] === 9)) i++;
  if (b[i] === 0x7B || b[i] === 0x5B) throw new FormatError('This is a JSON text file. Dr3amy documents are a binary format and are not JSON.', 'notdr3amy');
  if (b.length < HEADER + 4) throw new FormatError('File is too small to be a Dr3amy document.', 'notdr3amy');
  for (let k = 0; k < 8; k++) if (b[k] !== MAGIC[k]) throw new FormatError('Not a Dr3amy file (signature mismatch). If it was transferred as text it may have been altered.', 'notdr3amy');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { major: b[8], minor: b[9], code: b[10], flags: b[11], len: dv.getUint32(12, true) };
}

/** Bytes -> document object. Throws FormatError. */
export function decodeDocument(b) {
  const hd = readHeader(b), total = HEADER + hd.len + 4;
  if (b.length < total) throw new FormatError('File is truncated (it ends before the declared length).');
  if (b.length > total) throw new FormatError('File has unexpected extra data after the end.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(HEADER + hd.len, true) !== crc32(b, HEADER + hd.len)) throw new FormatError('File is damaged: the checksum does not match.');
  const type = CODE_TYPE[hd.code];
  if (!type) throw new FormatError('Unknown document type code ' + hd.code + '. It may need a newer Dr3amy.', 'unsupported');
  let payload;
  try { const r = new R(b, HEADER, HEADER + hd.len); payload = dec(r); if (r.p !== r.end) throw new FormatError('Extra bytes inside the payload.'); }
  catch (e) { throw e instanceof FormatError ? e : new FormatError('Payload is malformed (invalid text encoding).'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new FormatError('Payload must be a map.');
  const doc = { $format: 'dr3amy', $version: hd.major + '.' + hd.minor, $type: type };
  for (const [k, v] of Object.entries(payload)) if (!k.startsWith('$')) doc[k] = v;
  return doc;
}

/** Document object -> bytes. */
export function encodeDocument(doc) {
  const code = TYPE_CODES[doc.$type], m = /^(\d+)\.(\d+)$/.exec(doc.$version || '');
  if (!code) throw new FormatError('Unknown document type: ' + doc.$type);
  if (!m || +m[1] > 255 || +m[2] > 255) throw new FormatError('Bad version: ' + doc.$version);
  const p = new W(); const body = { metadata: doc.metadata, data: doc.data };
  for (const [k, v] of Object.entries(doc)) if (!k.startsWith('$') && k !== 'metadata' && k !== 'data') body[k] = v;
  enc(p, body); const payload = p.out();
  const w = new W(); w.bytes(MAGIC); w.byte(+m[1]); w.byte(+m[2]); w.byte(code); w.byte(0); w.u32(payload.length); w.bytes(payload);
  const head = w.out(); w.u32(crc32(head)); return w.out();
}
