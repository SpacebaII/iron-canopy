/* A minimal Mapbox vector tile decoder (protocol buffers by hand), for tools/city-sample.js: layers of features with
   their properties and geometry as rings of tile coordinates (0 to extent). */
function pb(buf) {
  let p = 0;
  const varint = () => { let r = 0, s = 0, b; do { b = buf[p++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  return { get pos() { return p; }, set pos(v) { p = v; }, varint, end: buf.length,
    field() { const k = varint(); return [k >> 3, k & 7]; },
    bytes() { const n = varint(); const s = buf.subarray(p, p + n); p += n; return s; },
    skip(w) { if (w === 0) varint(); else if (w === 1) p += 8; else if (w === 2) { const n = varint(); p += n; } else if (w === 5) p += 4; } };
}
const packed = b => { const r = pb(b), out = []; while (r.pos < b.length) out.push(r.varint()); return out; };
function value(b) { const r = pb(b); while (r.pos < b.length) { const [f, w] = r.field(); if (f === 1) return Buffer.from(r.bytes()).toString(); if (f === 2) { const v = Buffer.from(b.buffer, b.byteOffset + r.pos, 4).readFloatLE(0); r.pos += 4; return v; } if (f === 3) { const v = Buffer.from(b.buffer, b.byteOffset + r.pos, 8).readDoubleLE(0); r.pos += 8; return v; } if (f === 4 || f === 5) return r.varint(); if (f === 6) { const v = r.varint(); return (v >>> 1) ^ -(v & 1); } if (f === 7) return !!r.varint(); r.skip(w); } return null; }
function geom(cmds) {
  const rings = []; let x = 0, y = 0, cur = null, i = 0;
  while (i < cmds.length) { const c = cmds[i++], id = c & 7, n = c >> 3;
    if (id === 7) { if (cur) cur.push(cur[0]); continue; }
    for (let k = 0; k < n; k++) { const dx = (cmds[i] >>> 1) ^ -(cmds[i] & 1), dy = (cmds[i + 1] >>> 1) ^ -(cmds[i + 1] & 1); i += 2; x += dx; y += dy; if (id === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]); } }
  return rings;
}
module.exports = function decode(buf) {
  const r = pb(buf), layers = {};
  while (r.pos < r.end) { const [f, w] = r.field(); if (f !== 3) { r.skip(w); continue; }
    const lb = r.bytes(), L = pb(lb); let name = '', keys = [], vals = [], feats = [], extent = 4096;
    while (L.pos < lb.length) { const [g, w2] = L.field(); if (g === 1) name = Buffer.from(L.bytes()).toString(); else if (g === 3) keys.push(Buffer.from(L.bytes()).toString()); else if (g === 4) vals.push(value(L.bytes())); else if (g === 5) extent = L.varint(); else if (g === 2) feats.push(L.bytes()); else L.skip(w2); }
    layers[name] = { extent, features: feats.map(fb => { const F = pb(fb); let tags = [], type = 0, g = []; while (F.pos < fb.length) { const [h, w3] = F.field(); if (h === 2) tags = packed(F.bytes()); else if (h === 3) type = F.varint(); else if (h === 4) g = packed(F.bytes()); else F.skip(w3); } const props = {}; for (let i = 0; i < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]]; return { type, props, rings: geom(g) }; }) };
  }
  return layers;
};
