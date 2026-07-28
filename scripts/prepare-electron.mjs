// Prepares Electron resources. Renames node_modules -> nm to bypass
// electron-builder's automatic node_modules pruning in extraResources.
import { existsSync, rmSync, cpSync, mkdirSync, renameSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const root = process.cwd();
const standaloneSrc = join(root, ".next", "standalone");
const serverDest = join(root, "dist-electron-server");

console.log("[prepare-electron] Copying Next.js standalone build...");
if (!existsSync(standaloneSrc)) {
  console.error("[prepare-electron] ERROR: .next/standalone not found. Run 'next build' first.");
  process.exit(1);
}

if (existsSync(serverDest)) rmSync(serverDest, { recursive: true, force: true });
mkdirSync(serverDest, { recursive: true });
cpSync(standaloneSrc, serverDest, { recursive: true });
console.log("[prepare-electron] Standalone copied to", serverDest);

// Rename node_modules -> nm so electron-builder includes ALL of it in extraResources
// (electron-builder strips node_modules in extraResources by default).
const nmOld = join(serverDest, "node_modules");
const nmNew = join(serverDest, "nm");
if (existsSync(nmOld)) {
  renameSync(nmOld, nmNew);
  console.log("[prepare-electron] Renamed node_modules -> nm");
}

// Patch server.js so Node can resolve modules from "nm" instead of "node_modules".
// We do this by setting NODE_PATH env at runtime (handled in main.cjs) AND by
// creating a tiny loader. Simplest: keep node_modules as a symlink to nm.
// But symlinks may not survive packaging. Instead we patch the standalone's
// require resolution by creating node_modules back as a junction.
// Cleanest cross-platform: set NODE_PATH in main.cjs. Done there.

// Generate fresh template DB
console.log("[prepare-electron] Generating template pos.db...");
const templateDb = join(serverDest, "pos.db");
if (existsSync(templateDb)) rmSync(templateDb, { force: true });
try {
  execSync("bunx prisma db push --skip-generate", {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
  });
  console.log("[prepare-electron] Template DB created");
} catch (e) {
  console.error("[prepare-electron] Failed to create template DB:", e.message);
  process.exit(1);
}

// Copy Google OAuth config + electron google-drive module
console.log("[prepare-electron] Copying Google OAuth config...");
const oauthConfigSrc = join(root, "google-oauth.config.json");
if (existsSync(oauthConfigSrc)) {
  cpSync(oauthConfigSrc, join(serverDest, "google-oauth.config.json"));
  console.log("[prepare-electron] google-oauth.config.json copied");
}

// Verify
const checks = [
  join(serverDest, "server.js"),
  join(nmNew, ".prisma", "client"),
  join(nmNew, "@prisma", "client"),
];
for (const c of checks) {
  console.log(existsSync(c) ? "[prepare-electron] OK: " + c : "[prepare-electron] MISSING: " + c);
}
console.log("[prepare-electron] Done.");
