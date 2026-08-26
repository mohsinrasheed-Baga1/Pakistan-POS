import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// v2.10.29 FIX: Card lookup for QR scan
// QR contains: /card/[licenseKey]/[cardNumber]
// The client page calls: /api/portal/card?licenseKey=...&cardNumber=...
//
// BUG FIXED: Previous version used `params` (dynamic route segments) but the client
// sends QUERY STRING params. `params` was undefined → destructure threw → 500 "Server error".
// Now we read from `req.nextUrl.searchParams` which is the correct way for query strings.
//
// No login required — customer just scans QR and sees their balance.

// Admin Supabase config — try service role first (bypasses RLS), fall back to anon.
// NOTE: For production, SUPABASE_SERVICE_ROLE_KEY must be set as a Vercel env var.
// If only anon key is available, the licenses table query will fail due to RLS —
// in that case we return a clear error telling user to add the env var.
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
    // FIX: Read from query string (the actual way the client sends data)
    const { searchParams } = new URL(req.url);
    const licenseKey = (searchParams.get("licenseKey") || "").trim();
    const cardNumber = (searchParams.get("cardNumber") || "").trim();

    if (!licenseKey || !cardNumber) {
      return NextResponse.json(
        { ok: false, error: "Invalid QR code" },
        { status: 400 }
      );
    }

    // Choose the best key we have. Service role bypasses RLS — preferred.
    // Anon key only works if RLS policy allows public read on licenses (not recommended).
    const adminKey = ADMIN_SUPABASE_SERVICE_KEY || ADMIN_SUPABASE_ANON_KEY;
    if (!adminKey) {
      console.error(
        "[portal/card] No Supabase key configured. Set SUPABASE_SERVICE_ROLE_KEY on Vercel."
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Server not configured. Please contact the shopkeeper.",
        },
        { status: 500 }
      );
    }

    // Step 1: Find the shop's Supabase credentials from admin Supabase
    const adminSb = createClient(ADMIN_SUPABASE_URL, adminKey, {
      auth: { persistSession: false },
    });

    const { data: license, error: licError } = await adminSb
      .from("licenses")
      .select(
        "shop_name, shop_address, shop_supabase_url, shop_supabase_key, is_active, is_revoked"
      )
      .eq("license_key", licenseKey.toUpperCase().trim())
      .maybeSingle();

    if (licError) {
      console.error("[portal/card] License query error:", licError.message);
      // If using anon key and RLS blocks the read, licError will mention RLS
      if (
        licError.message.includes("permission") ||
        licError.message.includes("RLS") ||
        licError.message.includes("policy")
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Server not configured. Please contact the shopkeeper to set SUPABASE_SERVICE_ROLE_KEY.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { ok: false, error: "Shop lookup failed. Please try again later." },
        { status: 500 }
      );
    }

    if (!license) {
      return NextResponse.json(
        { ok: false, error: "Shop not found. Please contact the shopkeeper." },
        { status: 404 }
      );
    }

    if (license.is_revoked || !license.is_active) {
      return NextResponse.json(
        {
          ok: false,
          error: "This shop's service is currently unavailable.",
        },
        { status: 403 }
      );
    }

    if (!license.shop_supabase_url || !license.shop_supabase_key) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Shop database not configured. Please ask the shopkeeper to set up online sync.",
        },
        { status: 500 }
      );
    }

    // Step 2: Connect to shop's Supabase and fetch card data
    const shopSb = createClient(
      license.shop_supabase_url,
      license.shop_supabase_key,
      { auth: { persistSession: false } }
    );

    // Get card info — try exact match first (case-insensitive normalized)
    const cardLookup = cardNumber.toUpperCase().trim();
    const { data: card, error: cardError } = await shopSb
      .from("customer_cards")
      .select(
        "card_number, customer_name, customer_phone, balance, card_type, is_active"
      )
      .eq("card_number", cardLookup)
      .maybeSingle();

    if (cardError) {
      console.error("[portal/card] Card query error:", cardError.message);
      return NextResponse.json(
        { ok: false, error: "Could not load card data. Please try again." },
        { status: 500 }
      );
    }

    if (!card) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Card not found. Please check with the shopkeeper — your card may not be synced online yet.",
        },
        { status: 404 }
      );
    }

    if (card.is_active === false) {
      return NextResponse.json(
        {
          ok: false,
          error: "This card is inactive. Please contact the shopkeeper.",
        },
        { status: 403 }
      );
    }

    // Get recent transactions (last 10)
    const { data: transactions, error: txnError } = await shopSb
      .from("card_transactions")
      .select("amount, type, description, created_at")
      .eq("card_number", cardLookup)
      .order("created_at", { ascending: false })
      .limit(10);

    if (txnError) {
      console.warn("[portal/card] Txn query error (non-fatal):", txnError.message);
    }

    // Get shop info
    const { data: shopInfo } = await shopSb
      .from("shop_info")
      .select("shop_name, shop_address, shop_phone")
      .eq("id", "shop")
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      card: {
        cardNumber: card.card_number,
        customerName: card.customer_name,
        customerPhone: card.customer_phone || "",
        balance: card.balance || 0,
        cardType: card.card_type || "REGULAR",
      },
      shop: {
        shopName: shopInfo?.shop_name || license.shop_name,
        shopAddress: shopInfo?.shop_address || license.shop_address || "",
        shopPhone: shopInfo?.shop_phone || "",
      },
      transactions: transactions || [],
    });
  } catch (err: any) {
    console.error("[portal/card] Unhandled error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
