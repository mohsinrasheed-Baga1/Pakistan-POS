/**
 * Supabase Sync Helper
 * =====================================================
 * Syncs POS data to the shop's Supabase database.
 *
 * v2.10.38: Auto-fetch shop Supabase config from admin Supabase
 * using the license_key, so the user doesn't have to manually
 * enter Supabase URL/key in Settings.
 */

import { createClient } from "@supabase/supabase-js";

type ShopSupabaseConfig = {
  url: string;
  key: string;
};

type ShopSupabaseClient = ReturnType<typeof createClient> | null;

let cachedClient: ShopSupabaseClient = null;
let cachedConfig: ShopSupabaseConfig | null = null;

// v2.10.38: Web portal URL for fetching shop config.
const PORTAL_URL = "https://pakistanpos.vercel.app";

// v2.10.38: In-flight fetch promise so multiple parallel sync calls
// don't trigger multiple HTTP requests.
let inflightFetch: Promise<ShopSupabaseConfig | null> | null = null;

export function getShopSupabaseConfig(): ShopSupabaseConfig | null {
  if (cachedConfig) return cachedConfig;
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("pakpos_shop_supabase");
    if (!stored) return null;
    const config = JSON.parse(stored) as ShopSupabaseConfig;
    if (config.url && config.key) {
      cachedConfig = config;
      return config;
    }
  } catch {
    // ignore
  }
  return null;
}

export function setShopSupabaseConfig(url: string, key: string) {
  if (typeof window === "undefined") return;
  if (!url || !key) return;
  const config = { url, key };
  localStorage.setItem("pakpos_shop_supabase", JSON.stringify(config));
  cachedConfig = config;
  cachedClient = null;
}

export function getShopSupabase(): ShopSupabaseClient {
  if (cachedClient) return cachedClient;
  const config = getShopSupabaseConfig();
  if (!config) return null;
  cachedClient = createClient(config.url, config.key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

export function hasSupabaseSync(): boolean {
  return getShopSupabaseConfig() !== null;
}

// v2.10.42: Get license key from localStorage (stored during activation)
// Tries multiple keys for backwards compatibility, then falls back to null
// (which means fetchAndCacheShopConfig will skip and use server-side fallback)
function getLicenseKey(): string | null {
  if (typeof window === "undefined") return null;
  const sources = ["pakpos_license_data", "pakpos_license", "license_key"];
  for (const key of sources) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.licenseKey && typeof parsed.licenseKey === "string" && parsed.licenseKey.startsWith("PAKPOS-")) {
        return parsed.licenseKey;
      }
      if (typeof parsed === "string" && parsed.startsWith("PAKPOS-")) {
        return parsed;
      }
    } catch {
      if (typeof raw === "string" && raw.startsWith("PAKPOS-")) {
        return raw;
      }
    }
  }
  return null;
}

