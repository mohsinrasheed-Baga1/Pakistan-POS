import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// v2.10.50: Sync LoadBill entities → POS Products
//
// This endpoint mirrors LoadBill entities as searchable POS products:
//   1. MobileLoadCompany (Jazz, Ufone...) → Product (inventorySource="LOAD_COMPANY")
//   2. WalletAccount (JazzCash, Easypaisa, Bank) → Product (inventorySource="WALLET_ACCOUNT")
//   3. SimStock (new/replacement SIMs) → Product (inventorySource="SIM_STOCK")
//
// When called (POST), it creates/updates Product rows for each entity.
// The Product's `stock` field mirrors the entity's balance/quantity.
// When a POS sale includes one of these products, the sale-completion
// hook (in /api/sales) deducts from the ORIGINAL entity's balance.

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = {
    companies: 0,
    wallets: 0,
    sims: 0,
    errors: 0,
  };

  // ─── 1. Sync MobileLoadCompanies → Products ──────────────────────────────
  try {
    const companies = await db.mobileLoadCompany.findMany({
      where: { active: true },
    });

    for (const c of companies) {
      const barcode = `LOAD-${c.name.toUpperCase().replace(/\s+/g, "")}`;

      let product = await db.product.findUnique({ where: { barcode } });

      const productData: any = {
        name: `${c.name} Load`,
        barcode,
        barcodeType: "CODE128",
        salePrice: 0,
        costPrice: 0,
        wholesalePrice: 0,
        shopkeeperPrice: 0,
        unit: "load",
        stock: Math.floor(c.balance),
        minStock: 0,
        taxRate: 0,
        hasBarcode: true,
        active: true,
        inventorySource: "LOAD_COMPANY",
        linkedStoreProductId: c.id,
      };

      if (product) {
        await db.product.update({
          where: { id: product.id },
          data: {
            name: productData.name,
            stock: productData.stock,
            active: true,
            linkedStoreProductId: c.id,
          },
        });
      } else {
        await db.product.create({ data: productData });
      }
      results.companies++;
    }

    // Deactivate products for companies that no longer exist
    const allLoadProducts = await db.product.findMany({
      where: { inventorySource: "LOAD_COMPANY" },
    });
    for (const p of allLoadProducts) {
      const stillExists = companies.some(c => c.id === p.linkedStoreProductId);
      if (!stillExists) {
        await db.product.update({
          where: { id: p.id },
          data: { active: false },
        });
      }
    }
  } catch (e: any) {
    console.error("[sync-pos-products] companies sync error:", e?.message);
    results.errors++;
  }

  // ─── 2. Sync WalletAccounts → Products ──────────────────────────────────
  try {
    const accounts = await db.walletAccount.findMany({
      where: { active: true },
    });

    for (const a of accounts) {
      const barcode = `WALLET-${a.name.toUpperCase().replace(/\s+/g, "")}`;

      let product = await db.product.findUnique({ where: { barcode } });

      const productData: any = {
        name: a.name,
        barcode,
        barcodeType: "CODE128",
        salePrice: 0,
        costPrice: 0,
        wholesalePrice: 0,
        shopkeeperPrice: 0,
        unit: "txn",
        stock: Math.floor(a.balance),
        minStock: 0,
        taxRate: 0,
        hasBarcode: true,
        active: true,
        inventorySource: "WALLET_ACCOUNT",
        linkedStoreProductId: a.id,
      };

      if (product) {
        await db.product.update({
          where: { id: product.id },
          data: {
            name: productData.name,
            stock: productData.stock,
            active: true,
            linkedStoreProductId: a.id,
          },
        });
      } else {
        await db.product.create({ data: productData });
      }
      results.wallets++;
    }

    const allWalletProducts = await db.product.findMany({
      where: { inventorySource: "WALLET_ACCOUNT" },
    });
    for (const p of allWalletProducts) {
      const stillExists = accounts.some(a => a.id === p.linkedStoreProductId);
      if (!stillExists) {
        await db.product.update({
          where: { id: p.id },
          data: { active: false },
        });
      }
    }
  } catch (e: any) {
    console.error("[sync-pos-products] wallets sync error:", e?.message);
    results.errors++;
  }

  // ─── 3. Sync SimStock → Products ─────────────────────────────────────────
  try {
    const sims = await db.simStock.findMany({
      where: { status: "IN_STOCK" },
    });

    const simGroups: Record<string, { company: string; type: string; count: number; costPrice: number; salePrice: number }> = {};
    for (const s of sims) {
      const key = `${s.company}-${s.type}`;
      if (!simGroups[key]) {
        simGroups[key] = {
          company: s.company,
          type: s.type,
          count: 0,
          costPrice: s.costPrice,
          salePrice: s.salePrice,
        };
      }
      simGroups[key].count += (s.stockQuantity || 1);
    }

    for (const [key, group] of Object.entries(simGroups)) {
      const barcode = `SIM-${key.toUpperCase().replace(/\s+/g, "")}`;
      const name = `${group.company} SIM (${group.type === "NEW" ? "New" : "Replacement"})`;

      let product = await db.product.findUnique({ where: { barcode } });

      const productData: any = {
        name,
        barcode,
        barcodeType: "CODE128",
        salePrice: group.salePrice,
        costPrice: group.costPrice,
        wholesalePrice: 0,
        shopkeeperPrice: 0,
        unit: "piece",
        stock: group.count,
        minStock: 0,
        taxRate: 0,
        hasBarcode: true,
        active: true,
        inventorySource: "SIM_STOCK",
        linkedStoreProductId: key,
      };

      if (product) {
        await db.product.update({
          where: { id: product.id },
          data: {
            name: productData.name,
            salePrice: productData.salePrice,
            costPrice: productData.costPrice,
            stock: productData.stock,
            active: true,
          },
        });
      } else {
        await db.product.create({ data: productData });
      }
      results.sims++;
    }

    const allSimProducts = await db.product.findMany({
      where: { inventorySource: "SIM_STOCK" },
    });
    for (const p of allSimProducts) {
      const stillExists = Object.keys(simGroups).some(k => p.linkedStoreProductId === k);
      if (!stillExists) {
        await db.product.update({
          where: { id: p.id },
          data: { active: false, stock: 0 },
        });
      }
    }
  } catch (e: any) {
    console.error("[sync-pos-products] SIM sync error:", e?.message);
    results.errors++;
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await db.product.findMany({
    where: {
      inventorySource: { in: ["LOAD_COMPANY", "WALLET_ACCOUNT", "SIM_STOCK"] },
    },
    select: {
      id: true,
      name: true,
      barcode: true,
      stock: true,
      salePrice: true,
      inventorySource: true,
      linkedStoreProductId: true,
      active: true,
    },
  });

  return NextResponse.json({ products });
}
