import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// v2.10.38: Public endpoint that lets the POS desktop app fetch its own
// shop's Supabase URL + key using just its license_key.
//
// Why this exists:
//   - The admin stores shop_supabase_url + shop_supabase_key in the
//     `licenses` table when creating a license.
//   - The POS app needs these to sync data to the shop's Supabase.
//   - Previously the user had to manually enter these in
//     Settings → License Info → Enable Online Sync. Most users skipped
//     this step → cards created in POS never got synced to Supabase →
//     QR scan on customer cards returned "Card not found".
//
// With this endpoint, the POS app auto-fetches its shop Supabase config
// on first launch (and after license activation) and caches it in
// localStorage. Sync then works automatically.
//
// Security: the license_key is the only auth. Anyone with the license_key
// (which is printed on every customer card's QR code) can fetch the shop's
// Supabase URL + anon key. This is acceptable because:
//   - The anon key is already PUBLIC (it's in NEXT_PUBLIC_SUPABASE_ANON_KEY)
//   - The shop's Supabase URL is not secret (it's in the customer card URL)
//   - Real auth is enforced by RLS on the shop's Supabase tables

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
        { status: 400 }
      );
    }

    const adminKey = ADMIN_SUPABASE_SERVICE_KEY || ADMIN_SUPABASE_ANON_KEY;
    if (!adminKey) {
      return NextResponse.json(
        { ok: false, error: "Server not configured" },
        { status: 500 }
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
        { status: 500 }
      );
    }

    if (!license) {
      return NextResponse.json(
        { ok: false, error: "License not found" },
        { status: 404 }
      );
    }

    if (license.is_revoked || !license.is_active) {
      return NextResponse.json(
        { ok: false, error: "License inactive or revoked" },
        { status: 403 }
      );
    }

    if (!license.shop_supabase_url || !license.shop_supabase_key) {
      return NextResponse.json(
        {
          ok: false,
          error: "Shop Supabase not configured. Please contact the admin to set up online sync.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: license.shop_supabase_url,
      key: license.shop_supabase_key,
    });
  } catch (err: any) {
    console.error("[shop-config] error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
