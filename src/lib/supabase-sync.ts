/**
 * Supabase Sync Helper
 * =====================================================
 * Syncs POS data to the shop's Supabase database.
 * This enables the online portal to show real-time data.
 *
 * Sync triggers:
 * - After each sale → sales_history + card_transactions
 * - After card create/update → customer_cards
 * - After product create/edit → products
 *
 * Credentials:
 * - Shop's Supabase URL + key stored in localStorage as 'pakpos_shop_supabase'
 * - Set during license activation (if shop has Supabase credentials)
 */

import { createClient } from "@supabase/supabase-js";

type ShopSupabaseConfig = {
  url: string;
  key: string;
};

type ShopSupabaseClient = ReturnType<typeof createClient> | null;

let cachedClient: ShopSupabaseClient = null;
let cachedConfig: ShopSupabaseConfig | null = null;

/** Get shop's Supabase credentials from localStorage */
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

/** Set shop's Supabase credentials (called during license activation) */
export function setShopSupabaseConfig(url: string, key: string) {
  if (typeof window === "undefined") return;
  if (!url || !key) return;
  const config = { url, key };
  localStorage.setItem("pakpos_shop_supabase", JSON.stringify(config));
  cachedConfig = config;
  cachedClient = null; // reset client
}

/** Get Supabase client for shop's database (lazy initialization) */
export function getShopSupabase(): ShopSupabaseClient {
  if (cachedClient) return cachedClient;
  const config = getShopSupabaseConfig();
  if (!config) return null;
  cachedClient = createClient(config.url, config.key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

/** Check if shop has Supabase sync enabled */
export function hasSupabaseSync(): boolean {
  return getShopSupabaseConfig() !== null;
}

// =====================================================
// SYNC FUNCTIONS
// =====================================================

/** Sync a completed sale to shop's Supabase */
export async function syncSale(sale: any): Promise<void> {
  const sb = getShopSupabase();
  if (!sb) return; // No sync configured — silent skip

  try {
    // 1) Insert into sales_history
    await sb.from("sales_history").upsert({
      invoice_no: sale.invoiceNo,
      card_number: sale.cardId || null,
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

    // 2) If card was used, create card_transaction + update balance
    if (sale.cardId && sale.cardNumber) {
      await sb.from("card_transactions").insert({
        card_number: sale.cardNumber,
        amount: -(sale.total || 0), // negative = sale deducted from balance
        type: "sale",
        description: `Sale ${sale.invoiceNo}`,
        sale_invoice_no: sale.invoiceNo,
        created_at: new Date().toISOString(),
      });

      // Update card balance (decrement)
      // Note: card balance is maintained in customer_cards table
      // We use RPC or direct update
      const { data: card } = await sb
        .from("customer_cards")
        .select("balance")
        .eq("card_number", sale.cardNumber)
        .single();

      if (card) {
        const newBalance = (card.balance || 0) - (sale.total || 0);
        await sb
          .from("customer_cards")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("card_number", sale.cardNumber);
      }
    }
  } catch (err) {
    console.error("[Sync] Sale sync error:", err);
  }
}

/** Sync a customer card to shop's Supabase */
export async function syncCard(card: any): Promise<void> {
  const sb = getShopSupabase();
  if (!sb) return;

  try {
    await sb.from("customer_cards").upsert({
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
  } catch (err) {
    console.error("[Sync] Card sync error:", err);
  }
}

/** Sync a product to shop's Supabase */
export async function syncProduct(product: any): Promise<void> {
  const sb = getShopSupabase();
  if (!sb) return;

  try {
    await sb.from("products").upsert({
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
  } catch (err) {
    console.error("[Sync] Product sync error:", err);
  }
}

/** Sync card payment/topup to shop's Supabase */
export async function syncCardTransaction(params: {
  cardNumber: string;
  amount: number;
  type: "topup" | "refund" | "adjustment";
  description?: string;
}): Promise<void> {
  const sb = getShopSupabase();
  if (!sb) return;

  try {
    await sb.from("card_transactions").insert({
      card_number: params.cardNumber,
      amount: params.amount,
      type: params.type,
      description: params.description || "",
      created_at: new Date().toISOString(),
    });

    // Update card balance
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
    console.error("[Sync] Card transaction sync error:", err);
  }
}
