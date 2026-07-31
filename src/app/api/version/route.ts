import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Returns the app version from package.json. Used by the Settings page
// to display the current version and compare against the latest GitHub
// release when checking for updates.
//
// We read package.json directly from the filesystem at runtime. This works
// in both dev mode and the standalone production build because Next.js
// bundles package.json into the standalone output.
//
// If reading fails for any reason, we fall back to a hardcoded version
// that should be updated with each release.
export async function GET() {
  let version = "2.7.47"; // fallback — update with each release

  // Try reading from package.json in the current working directory
  try {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (pkg.version) {
      version = pkg.version;
    }
  } catch {
    // If package.json is not found (e.g. in a bundled Electron app where
    // the cwd is different), try reading from the server directory
    try {
      // In the standalone build, the server runs from dist-electron-server
      // or .next/standalone. package.json should be in the parent or root.
      const possiblePaths = [
        join(__dirname, "..", "..", "package.json"),
        join(__dirname, "..", "package.json"),
        join(process.cwd(), "..", "package.json"),
      ];
      for (const p of possiblePaths) {
        try {
          const pkg = JSON.parse(readFileSync(p, "utf-8"));
          if (pkg.version) {
            version = pkg.version;
            break;
          }
        } catch {}
      }
    } catch {}
  }

  return NextResponse.json({ version });
}
