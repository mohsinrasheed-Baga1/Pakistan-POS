import { NextResponse } from "next/server";

// Returns the app version from package.json. Used by the Settings page
// to display the current version and compare against the latest GitHub
// release when checking for updates.
export async function GET() {
  // Read version from package.json at build time — this gets inlined
  // into the standalone build so it's always accurate.
  const version = process.env.npm_package_version || "2.7.44";
  return NextResponse.json({ version });
}
