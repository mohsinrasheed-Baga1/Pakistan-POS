import sharp from "sharp";
import { mkdirSync } from "fs";
import { join } from "path";

const out = join(process.cwd(), "build");
mkdirSync(out, { recursive: true });

// PNG sizes for ICO (multiple resolutions embedded)
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngs = await Promise.all(
  sizes.map((s) => sharp(join(out, "icon.png")).resize(s, s).png().toBuffer())
);

// Build ICO file header
const headerSize = 6;
const entrySize = 16;
const count = pngs.length;
const offsetStart = headerSize + entrySize * count;

// Calculate offsets
let offset = offsetStart;
const entries = [];
for (let i = 0; i < count; i++) {
  const png = pngs[i];
  const w = sizes[i] === 256 ? 0 : sizes[i];
  const h = sizes[i] === 256 ? 0 : sizes[i];
  entries.push({
    width: w,
    height: h,
    size: png.length,
    offset: offset,
    data: png,
  });
  offset += png.length;
}

// Header
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = ICO
header.writeUInt16LE(count, 4);

// Entries
const entryBufs = entries.map((e) => {
  const b = Buffer.alloc(entrySize);
  b.writeUInt8(e.width, 0);
  b.writeUInt8(e.height, 1);
  b.writeUInt8(0, 2);  // color palette
  b.writeUInt8(0, 3);  // reserved
  b.writeUInt16LE(1, 4);  // color planes
  b.writeUInt16LE(32, 6); // bits per pixel
  b.writeUInt32LE(e.size, 8);
  b.writeUInt32LE(e.offset, 12);
  return b;
});

const result = Buffer.concat([header, ...entryBufs, ...pngs]);
const fs = await import("fs");
fs.writeFileSync(join(out, "icon.ico"), result);
console.log(`icon.ico generated (${result.length} bytes, ${count} sizes)`);
