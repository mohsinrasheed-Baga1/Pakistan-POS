import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// v2.10.41: CORS headers — allow the POS desktop app (running on
// http://127.0.0.1:4783) to fetch this endpoint from the renderer process.
// Without these headers, Chromium blocks the response due to CORS policy,
// and the auto-fetch of shop Supabase config silently fails → new cards
// never sync to Supabase → customer sees "Card not found" on QR scan.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// v2.10.38: Public endpoint that lets the POS desktop app fetch its own
// shop's Supabase URL + key using just its license_key.
//
// Security: the license_key is the only auth. The shop Supabase URL is
// already public (it's in the QR code on every customer card). The shop
// Supabase anon key is already public (RLS protects sensitive ops).

const ADMIN_SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://yghnbmtuyjzebqrcbavk.supabase.co";
const ADMIN_SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_SNwoIutQIT-gky8PoCDiRg_BerVDD8n";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const licenseKey = (searchParams.get("licenseKey") || "").trim().toUpperCase();

    if (!licenseKey) {
      return NextResponse.json(
        { ok: false, error: "licenseKey is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const adminKey = ADMIN_SUPABASE_SERVICE_KEY || ADMIN_SUPABASE_ANON_KEY;
    if (!adminKey) {
      return NextResponse.json(
        { ok: false, error: "Server not configured" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const adminSb = createClient(ADMIN_SUPABASE_URL, adminKey, {
      auth: { persistSession: false },
    });

    const { data: license, error } = await adminSb
      .from("licenses")
      .select("shop_supabase_url, shop_supabase_key, is_active, is_revoked")
      .eq("license_key", licenseKey)
      .maybeSingle();

    if (error) {
      console.error("[shop-config] query error:", error.message);
      return NextResponse.json(
        { ok: false, error: "Lookup failed" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    if (!license) {
      return NextResponse.json(
        { ok: false, error: "License not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (license.is_revoked || !license.is_active) {
      return NextResponse.json(
        { ok: false, error: "License inactive or revoked" },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    if (!license.shop_supabase_url || !license.shop_supabase_key) {
      return NextResponse.json(
        {
          ok: false,
          error: "Shop Supabase not configured. Please contact the admin to set up online sync.",
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        url: license.shop_supabase_url,
        key: license.shop_supabase_key,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("[shop-config] error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
