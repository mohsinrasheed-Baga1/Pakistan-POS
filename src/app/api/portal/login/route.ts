import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This route connects to the CENTRAL admin Supabase to verify the shopkeeper
// and retrieve their shop-specific Supabase URL + key.
//
// v2.10.22: Hardcoded fallback for admin Supabase credentials
// This ensures the portal always works even if Vercel env vars don't save properly

const ADMIN_SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yghnbmtuyjzebqrcbavk.supabase.co";

const ADMIN_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnaG5ibXR1eWp6ZWJxcmNiYXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzMwMjQwMCwiZXhwIjoyMDQ4Njc4ODAwfQ.sYVpkSlxslmPpP-7G3X6pQYR2l9pX0qX0x0x0x0x0x0";

// v2.10.22: Check if we have valid credentials
function hasValidCredentials() {
  return ADMIN_SUPABASE_URL && ADMIN_SUPABASE_KEY && ADMIN_SUPABASE_KEY.length > 50;
}

export async function POST(req: NextRequest) {
  try {
    const { licenseKey, email, password } = await req.json();

    if (!licenseKey || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "License Key, Email, and Password are required" },
        { status: 400 }
      );
    }

    if (!ADMIN_SUPABASE_URL || !ADMIN_SUPABASE_KEY || !hasValidCredentials()) {
      return NextResponse.json(
        { ok: false, error: "Server not configured properly. Contact support with this code: PORTAL_ERR_001" },
        { status: 500 }
      );
    }

    const sb = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    // Find the license by license_key
    const { data: license, error } = await sb
      .from("licenses")
      .select("id, license_key, customer_name, shop_name, shop_address, portal_email, portal_password, shop_supabase_url, shop_supabase_key, is_active, is_revoked, expires_at")
      .eq("license_key", licenseKey.toUpperCase().trim())
      .single();

    if (error || !license) {
      return NextResponse.json(
        { ok: false, error: "License key not found. Please check and try again." },
        { status: 404 }
      );
    }

    // Check if license is active
    if (license.is_revoked) {
      return NextResponse.json(
        { ok: false, error: "This license has been revoked. Contact support." },
        { status: 403 }
      );
    }

    if (!license.is_active) {
      return NextResponse.json(
        { ok: false, error: "This license is inactive. Contact support." },
        { status: 403 }
      );
    }

    // Check expiry
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return NextResponse.json(
        { ok: false, error: "This license has expired. Please renew." },
        { status: 403 }
      );
    }

    // Check if portal access is configured
    if (!license.portal_email || !license.portal_password) {
      return NextResponse.json(
        { ok: false, error: "Online portal access is not enabled for this license. Contact your provider." },
        { status: 403 }
      );
    }

    // Verify email (case-insensitive)
    if (license.portal_email.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Verify password (plain text comparison for now — admin sets it)
    if (license.portal_password !== password) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Check if Supabase credentials are set
    if (!license.shop_supabase_url || !license.shop_supabase_key) {
      return NextResponse.json(
        { ok: false, error: "Shop database not configured. Contact your provider." },
        { status: 500 }
      );
    }

    // Success! Return shop info + Supabase credentials
    return NextResponse.json({
      ok: true,
      shop: {
        licenseKey: license.license_key,
        shopName: license.shop_name,
        shopAddress: license.shop_address || "",
        customerName: license.customer_name,
        supabaseUrl: license.shop_supabase_url,
        supabaseKey: license.shop_supabase_key,
      },
    });
  } catch (err: any) {
    console.error("Portal login error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
