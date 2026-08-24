import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This route verifies the shopkeeper login by calling a Supabase Edge Function
// which uses service_role internally. This avoids needing service_role key in Vercel env vars.
//
// v2.10.22: Uses Supabase Edge Function 'portal-auth' which is deployed separately

const ADMIN_SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yghnbmtuyjzebqrcbavk.supabase.co";
const ADMIN_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_SNwoIutQIT-gky8PoCDiRg_BerVDD8n";

export async function POST(req: NextRequest) {
  try {
    const { licenseKey, email, password } = await req.json();

    if (!licenseKey || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "License Key, Email, and Password are required" },
        { status: 400 }
      );
    }

    // Call the portal-auth Edge Function (uses service_role internally)
    const res = await fetch(`${ADMIN_SUPABASE_URL}/functions/v1/portal-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_ANON_KEY}`,
        apikey: ADMIN_ANON_KEY,
      },
      body: JSON.stringify({
        licenseKey: licenseKey.toUpperCase().trim(),
        email: email.toLowerCase().trim(),
        password,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error || "Login failed" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      ok: true,
      shop: data.shop,
    });
  } catch (err: any) {
    console.error("Portal login error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
