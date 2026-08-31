/**
 * Bulk Sync — Syncs ALL existing POS data to Supabase
 * Called from the POS desktop app (has access to both SQLite via API + localStorage)
 *
 * v2.10.29 FIXES:
 *   - Shop info now synced (was missing — caused "My Shop" to appear on customer card page)
 *   - Sales now include card_number (was hard-coded to null — caused customer card
 *     transactions to be empty)
 *   - Card transactions now synced for historical sales (was only created for new sales)
 *
 * v2.10.38: Auto-fetches shop Supabase config from admin Supabase if missing
 * from localStorage. User no longer needs to manually enter Supabase URL/key.
 */

import { getShopSupabaseConfig, fetchAndCacheShopConfig } from "./supabase-sync";

export async function bulkSyncAll(): Promise<{ products: number; cards: number; sales: number; transactions: number; shopInfo: boolean; errors: number }> {
  // v2.10.38: Auto-fetch config from admin Supabase if localStorage is missing
  let config = getShopSupabaseConfig();
  if (!config) {
    console.log("[BulkSync] No localStorage config — auto-fetching from admin Supabase");
    config = await fetchAndCacheShopConfig();
  }
  if (!config) {
    throw new Error("Could not auto-configure online sync. Please make sure your license is activated and try again.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(config.url, config.key, { auth: { persistSession: false } });

  let productCount = 0;
  let cardCount = 0;
  let saleCount = 0;
  let txnCount = 0;
  let shopInfoSynced = false;
  let errors = 0;

  // ─── 0. Sync shop info (so customer card page shows correct shop name/address/phone) ─────
  try {
    const shopRes = await fetch("/api/store");
    if (shopRes.ok) {
      const shopData = await shopRes.json();
      const shop = shopData.shop || shopData;
      if (shop && (shop.shopName || shop.name)) {
        const { error: shopInfoError } = await sb.from("shop_info").upsert({
          id: "shop",
          shop_name: shop.shopName || shop.name || "My Shop",
          shop_address: shop.shopAddress || shop.address || null,
          shop_phone: shop.shopPhone || shop.phone || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (shopInfoError) {
          console.error("[BulkSync] shop_info upsert error:", shopInfoError);
          errors++;
        } else {
          shopInfoSynced = true;
          console.log("[BulkSync] shop_info synced:", shop.shopName || shop.name);
        }
      }
    }
  } catch (e) {
    console.error("[BulkSync] shop_info sync error:", e);
    errors++;
  }

  // ─── 1. Sync ALL products ───────────────────────────────────────────────────────────────
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

  // ─── 2. Sync ALL cards ──────────────────────────────────────────────────────────────────
  // Build a cardId → cardNumber map so we can attach card_number to sales
  const cardIdToNumber = new Map<string, string>();
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
        if (c.id) cardIdToNumber.set(c.id, c.cardNumber);
      } catch (e) {
        errors++;
      }
    }
  } catch (e) {
    console.error("Card bulk sync error:", e);
  }

  // ─── 3. Sync ALL sales (now with proper card_number) ────────────────────────────────────
  try {
    const res = await fetch("/api/sales?limit=1000");
    const data = await res.json();
    const sales = data.sales || [];

    for (const s of sales) {
      try {
        // Look up card_number from cardId (was missing before — caused null card_number)
        const cardNumber = s.cardId ? (cardIdToNumber.get(s.cardId) || null) : null;

        await sb.from("sales_history").upsert({
          invoice_no: s.invoiceNo,
          card_number: cardNumber,  // ← FIX: was hard-coded to null
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

        // ─── FIX: Also create a card_transaction record for historical sales paid by card ───
        if (cardNumber) {
          try {
            await sb.from("card_transactions").upsert({
              card_number: cardNumber,
              amount: -(s.total || 0),
              type: "sale",
              description: `Sale ${s.invoiceNo}`,
              sale_invoice_no: s.invoiceNo,
              created_at: new Date(s.createdAt).toISOString(),
            }, { onConflict: "sale_invoice_no" });
            txnCount++;
          } catch (txnErr) {
            // Non-fatal — sale was synced but txn failed (maybe table missing column)
            console.warn("[BulkSync] card_txn upsert failed for", s.invoiceNo, txnErr);
          }
        }
      } catch (e) {
        // Duplicate sales will fail (already synced) — ignore
        errors++;
      }
    }
  } catch (e) {
    console.error("Sales bulk sync error:", e);
  }

  // ─── 4. v2.10.51: Sync ALL local card transactions (deposits etc.) ─────
  // This was MISSING — deposits/withdrawals were only in local DB, so the
  // customer card QR page showed wrong balance (only sales, no deposits).
  // We fetch all local CardTransaction records (DEPOSIT, WITHDRAWAL, etc.)
  // and upsert them to Supabase card_transactions.
  let localTxnCount = 0;
  try {
    const res = await fetch("/api/cards/all-transactions?limit=2000");
    const data = await res.json();
    const localTxns = data.transactions || [];

    // Filter out sale-based transactions (already synced in step 3 via
    // sales_history) — we only want manual transactions (deposits etc.)
    const manualTxns = localTxns.filter((t: any) =>
      t.cardNumber && !t.saleId && t.type !== "PURCHASE"
    );

    for (const t of manualTxns) {
      try {
        // Sign the amount based on transaction type
        // DEPOSIT/CREDIT/REFUND → positive (money added)
        // WITHDRAWAL/PAYMENT/DEBIT → negative (money taken)
        const signedAmount = ["DEPOSIT", "CREDIT", "REFUND"].includes(t.type)
          ? (t.amount || 0)
          : -(t.amount || 0);

        await sb.from("card_transactions").upsert({
          card_number: t.cardNumber,
          amount: signedAmount,
          type: (t.type || "transaction").toLowerCase(),
          description: t.description || t.type,
          created_at: new Date(t.createdAt).toISOString(),
        }, { onConflict: "created_at" });
        localTxnCount++;
      } catch (e) {
        console.warn("[BulkSync] local card_txn upsert failed:", t.id, e);
      }
    }
    console.log(`[BulkSync] Synced ${localTxnCount} local card transactions (deposits etc.)`);
  } catch (e) {
    console.error("Local card transactions bulk sync error:", e);
  }

  return {
    products: productCount,
    cards: cardCount,
    sales: saleCount,
    transactions: txnCount,
    localTransactions: localTxnCount,
    shopInfo: shopInfoSynced,
    errors,
  };
}
