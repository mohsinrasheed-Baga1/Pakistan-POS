import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { randomBytes } from "crypto";

function generateCardNumber(): string {
  // 12-digit numeric card number, prefix 9999 to distinguish from barcodes
  const rand = randomBytes(8).readBigUInt64BE().toString().slice(0, 8).padStart(8, "0");
  return `9999${rand}`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  const cards = await db.customerCard.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { cardNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager/Admin only" }, { status: 403 });
  }
  const body = await req.json();

  const name = (body.name || "").toString().trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Generate a unique card number if not provided
  let cardNumber = (body.cardNumber || "").toString().trim();
  if (!cardNumber) {
    for (let i = 0; i < 10; i++) {
      const candidate = generateCardNumber();
      const exists = await db.customerCard.findUnique({
        where: { cardNumber: candidate },
        select: { id: true },
      });
      if (!exists) {
        cardNumber = candidate;
        break;
      }
    }
  } else {
    const exists = await db.customerCard.findUnique({
      where: { cardNumber },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: "Card number already exists" }, { status: 400 });
    }
  }
  if (!cardNumber) {
    return NextResponse.json({ error: "Failed to generate card number" }, { status: 500 });
  }

  // Generate customerId if not provided
  const customerId = body.customerId
    ? String(body.customerId).trim()
    : `CUST-${Date.now().toString().slice(-8)}`;

  const card = await db.customerCard.create({
    data: {
      cardNumber,
      customerId,
      name,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      type: body.type === "WHOLESALE" ? "WHOLESALE" : body.type === "SHOP_KEEPER" ? "SHOP_KEEPER" : "REGULAR",
      balance: Number(body.balance) || 0,
      active: body.active !== false,
    },
  });

  // v2.10.44: Detailed sync diagnostic — log every step so we can see
  // exactly where sync fails. Returns a syncReport object with full details
  // for the UI to display.
  const syncReport: any = {
    startedAt: new Date().toISOString(),
    steps: [] as Array<{ step: string; ok: boolean; message: string; duration_ms?: number }>,
    cardNumber,
  };

  function logStep(step: string, ok: boolean, message: string, duration_ms?: number) {
    syncReport.steps.push({ step, ok, message, duration_ms });
    console.log(`[Cards POST sync] ${step}: ${ok ? "✓" : "✗"} ${message}${duration_ms ? ` (${duration_ms}ms)` : ""}`);
  }

  let syncWarning: string | null = null;
  let syncSuccess = false;

  try {
    // STEP 1: Load syncCard module
    const t0 = Date.now();
    const { syncCard, getShopSupabaseAsync, fetchAndCacheShopConfig, getShopSupabaseConfig, getLicenseKey } = await import("@/lib/supabase-sync");
    logStep("load_module", true, "syncCard module loaded", Date.now() - t0);

    // STEP 2: Check localStorage state (diagnostic only — runs server-side
    // but getLicenseKey is no-op on server, so just log)
    const t1 = Date.now();
    const cachedConfig = getShopSupabaseConfig();
    if (cachedConfig) {
      logStep("check_localStorage", true, `Supabase config found in localStorage: url=${cachedConfig.url.substring(0, 40)}...`, Date.now() - t1);
    } else {
      logStep("check_localStorage", false, "No Supabase config in localStorage — will auto-fetch", Date.now() - t1);
    }

    // STEP 3: Auto-fetch config if missing (this calls /api/license/key
    // and /api/shop-config)
    if (!cachedConfig) {
      const t2 = Date.now();
      try {
        const fetchedConfig = await fetchAndCacheShopConfig();
        if (fetchedConfig) {
          logStep("auto_fetch_config", true, `Fetched Supabase config: ${fetchedConfig.url.substring(0, 40)}...`, Date.now() - t2);
        } else {
          logStep("auto_fetch_config", false, "fetchAndCacheShopConfig returned null — see console for details", Date.now() - t2);
          syncWarning = "Cloud sync failed: Could not fetch Supabase config. Check network connection.";
          return NextResponse.json({ card, syncWarning, syncReport });
        }
      } catch (e: any) {
        logStep("auto_fetch_config", false, `Exception: ${e?.message || e}`, Date.now() - t2);
        syncWarning = `Cloud sync failed: ${e?.message || "Could not fetch config"}`;
        return NextResponse.json({ card, syncWarning, syncReport });
      }
    }

    // STEP 4: Get Supabase client
    const t3 = Date.now();
    const sb = await getShopSupabaseAsync();
    if (!sb) {
      logStep("get_supabase_client", false, "getShopSupabaseAsync returned null", Date.now() - t3);
      syncWarning = "Cloud sync failed: Supabase client could not be created.";
      return NextResponse.json({ card, syncWarning, syncReport });
    }
    logStep("get_supabase_client", true, "Supabase client ready", Date.now() - t3);

    // STEP 5: Upsert card to customer_cards table
    const t4 = Date.now();
    const cardData = {
      card_number: cardNumber,
      customer_name: name,
      customer_phone: body.phone ? String(body.phone).trim() : null,
      customer_address: body.address ? String(body.address).trim() : null,
      balance: Number(body.balance) || 0,
      card_type: body.type === "WHOLESALE" ? "WHOLESALE" : body.type === "SHOP_KEEPER" ? "SHOP_KEEPER" : "REGULAR",
      is_active: body.active !== false,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await sb.from("customer_cards").upsert(cardData, { onConflict: "card_number" });
    if (upsertError) {
      logStep("upsert_card", false, `Supabase error: ${upsertError.message} (code: ${upsertError.code})`, Date.now() - t4);
      syncWarning = `Cloud sync failed: ${upsertError.message}`;
      return NextResponse.json({ card, syncWarning, syncReport });
    }
    logStep("upsert_card", true, `Card upserted to customer_cards (card_number=${cardNumber})`, Date.now() - t4);

    // STEP 6: Verify the card is actually readable (sanity check)
    const t5 = Date.now();
    const { data: verifyData, error: verifyError } = await sb
      .from("customer_cards")
      .select("card_number, customer_name")
      .eq("card_number", cardNumber)
      .maybeSingle();
    if (verifyError || !verifyData) {
      logStep("verify_card", false, `Could not read back: ${verifyError?.message || "row not found"}`, Date.now() - t5);
    } else {
      logStep("verify_card", true, `Verified readable: customer_name="${verifyData.customer_name}"`, Date.now() - t5);
    }

    // STEP 7: Also sync shop_info (best-effort, don't fail if it errors)
    const t6 = Date.now();
    try {
      const { syncShopInfo } = await import("@/lib/supabase-sync");
      await syncShopInfo();
      logStep("sync_shop_info", true, "shop_info synced", Date.now() - t6);
    } catch (e: any) {
      logStep("sync_shop_info", false, `Non-fatal: ${e?.message || e}`, Date.now() - t6);
    }

    syncSuccess = true;
    syncReport.completedAt = new Date().toISOString();
    syncReport.success = true;
    console.log("[Cards POST] ✓ Card synced to cloud:", cardNumber);
  } catch (e: any) {
    logStep("unexpected_error", false, `${e?.message || e}\nStack: ${e?.stack || ""}`);
    syncWarning = `Cloud sync failed (unexpected): ${e?.message || "Unknown error"}`;
    syncReport.success = false;
    syncReport.errorMessage = e?.message || String(e);
  }

  return NextResponse.json({ card, syncWarning, syncReport, syncSuccess });
}
