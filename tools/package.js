/* Builds the upload for itch.io (or any static host): a zip of iron-canopy/ with index.html at its root, as itch.io's
   HTML5 upload wants it. No dependencies: the zip is written here with Node's zlib.
   node tools/package.js            → dist/iron-canopy-v<version>.zip, and prints what is in it
   The version comes from IC.VERSION in iron-canopy/js/core.js. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'iron-canopy');
const version = (/IC\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(SRC, 'js/core.js'), 'utf8')) || [])[1];
if (!version) { console.error('No IC.VERSION in iron-canopy/js/core.js'); process.exit(1); }

// every file under iron-canopy/, in a stable order, without editor litter
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (/^\.|~$|\.swp$|^Thumbs\.db$/i.test(f)) continue;
    if (fs.statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(SRC);
if (!files.some(f => path.relative(SRC, f) === 'index.html')) { console.error('iron-canopy/index.html is missing'); process.exit(1); }
// every script index.html loads must be in the zip
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) if (!fs.existsSync(path.join(SRC, src))) { console.error(`index.html loads ${src}, which is missing`); process.exit(1); }

/* ---------- a zip file: local headers, the data, a central directory ---------- */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
// (the date the files carry: now, in the zip's DOS format)
const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
const locals = [], centrals = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(path.relative(SRC, f).split(path.sep).join('/'), 'utf8');
  const raw = fs.readFileSync(f), packed = zlib.deflateRawSync(raw, { level: 9 });
  const store = packed.length >= raw.length, data = store ? raw : packed, crc = crc32(raw);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(store ? 0 : 8, 8);
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(store ? 0 : 8, 10);
  ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24);
  ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 30); ch.writeUInt32LE(0, 34); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
  locals.push(lh, name, data); centrals.push(ch, name);
  offset += lh.length + name.length + data.length;
}
const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat(locals.concat([cd, end]));

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', `iron-canopy-v${version}.zip`);
fs.writeFileSync(out, zip);
const kb = n => `${Math.round(n / 1024).toLocaleString('en-US')} KB`;
console.log(`${path.relative(ROOT, out)}: ${files.length} files, ${kb(files.reduce((a, f) => a + fs.statSync(f).size, 0))} → ${kb(zip.length)}`);
console.log('Upload it to itch.io as an HTML game ("This file will be played in the browser"); index.html is at the root.');
console.log('It needs the internet for its fonts (Google Fonts) and, for the 3D replay only, three.js from cdnjs.');
