import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This route is called when a customer scans QR code on their card.
// QR contains: /card/[licenseKey]/[cardNumber]
// We use licenseKey to find the shop's Supabase, then fetch card data.
//
// No login required — customer just scans and sees their balance.

const ADMIN_SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yghnbmtuyjzebqrcbavk.supabase.co";

const ADMIN_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnaG5ibXR1eWp6ZWJxcmNiYXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzMwMjQwMCwiZXhwIjoyMDQ4Njc4ODAwfQ.sYVpkSlxslmPpP-7G3X6pQYR2l9pX0qX0x0x0x0x0x0";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ licenseKey: string; cardNumber: string }> }
) {
  try {
    const { licenseKey, cardNumber } = await params;

    if (!licenseKey || !cardNumber) {
      return NextResponse.json(
        { ok: false, error: "Invalid QR code" },
        { status: 400 }
      );
    }

    if (!ADMIN_SUPABASE_URL || !ADMIN_SUPABASE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Server not configured" },
        { status: 500 }
      );
    }

    // Step 1: Find the shop's Supabase credentials from admin Supabase
    const adminSb = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const { data: license, error: licError } = await adminSb
      .from("licenses")
      .select("shop_name, shop_address, shop_supabase_url, shop_supabase_key, is_active, is_revoked")
      .eq("license_key", licenseKey.toUpperCase().trim())
      .single();

    if (licError || !license) {
      return NextResponse.json(
        { ok: false, error: "Shop not found. Please contact the shopkeeper." },
        { status: 404 }
      );
    }

    if (license.is_revoked || !license.is_active) {
      return NextResponse.json(
        { ok: false, error: "This shop's service is currently unavailable." },
        { status: 403 }
      );
    }

    if (!license.shop_supabase_url || !license.shop_supabase_key) {
      return NextResponse.json(
        { ok: false, error: "Shop database not configured." },
        { status: 500 }
      );
    }

    // Step 2: Connect to shop's Supabase and fetch card data
    const shopSb = createClient(license.shop_supabase_url, license.shop_supabase_key, {
      auth: { persistSession: false },
    });

    // Get card info
    const { data: card, error: cardError } = await shopSb
      .from("customer_cards")
      .select("card_number, customer_name, customer_phone, balance, card_type, is_active")
      .eq("card_number", cardNumber.toUpperCase().trim())
      .single();

    if (cardError || !card) {
      return NextResponse.json(
        { ok: false, error: "Card not found. Please check with the shopkeeper." },
        { status: 404 }
      );
    }

    if (!card.is_active) {
      return NextResponse.json(
        { ok: false, error: "This card is inactive. Please contact the shopkeeper." },
        { status: 403 }
      );
    }

    // Get recent transactions (last 10)
    const { data: transactions } = await shopSb
      .from("card_transactions")
      .select("amount, type, description, created_at")
      .eq("card_number", cardNumber.toUpperCase().trim())
      .order("created_at", { ascending: false })
      .limit(10);

    // Get shop info
    const { data: shopInfo } = await shopSb
      .from("shop_info")
      .select("shop_name, shop_address, shop_phone")
      .eq("id", "shop")
      .single();

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
    console.error("Card lookup error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
