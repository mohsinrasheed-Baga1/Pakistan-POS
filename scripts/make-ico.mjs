import sharp from "sharp";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const out = join(process.cwd(), "build");
mkdirSync(out, { recursive: true });

if (!existsSync(join(out, "icon.png"))) {
  console.error("ERROR: build/icon.png not found. Run make-icon.mjs first.");
  process.exit(1);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(
  sizes.map((s) => sharp(join(out, "icon.png")).resize(s, s).png().toBuffer())
);

const headerSize = 6;
const entrySize = 16;
const count = pngs.length;
const offsetStart = headerSize + entrySize * count;

let offset = offsetStart;
const entries = [];
for (let i = 0; i < count; i++) {
  const png = pngs[i];
  const w = sizes[i] === 256 ? 0 : sizes[i];
  const h = sizes[i] === 256 ? 0 : sizes[i];
  entries.push({ width: w, height: h, size: png.length, offset: offset, data: png });
  offset += png.length;
}

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);

const entryBufs = entries.map((e) => {
  const b = Buffer.alloc(entrySize);
  b.writeUInt8(e.width, 0);
  b.writeUInt8(e.height, 1);
  b.writeUInt8(0, 2);
  b.writeUInt8(0, 3);
  b.writeUInt16LE(1, 4);
  b.writeUInt16LE(32, 6);
  b.writeUInt32LE(e.size, 8);
  b.writeUInt32LE(e.offset, 12);
  return b;
});

const result = Buffer.concat([header, ...entryBufs, ...pngs]);
const fs = await import("fs");
fs.writeFileSync(join(out, "icon.ico"), result);
console.log(`icon.ico generated (${result.length} bytes, ${count} sizes)`);