// v2.10.38: Auto-fetch shop Supabase config from the web portal.
// Called when localStorage is missing. Uses license_key to look up
// the shop_supabase_url + shop_supabase_key from admin Supabase.
export async function fetchAndCacheShopConfig(): Promise<ShopSupabaseConfig | null> {
  // If already cached or in localStorage, return immediately
  const existing = getShopSupabaseConfig();
  if (existing) return existing;

  // If a fetch is already in progress, await it
  if (inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    let licenseKey = getLicenseKey();

    // v2.10.42: If no license_key in localStorage, try server-side fallback.
    // This handles the case where the user's localStorage was cleared but
    // their license is still activated in the admin Supabase.
    if (!licenseKey) {
      console.log("[Sync] No license_key in localStorage — trying /api/license/key fallback");
      try {
        const res = await fetch("/api/license/key", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.licenseKey && data.licenseKey.startsWith("PAKPOS-")) {
            licenseKey = data.licenseKey;
            console.log("[Sync] ✓ Got licenseKey from /api/license/key:", licenseKey);
          }
        }
      } catch (e: any) {
        console.warn("[Sync] /api/license/key fallback failed:", e?.message);
      }
    }

    // v2.10.45: If STILL no licenseKey (local /api/license/key failed because
    // SUPABASE_SERVICE_ROLE_KEY env var is missing on POS desktop), try the
    // live portal endpoint DIRECTLY.
    if (!licenseKey) {
      console.log("[Sync] Local /api/license/key returned nothing — trying live portal direct");
      try {
        const res = await fetch(`${PORTAL_URL}/api/license/key`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.licenseKey && data.licenseKey.startsWith("PAKPOS-")) {
            licenseKey = data.licenseKey;
            console.log("[Sync] ✓ Got licenseKey from live portal direct:", licenseKey);
          }
        }
      } catch (e: any) {
        console.warn("[Sync] Live portal /api/license/key failed:", e?.message);
      }
    }

    if (!licenseKey) {
      console.log("[Sync] No license_key found — can't auto-fetch shop config");
      return null;
    }

    try {
      console.log("[Sync] Auto-fetching shop Supabase config for", licenseKey);
      const res = await fetch(
        `${PORTAL_URL}/api/shop-config?licenseKey=${encodeURIComponent(licenseKey)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.ok && data.url && data.key) {
        setShopSupabaseConfig(data.url, data.key);
        console.log("[Sync] ✓ Auto-fetched and cached shop Supabase config");
        return { url: data.url, key: data.key };
      } else {
        console.warn("[Sync] Auto-fetch failed:", data.error);
        return null;
      }
    } catch (e: any) {
      console.warn("[Sync] Auto-fetch error:", e?.message || e);
      return null;
    } finally {
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

// v2.10.38: Async version of getShopSupabase — auto-fetches config if missing.
// Use this in sync functions instead of getShopSupabase().
export async function getShopSupabaseAsync(): Promise<ShopSupabaseClient> {
  const config = getShopSupabaseConfig() || (await fetchAndCacheShopConfig());
  if (!config) return null;
  if (!cachedClient) {
    cachedClient = createClient(config.url, config.key, {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}

// =====================================================
// v2.10.40: syncShopInfo — sync shop name/address/phone to shop_info table
// =====================================================
// This is called from EVERY sync operation (syncCard, syncSale, etc.)
// to keep the shop_info table always in sync with the local Settings.
// Why: the customer-facing card page (pakistanpos.vercel.app/card/...)
// reads shop_info to display the shop's name/address/phone. If shop_info
// is empty or shows "My Shop" (the default), customers see the wrong info.
//
// Without this, every shop would need to run Bulk Sync to push shop_info.
// With this, shop_info is pushed every time ANY sync happens, so it's
// always up-to-date automatically.

let lastShopInfoSync = 0;  // rate limit: don't sync more than once per 30s

// v2.10.40: Force sync (bypass rate limit) — used by Settings PUT
export async function forceSyncShopInfo(): Promise<void> {
  lastShopInfoSync = 0;  // reset so syncShopInfo actually runs
  await syncShopInfo();
}

export async function syncShopInfo(): Promise<void> {
  // Rate limit: only sync shop_info at most once every 30 seconds
  // (it's called from every syncSale/syncCard, but it rarely changes)
  // Use forceSyncShopInfo() to bypass this (e.g. when user saves Settings)
  const now = Date.now();
  if (now - lastShopInfoSync < 30_000) {
    return;
  }
  lastShopInfoSync = now;

  const sb = await getShopSupabaseAsync();
  if (!sb) return;

  try {
    // Fetch local shop settings from POS app's own API
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const settings = data.settings;
    if (!settings) return;

    // Don't sync if it's the default "My Shop" with no other info
    // (we still want to sync if shopName is empty — that's fine)
    const shopName = settings.shopName || "";
    const shopAddress = settings.shopAddress || "";
    const shopPhone = settings.shopPhone || "";

    const { error } = await sb.from("shop_info").upsert({
      id: "shop",
      shop_name: shopName,
      shop_address: shopAddress,
      shop_phone: shopPhone,
      currency: settings.currency || "Rs",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (error) {
      console.warn("[Sync] shop_info sync error:", error.message);
    } else {
      console.log("[Sync] shop_info synced:", shopName);
    }
  } catch (e: any) {
    console.warn("[Sync] shop_info sync failed:", e?.message || e);
  }
}

// =====================================================
// SYNC FUNCTIONS — v2.10.22: Better error logging
// =====================================================

export async function syncSale(sale: any): Promise<void> {
  // v2.10.38: Use async version — auto-fetches config if missing
  const sb = await getShopSupabaseAsync();
  if (!sb) {
    console.log("[Sync] No Supabase config — skipping sync");
    return;
  }

  // v2.10.40: Always sync shop_info first (no-op if synced recently)
  // This ensures the customer card page always shows the right shop name
  await syncShopInfo();

  try {
    console.log("[Sync] Syncing sale:", sale.invoiceNo);

    // 1) Upsert into sales_history (prevents duplicates on re-sync)
    // v2.10.26: Changed from INSERT to UPSERT with onConflict: invoice_no
    // This prevents duplicate sales when bulk sync runs multiple times
    const { error: saleError } = await sb.from("sales_history").upsert({
      invoice_no: sale.invoiceNo,
      card_number: sale.cardNumber || null,
      customer_name: sale.customerName || null,
      subtotal: sale.subtotal || 0,
      discount: sale.discount || 0,
      tax_total: sale.taxTotal || 0,
      total: sale.total || 0,
      paid_amount: sale.paidAmount || 0,
      change_amount: sale.change || 0,
      balance_due: sale.balanceDue || 0,
      payment_method: sale.paymentMethod || "CASH",
      sale_type: sale.saleType || "RETAIL",
      items_count: sale.items?.length || 0,
      sale_date: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    }, { onConflict: "invoice_no" });

    if (saleError) {
      console.error("[Sync] sales_history insert error:", saleError);
    } else {
      console.log("[Sync] sales_history inserted successfully");
    }

    // 2) If card was used, upsert card_transaction (prevents duplicates)
    if (sale.cardNumber) {
      const { error: txnError } = await sb.from("card_transactions").upsert({
        card_number: sale.cardNumber,
        amount: -(sale.total || 0),
        type: "sale",
        description: `Sale ${sale.invoiceNo}`,
        sale_invoice_no: sale.invoiceNo,
        created_at: new Date().toISOString(),
      }, { onConflict: "sale_invoice_no" });

      if (txnError) {
        console.error("[Sync] card_transactions insert error:", txnError);
      }

      // Update card balance
      const { data: card, error: cardError } = await sb
        .from("customer_cards")
        .select("balance")
        .eq("card_number", sale.cardNumber)
        .single();

      if (card) {
        const newBalance = (card.balance || 0) - (sale.total || 0);
        const { error: updateError } = await sb
          .from("customer_cards")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("card_number", sale.cardNumber);

        if (updateError) {
          console.error("[Sync] card balance update error:", updateError);
        }
      } else if (cardError) {
        console.error("[Sync] card lookup error:", cardError);
      }
    }

    // 3) Sync products from this sale
    if (sale.items && Array.isArray(sale.items)) {
      for (const item of sale.items) {
        try {
          await sb.from("products").upsert({
            product_id: item.productId || item.id,
            name: item.name || "Unknown",
            barcode: item.barcode || null,
            sale_price: item.price || 0,
            unit: item.unit || "piece",
            stock: item.stock || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "product_id" });
        } catch (e) {
          console.error("[Sync] product sync error:", e);
        }
      }
    }

    console.log("[Sync] Sale sync complete:", sale.invoiceNo);
  } catch (err) {
    console.error("[Sync] Sale sync FAILED:", err);
  }
}

export async function syncCard(card: any): Promise<void> {
  // v2.10.38: Use async version — auto-fetches config if missing
  const sb = await getShopSupabaseAsync();
  if (!sb) {
    console.log("[Sync] No Supabase config — skipping card sync for", card.cardNumber);
    return;
  }

  // v2.10.40: Always sync shop_info first (no-op if synced recently)
  await syncShopInfo();

  try {
    const { error } = await sb.from("customer_cards").upsert({
      card_number: card.cardNumber,
      customer_name: card.name,
      customer_phone: card.phone || null,
      customer_email: card.email || null,
      customer_address: card.address || null,
      balance: card.balance || 0,
      card_type: card.type || "REGULAR",
      is_active: card.active !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "card_number" });

    if (error) {
      console.error("[Sync] Card sync error:", error);
    }
  } catch (err) {
    console.error("[Sync] Card sync FAILED:", err);
  }
}

export async function syncProduct(product: any): Promise<void> {
  // v2.10.38: Use async version — auto-fetches config if missing
  const sb = await getShopSupabaseAsync();
  if (!sb) return;

  try {
    const { error } = await sb.from("products").upsert({
      product_id: product.id,
      name: product.name,
      barcode: product.barcode || null,
      sale_price: product.salePrice || 0,
      unit: product.unit || "piece",
      stock: product.stock || 0,
      category: product.categoryId || null,
      is_active: product.active !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "product_id" });

    if (error) {
      console.error("[Sync] Product sync error:", error);
    }
  } catch (err) {
    console.error("[Sync] Product sync FAILED:", err);
  }
}

export async function syncCardTransaction(params: {
  cardNumber: string;
  amount: number;
  type: "topup" | "refund" | "adjustment";
  description?: string;
}): Promise<void> {
  // v2.10.38: Use async version — auto-fetches config if missing
  const sb = await getShopSupabaseAsync();
  if (!sb) return;

  try {
    const { error: txnError } = await sb.from("card_transactions").insert({
      card_number: params.cardNumber,
      amount: params.amount,
      type: params.type,
      description: params.description || "",
      created_at: new Date().toISOString(),
    });

    if (txnError) {
      console.error("[Sync] Card txn sync error:", txnError);
    }

    const { data: card } = await sb
      .from("customer_cards")
      .select("balance")
      .eq("card_number", params.cardNumber)
      .single();

    if (card) {
      const newBalance = (card.balance || 0) + params.amount;
      await sb
        .from("customer_cards")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("card_number", params.cardNumber);
    }
  } catch (err) {
    console.error("[Sync] Card txn sync FAILED:", err);
  }
}
