/**
 * Supabase Sync Helper
 * =====================================================
 * Syncs POS data to the shop's Supabase database.
 */

import { createClient } from "@supabase/supabase-js";

type ShopSupabaseConfig = {
  url: string;
  key: string;
};

type ShopSupabaseClient = ReturnType<typeof createClient> | null;

let cachedClient: ShopSupabaseClient = null;
let cachedConfig: ShopSupabaseConfig | null = null;

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

// =====================================================
// SYNC FUNCTIONS — v2.10.22: Better error logging
// =====================================================

export async function syncSale(sale: any): Promise<void> {
  const sb = getShopSupabase();
  if (!sb) {
    console.log("[Sync] No Supabase config — skipping sync");
    return;
  }

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
  const sb = getShopSupabase();
  if (!sb) return;

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
  const sb = getShopSupabase();
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
  const sb = getShopSupabase();
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
