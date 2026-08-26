import { NextRequest, NextResponse } from "next/server";

// v2.10.25: Direct Edge Function call with full debug logging

const ADMIN_SUPABASE_URL = "https://yghnbmtuyjzebqrcbavk.supabase.co";
const ADMIN_ANON_KEY = "sb_publishable_SNwoIutQIT-gky8PoCDiRg_BerVDD8n";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { licenseKey, email, password } = body;

    if (!licenseKey || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "All fields required" },
        { status: 400 }
      );
    }

    console.log("[Portal Login] Attempting:", { licenseKey, email });

    // Call Edge Function
    const edgeRes = await fetch(`${ADMIN_SUPABASE_URL}/functions/v1/portal-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ADMIN_ANON_KEY}`,
        "apikey": ADMIN_ANON_KEY,
      },
      body: JSON.stringify({
        licenseKey: licenseKey.toUpperCase().trim(),
        email: email.toLowerCase().trim(),
        password: password,
      }),
    });

    console.log("[Portal Login] Edge status:", edgeRes.status);

    const edgeData = await edgeRes.json();
    console.log("[Portal Login] Edge response:", JSON.stringify(edgeData));

    if (edgeData.ok && edgeData.shop) {
      return NextResponse.json({
        ok: true,
        shop: edgeData.shop,
      });
    } else {
      return NextResponse.json(
        { ok: false, error: edgeData.error || "Login failed" },
        { status: 401 }
      );
    }
  } catch (err: any) {
    console.error("[Portal Login] Error:", err.message);
    return NextResponse.json(
      { ok: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
