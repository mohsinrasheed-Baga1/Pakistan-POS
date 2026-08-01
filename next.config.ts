import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

// Read version from package.json at BUILD TIME. This gets inlined into
// the standalone build as a string literal — no filesystem access needed
// at runtime, which means it works in Electron's packaged app where
// process.cwd() points to a different directory.
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
const APP_VERSION = pkg.version || "0.0.0";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Disable sharp-based image optimization so the app doesn't require the
  // platform-specific sharp native binary (which would need separate
  // win32/linux builds). Images still work — they're just served as-is.
  images: {
    unoptimized: true,
  },
  // Embed the app version as a build-time env variable. This is available
  // on both client and server as process.env.NEXT_PUBLIC_APP_VERSION.
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
};

export default nextConfig;
