import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

// Read version from package.json at BUILD TIME.
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
const APP_VERSION = pkg.version || "0.0.0";

// Check if we're building for Vercel (web) or Electron (desktop)
// Vercel sets VERCEL=1 environment variable during build
const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_URL;

const nextConfig: NextConfig = {
  // v2.10.19: Only use standalone output for Electron (desktop) builds
  // Vercel needs default output (no output: "standalone")
  ...(isVercel ? {} : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Disable sharp-based image optimization so the app doesn't require the
  // platform-specific sharp native binary.
  images: {
    unoptimized: true,
  },
  // Embed the app version as a build-time env variable.
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_IS_VERCEL: isVercel ? "true" : "false",
  },
};

export default nextConfig;
