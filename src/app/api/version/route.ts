import { NextResponse } from "next/server";

// Returns the app version. This is set at BUILD TIME by next.config.ts
// which reads package.json and embeds it as process.env.NEXT_PUBLIC_APP_VERSION.
// This works in both dev mode and the Electron standalone build because
// the value is inlined as a string literal — no filesystem access at runtime.
export async function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "2.7.48";
  return NextResponse.json({ version });
}
