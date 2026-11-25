import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ICONS_DIR = path.resolve(import.meta.dirname, '..', 'icons');
fs.mkdirSync(ICONS_DIR, { recursive: true });

// Minimal pure-Node RGBA PNG encoder using zlib.deflateSync
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance to a rounded rectangle centered at (0.5, 0.5)
function sdRoundedBox(x, y, halfW, halfH, r) {
  const qx = Math.abs(x - 0.5) - halfW + r;
  const qy = Math.abs(y - 0.5) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Distance from point (px, py) to segment (ax, ay)-(bx, by)
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const t = c1 / c2;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 supersampling for super crisp edges

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (px + (sx + 0.5) / samples) / size;
          const v = (py + (sy + 0.5) / samples) / size;

          const dBox = sdRoundedBox(u, v, 0.46, 0.46, 0.22);
          if (dBox > 0) continue;

          // Emerald (#10b981) -> Indigo (#4f46e5) diagonal gradient
          const grad = Math.min(1, Math.max(0, (u * 0.6 + v * 0.75) - 0.1));
          let cr = 16 + (79 - 16) * grad;
          let cg = 185 + (70 - 185) * grad;
          let cb = 129 + (229 - 129) * grad;

          // Stylized white "V" glyph (left stroke + right stroke)
          const dLeft = distToSegment(u, v, 0.26, 0.27, 0.49, 0.74);
          const dRight = distToSegment(u, v, 0.73, 0.27, 0.49, 0.74);
          const strokeHalf = 0.068;

          // Subtle gold vocabulary spark dot in upper-right
          const dSpark = Math.hypot(u - 0.77, v - 0.24);

          if (dLeft <= strokeHalf || dRight <= strokeHalf) {
            cr = 255;
            cg = 255;
            cb = 255;
          } else if (dSpark <= 0.075) {
            cr = 251;
            cg = 191;
            cb = 36;
          }

          rAcc += cr;
          gAcc += cg;
          bAcc += cb;
          aAcc += 255;
        }
      }

      const denom = samples * samples;
      const idx = (py * size + px) * 4;
      const alpha = aAcc / denom;
      if (alpha > 0) {
        // Premultiplied -> unpremultiplied color
        const activeSamples = aAcc / 255;
        rgba[idx] = Math.round(rAcc / activeSamples);
        rgba[idx + 1] = Math.round(gAcc / activeSamples);
        rgba[idx + 2] = Math.round(bAcc / activeSamples);
        rgba[idx + 3] = Math.round(alpha);
      }
    }
  }

  return encodePng(size, size, rgba);
}

for (const size of [16, 32, 48, 128]) {
  const png = renderIcon(size);
  const outPath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
