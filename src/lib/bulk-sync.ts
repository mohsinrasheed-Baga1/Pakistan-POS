/**
 * Bulk Sync — Syncs ALL existing POS data to Supabase
 * Called from the POS desktop app (has access to both SQLite via API + localStorage)
 */

import { getShopSupabaseConfig } from "./supabase-sync";

export async function bulkSyncAll(): Promise<{ products: number; cards: number; sales: number; errors: number }> {
  const config = getShopSupabaseConfig();
  if (!config) {
    throw new Error("Online sync not configured. Go to Settings > License Info > Enable Online Sync.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(config.url, config.key, { auth: { persistSession: false } });

  let productCount = 0;
  let cardCount = 0;
  let saleCount = 0;
  let errors = 0;

  // 1. Sync ALL products
  try {
    const res = await fetch("/api/products?limit=1000");
    const data = await res.json();
    const products = data.products || [];

    for (const p of products) {
      try {
        await sb.from("products").upsert({
          product_id: p.id,
          name: p.name,
          barcode: p.barcode || null,
          sale_price: p.salePrice || 0,
          unit: p.unit || "piece",
          stock: p.stock || 0,
          category: p.categoryId || null,
          is_active: p.active !== false,
          updated_at: new Date().toISOString(),
        }, { onConflict: "product_id" });
        productCount++;
      } catch (e) {
        errors++;
      }
    }
  } catch (e) {
    console.error("Product bulk sync error:", e);
  }

  // 2. Sync ALL cards
  try {
    const res = await fetch("/api/cards?limit=1000");
    const data = await res.json();
    const cards = data.cards || [];

    for (const c of cards) {
      try {
        await sb.from("customer_cards").upsert({
          card_number: c.cardNumber,
          customer_name: c.name,
          customer_phone: c.phone || null,
          customer_address: c.address || null,
          balance: c.balance || 0,
          card_type: c.type || "REGULAR",
          is_active: c.active !== false,
          updated_at: new Date().toISOString(),
        }, { onConflict: "card_number" });
        cardCount++;
      } catch (e) {
        errors++;
      }
    }
  } catch (e) {
    console.error("Card bulk sync error:", e);
  }

  // 3. Sync ALL sales
  try {
    const res = await fetch("/api/sales?limit=1000");
    const data = await res.json();
    const sales = data.sales || [];

    for (const s of sales) {
      try {
      // v2.10.26: Use upsert to prevent duplicates on re-sync
        await sb.from("sales_history").upsert({
          invoice_no: s.invoiceNo,
          card_number: null,
          customer_name: s.customerName || null,
          subtotal: s.subtotal || 0,
          discount: s.discount || 0,
          tax_total: s.taxTotal || 0,
          total: s.total || 0,
          paid_amount: s.paidAmount || 0,
          change_amount: s.change || 0,
          balance_due: s.balanceDue || 0,
          payment_method: s.paymentMethod || "CASH",
          sale_type: s.saleType || "RETAIL",
          items_count: s.items?.length || 0,
          sale_date: new Date(s.createdAt).toISOString(),
          synced_at: new Date().toISOString(),
        }, { onConflict: "invoice_no" });
        saleCount++;
      } catch (e) {
        // Duplicate sales will fail (already synced) — ignore
      }
    }
  } catch (e) {
    console.error("Sales bulk sync error:", e);
  }

  return { products: productCount, cards: cardCount, sales: saleCount, errors };
}
