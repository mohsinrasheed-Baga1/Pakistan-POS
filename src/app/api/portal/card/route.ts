import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// v2.10.29: Card lookup for QR scan
// QR contains: /card/[licenseKey]/[cardNumber]
// The client page calls: /api/portal/card?licenseKey=...&cardNumber=...
//
// No login required — customer just scans QR and sees their balance.
//
// v2.10.41: Added CORS headers + OPTIONS handler so the POS desktop app
// (running on http://127.0.0.1:4783) can call this endpoint to verify
// sync after card creation.

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

// Default shop names that should be replaced by the actual license shop name.
// These are the seed/default values the POS app uses before user customization.
const DEFAULT_SHOP_NAMES = new Set([
  "my shop",
  "myshop",
  "",
]);

function isDefaultShopName(name: string | null | undefined): boolean {
  if (!name) return true;
  return DEFAULT_SHOP_NAMES.has(name.trim().toLowerCase());
}

function jsonWithCors(data: any, opts?: any) {
  // Accept both signatures:
  //   jsonWithCors(data)                  → 200 OK
  //   jsonWithCors(data, { status: 404 }) → custom status
  const status = (opts && typeof opts === "object" && "status" in opts) ? opts.status : (typeof opts === "number" ? opts : 200);
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const licenseKey = (searchParams.get("licenseKey") || "").trim();
    const cardNumber = (searchParams.get("cardNumber") || "").trim();

    if (!licenseKey || !cardNumber) {
      return jsonWithCors(
        { ok: false, error: "Invalid QR code" },
        { status: 400 }
      );
    }

    const adminKey = ADMIN_SUPABASE_SERVICE_KEY || ADMIN_SUPABASE_ANON_KEY;
    if (!adminKey) {
      console.error(
        "[portal/card] No Supabase key configured. Set SUPABASE_SERVICE_ROLE_KEY on Vercel."
      );
      return jsonWithCors(
        {
          ok: false,
          error: "Server not configured. Please contact the shopkeeper.",
        },
        { status: 500 }
      );
    }

    // ─── Step 1: Find the shop's Supabase credentials from admin Supabase ──────────────
    const adminSb = createClient(ADMIN_SUPABASE_URL, adminKey, {
      auth: { persistSession: false },
    });

    // v2.10.32 FIX: shop_phone column doesn't exist on licenses table — only
    // shop_name and shop_address are populated during license activation.
    // shop_phone comes from the shop's own shop_info table (Step 4).
    const { data: license, error: licError } = await adminSb
      .from("licenses")
      .select(
        "shop_name, shop_address, shop_supabase_url, shop_supabase_key, is_active, is_revoked"
      )
      .eq("license_key", licenseKey.toUpperCase().trim())
      .maybeSingle();

    if (licError) {
      console.error("[portal/card] License query error:", licError.message);
      if (
        licError.message.includes("permission") ||
        licError.message.includes("RLS") ||
        licError.message.includes("policy")
      ) {
        return jsonWithCors(
          {
            ok: false,
            error:
              "Server not configured. Please contact the shopkeeper to set SUPABASE_SERVICE_ROLE_KEY.",
          },
          { status: 500 }
        );
      }
      return jsonWithCors(
        { ok: false, error: "Shop lookup failed. Please try again later." },
        { status: 500 }
      );
    }

    if (!license) {
      return jsonWithCors(
        { ok: false, error: "Shop not found. Please contact the shopkeeper." },
        { status: 404 }
      );
    }

    if (license.is_revoked || !license.is_active) {
      return jsonWithCors(
        { ok: false, error: "This shop's service is currently unavailable." },
        { status: 403 }
      );
    }

    if (!license.shop_supabase_url || !license.shop_supabase_key) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Shop database not configured. Please ask the shopkeeper to set up online sync.",
        },
        { status: 500 }
      );
    }

    // ─── Step 2: Connect to shop's Supabase and fetch card data ─────────────────────────
    const shopSb = createClient(
      license.shop_supabase_url,
      license.shop_supabase_key,
      { auth: { persistSession: false } }
    );

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
      return jsonWithCors(
        { ok: false, error: "Could not load card data. Please try again." },
        { status: 500 }
      );
    }

    if (!card) {
      return jsonWithCors(
        {
          ok: false,
          error:
            "Card not found. Please check with the shopkeeper — your card may not be synced online yet.",
        },
        { status: 404 }
      );
    }

    if (card.is_active === false) {
      return jsonWithCors(
        { ok: false, error: "This card is inactive. Please contact the shopkeeper." },
        { status: 403 }
      );
    }

    // ─── Step 3: Fetch transactions ─────────────────────────────────────────────────────
    // Primary source: card_transactions (topups, refunds, sale entries).
    // Fallback / merge: sales_history WHERE card_number matches (all card-paid purchases).
    const transactions: any[] = [];

    // 3a) Card transactions (explicit top-ups/refunds/sale payment records)
    const { data: cardTxns, error: txnError } = await shopSb
      .from("card_transactions")
      .select("amount, type, description, sale_invoice_no, created_at")
      .eq("card_number", cardLookup)
      .order("created_at", { ascending: false })
      .limit(20);
    if (txnError) {
      console.warn("[portal/card] card_transactions query error:", txnError.message);
    }
    if (cardTxns && cardTxns.length > 0) {
      for (const t of cardTxns) {
        transactions.push({
          amount: Number(t.amount) || 0,
          type: t.type || "transaction",
          description: t.description || (t.type === "sale" ? "Purchase" : t.type),
          invoice_no: t.sale_invoice_no || null,
          created_at: t.created_at,
          source: "card_txn",
        });
      }
    }

    // 3b) Sales history (all purchases paid with this card)
    // This catches historical sales that may not have a card_transaction record yet,
    // e.g. sales that happened before the v2.10.29 sync fix was deployed.
    const { data: salesTxns, error: salesErr } = await shopSb
      .from("sales_history")
      .select("invoice_no, total, sale_date, payment_method, items_count")
      .eq("card_number", cardLookup)
      .order("sale_date", { ascending: false })
      .limit(20);
    if (salesErr) {
      console.warn("[portal/card] sales_history query error:", salesErr.message);
    }
    if (salesTxns && salesTxns.length > 0) {
      // Track invoice numbers we already added from card_transactions to avoid duplicates
      const existingInvoices = new Set(
        transactions
          .filter((t) => t.invoice_no)
          .map((t) => t.invoice_no)
      );
      for (const s of salesTxns) {
        if (s.invoice_no && existingInvoices.has(s.invoice_no)) continue;
        transactions.push({
          amount: -Number(s.total || 0),  // Negative because it's a purchase (debit from card)
          type: "sale",
          description: `Purchase · ${s.items_count || 0} items · ${s.payment_method || "CASH"}`,
          invoice_no: s.invoice_no,
          created_at: s.sale_date,
          source: "sales_history",
        });
      }
    }

    // Sort all transactions by date (newest first) and limit to 10
    transactions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const finalTxns = transactions.slice(0, 10);

    // ─── Step 4: Get shop info — fall back to license if shop_info is "My Shop"/empty ────
    const { data: shopInfo } = await shopSb
      .from("shop_info")
      .select("shop_name, shop_address, shop_phone")
      .eq("id", "shop")
      .maybeSingle();

    // Pick the best shop name: license.shop_name beats "My Shop" default
    const licenseShopName = (license as any).shop_name || "";
    const licenseShopAddr = (license as any).shop_address || "";
    // v2.10.32: shop_phone is not on the licenses table — only on shop_info.
    const licenseShopPhone = "";

    const finalShopName =
      !isDefaultShopName(shopInfo?.shop_name) && shopInfo?.shop_name
        ? shopInfo.shop_name
        : !isDefaultShopName(licenseShopName)
          ? licenseShopName
          : shopInfo?.shop_name || licenseShopName || "Shop";

    const finalShopAddress =
      shopInfo?.shop_address || licenseShopAddr || "";

    const finalShopPhone =
      shopInfo?.shop_phone || licenseShopPhone || "";

    return jsonWithCors({
      ok: true,
      card: {
        cardNumber: card.card_number,
        customerName: card.customer_name,
        customerPhone: card.customer_phone || "",
        balance: card.balance || 0,
        cardType: card.card_type || "REGULAR",
      },
      shop: {
        shopName: finalShopName,
        shopAddress: finalShopAddress,
        shopPhone: finalShopPhone,
      },
      transactions: finalTxns,
    });
  } catch (err: any) {
    console.error("[portal/card] Unhandled error:", err?.message || err);
    return jsonWithCors(
      { ok: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
