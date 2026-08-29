/* Gera ícones PNG (navy + monograma "H" dourado) sem dependências externas. */
const zlib = require("zlib");
const fs = require("fs");

function crc32(buf) {
  let c, table = crc32.t || (crc32.t = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })());
  c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// mistura cor sobre rgba com alpha
function blend(buf, i, r, g, b, a) {
  const ia = 1 - a;
  buf[i] = Math.round(r * a + buf[i] * ia);
  buf[i + 1] = Math.round(g * a + buf[i + 1] * ia);
  buf[i + 2] = Math.round(b * a + buf[i + 2] * ia);
  buf[i + 3] = 255;
}

function draw(size, pad) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    // fundo navy com leve gradiente diagonal
    const t = (x + y) / (2 * s);
    buf[i] = Math.round(16 + (7 - 16) * t);   // ~#102A54 -> #071528
    buf[i + 1] = Math.round(42 + (21 - 42) * t);
    buf[i + 2] = Math.round(84 + (40 - 84) * t);
    buf[i + 3] = 255;
  }
  // monograma H dourado (proporcional), com padding p/ versões maskable
  const gold = [201, 162, 39];
  const glight = [240, 214, 143];
  const inner = s - pad * 2;
  const barW = Math.round(inner * 0.11);
  const top = pad + Math.round(inner * 0.24);
  const bot = pad + Math.round(inner * 0.76);
  const left = pad + Math.round(inner * 0.28);
  const right = pad + Math.round(inner * 0.72) - barW;
  const midTop = pad + Math.round(inner * 0.45);
  const midBot = pad + Math.round(inner * 0.55);
  const rect = (x0, x1, y0, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= s || y >= s) continue;
      const i = (y * s + x) * 4;
      const g = (y - y0) / Math.max(1, (y1 - y0));
      blend(buf, i,
        Math.round(glight[0] * (1 - g) + gold[0] * g),
        Math.round(glight[1] * (1 - g) + gold[1] * g),
        Math.round(glight[2] * (1 - g) + gold[2] * g), 1);
    }
  };
  rect(left, left + barW, top, bot);
  rect(right, right + barW, top, bot);
  rect(left, right + barW, midTop, midBot);
  return png(s, s, buf);
}

const out = __dirname;
fs.writeFileSync(out + "/icon-192.png", draw(192, 20));
fs.writeFileSync(out + "/icon-512.png", draw(512, 52));
fs.writeFileSync(out + "/icon-maskable-512.png", draw(512, 96));
console.log("Ícones gerados.");
