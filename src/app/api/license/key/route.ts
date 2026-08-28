import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// v2.10.45: CRITICAL FIX — this endpoint runs BOTH on:
//   - Vercel (pakistanpos.vercel.app) — has SUPABASE_SERVICE_ROLE_KEY env var
//   - POS desktop app (localhost:4783) — does NOT have service role key
//
// On the POS desktop app, process.env.SUPABASE_SERVICE_ROLE_KEY is undefined.
// Previous code fell back to ADMIN_SUPABASE_ANON_KEY, but the anon key is
// blocked by RLS on the licenses table → returns empty array → 404.
//
// FIX: Always call the live portal endpoint (pakistanpos.vercel.app)
// instead of querying Supabase directly. This works regardless of which
// server the code runs on (POS desktop OR Vercel).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const PORTAL_URL = "https://pakistanpos.vercel.app";

export async function GET() {
  try {
    // v2.10.45: Always call the live portal — it has the service role key.
    const res = await fetch(`${PORTAL_URL}/api/license/key`, {
      cache: "no-store",
      headers: { "X-Source": "pos-desktop-or-vercel" },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.licenseKey) {
        console.log("[license/key] Returning license key from portal:", data.licenseKey);
        return NextResponse.json({ licenseKey: data.licenseKey }, { headers: CORS_HEADERS });
      }
    }

    // FALLBACK — try direct Supabase query (works on Vercel, may fail on desktop)
    const ADMIN_SUPABASE_URL =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://yghnbmtuyjzebqrcbavk.supabase.co";
    const ADMIN_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const ADMIN_SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "sb_publishable_SNwoIutQIT-gky8PoCDiRg_BerVDD8n";

    const adminKey = ADMIN_SUPABASE_SERVICE_KEY || ADMIN_SUPABASE_ANON_KEY;
    if (adminKey) {
      try {
        const adminSb = createClient(ADMIN_SUPABASE_URL, adminKey, {
          auth: { persistSession: false },
        });
        const { data: licenses, error } = await adminSb
          .from("licenses")
          .select("license_key, is_active, is_revoked")
          .eq("is_active", true)
          .eq("is_revoked", false)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!error && licenses && licenses.length > 0) {
          console.log("[license/key] Returning license key from Supabase direct:", licenses[0].license_key);
          return NextResponse.json({ licenseKey: licenses[0].license_key }, { headers: CORS_HEADERS });
        }
      } catch (e: any) {
        console.warn("[license/key] Direct Supabase query failed:", e?.message);
      }
    }

    return NextResponse.json(
      { licenseKey: null, error: "Could not retrieve license key" },
      { status: 404, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("[license/key] error:", err?.message || err);
    return NextResponse.json(
      { licenseKey: null, error: "Server error: " + (err?.message || "Unknown") },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

