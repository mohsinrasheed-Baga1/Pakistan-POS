// Cross-platform copy script for Next.js build assets
// Replaces: cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
const fs = require("fs");
const path = require("path");

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source not found: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  console.log(`Copied: ${src} -> ${dest}`);
}

const root = path.resolve(__dirname, "..");

// Copy .next/static -> .next/standalone/.next/static
copyDirSync(
  path.join(root, ".next", "static"),
  path.join(root, ".next", "standalone", ".next", "static")
);

// Copy public -> .next/standalone/public
copyDirSync(
  path.join(root, "public"),
  path.join(root, ".next", "standalone", "public")
);

console.log("Build assets copied successfully.");
