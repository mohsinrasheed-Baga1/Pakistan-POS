import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema, resetSchemaFlag } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { generateInvoiceNo, todayRange } from "@/lib/pos-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const today = searchParams.get("today") === "true";
  const limit = Number(searchParams.get("limit") || 50);

  const where: any = {};
  if (today) {
    const { start, end } = todayRange();
    where.createdAt = { gte: start, lte: end };
  }

  // Fetch sales WITHOUT `include: { user }` to avoid the
  // "Field user is required to return data, got null instead" error when
  // a restored backup DB has Sale rows pointing to deleted User records.
  // We fetch user names separately and attach them manually.
  const sales = await db.sale.findMany({
    where,
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Collect all unique userIds and fetch their names in one query
  const userIds = [...new Set(sales.map((s: any) => s.userId).filter(Boolean))];
  const users: any[] = userIds.length > 0
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name || "Unknown"]));

  // Attach user name to each sale
  const salesWithUser = sales.map((s: any) => ({
    ...s,
    user: { name: userMap.get(s.userId) || "Unknown" },
  }));

  return NextResponse.json({ sales: salesWithUser });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const items: any[] = body.items || [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  try {
    return await processSale(user.id, body, items);
  } catch (e: any) {
    // ─── AUTO-RETRY LOGIC ────────────────────────────────────────────────
    // If the sale failed with a schema-related error OR a foreign key
    // constraint violation, we retry after:
    //   1. Resetting the schemaEnsured flag
    //   2. Re-running ensureSchema (which now also re-asserts FK OFF)
    //   3. Explicitly disabling FK constraints again
    //   4. Retrying the sale ONCE
    //
    // This handles the common backup-restore scenarios:
    //   - Old DB missing columns → "no such column" error
    //   - Old DB with inconsistent FK references → "Foreign key constraint
    //     violated" error (e.g. SaleItem pointing to deleted Product)
    const msg = (e.message || "").toLowerCase();
    const isSchemaError =
      msg.includes("does not exist") ||
      msg.includes("no such column") ||
      msg.includes("no such table") ||
      msg.includes("sqlite_error") ||
      msg.includes("foreign key constraint") ||  // ← FK violation
      msg.includes("constraint failed") ||
      e.code === "P2021" || // table missing
      e.code === "P2022" || // column missing
      e.code === "P2003";   // foreign key constraint violation

    if (isSchemaError) {
      console.error("[sales POST] Schema/FK error detected, retrying after ensureSchema + FK disable:", e.message);
      try {
        resetSchemaFlag();
        await ensureSchema();
        // Explicitly disable FK constraints for this connection before retry
        try {
          await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
        } catch {}
        return await processSale(user.id, body, items);
      } catch (e2: any) {
        console.error("[sales POST] Retry also failed:", e2.message, e2.code, e2.meta);
        return NextResponse.json(
          {
            error: `Database error after retry: ${e2.message || "Unknown"}`,
            code: e2.code,
            detail: "Please restart the app. If the problem persists, the backup database may have inconsistent foreign key references — try restoring a newer backup or run DB Diagnose from Settings.",
          },
          { status: 500 }
        );
      }
    }

    // Non-schema error — return the actual error so the user can see what
    // went wrong (previously this became a generic "network error" on the
    // frontend because the response had no parseable body).
    console.error("[sales POST] Error:", e.message, e.code, e.meta);
    return NextResponse.json(
      {
        error: e.message || "Failed to complete sale",
        code: e.code,
        meta: e.meta,
      },
      { status: 500 }
    );
  }
}

/**
 * The actual sale-processing logic, extracted into a separate function so
 * the POST handler can wrap it in try/catch and retry on schema errors.
 */
async function processSale(userId: string, body: any, items: any[]) {
  // ─── Ensure the user record exists ──────────────────────────────────────
  // When restoring an old backup DB, the User table may be empty or the
  // logged-in user's row may have been deleted. Prisma's `include: { user }`
  // then fails with "Field user is required to return data, got null instead"
  // because the Sale row references a userId that doesn't exist in User.
  //
  // We do two things:
  //   1. Verify the user exists. If not, create a stub user record so the
  //      FK reference is valid.
  //   2. Don't use `include: { user }` in the sale.create — fetch the user
  //      name separately afterwards, with a fallback to "Unknown" if the
  //      user row is missing.
  let userName = "Unknown";
  try {
    const existingUser = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (existingUser) {
      userName = existingUser.name || "Unknown";
    } else {
      // User row missing — create a stub so the Sale FK is valid.
      // This preserves the sale even if the user record was lost.
      console.warn(`[sales] User ${userId} not found in DB — creating stub`);
      try {
        await db.user.create({
          data: {
            id: userId,
            email: `restored-${userId.substring(0, 8)}@pos.local`,
            name: "Restored User",
            password: "restored",
            role: "CASHIER",
            active: true,
          },
        });
        userName = "Restored User";
      } catch (createErr: any) {
        // If we can't create the user (e.g. id conflict), the sale will
        // still go through but with userName = "Unknown". The FK violation
        // is already handled by PRAGMA foreign_keys = OFF.
        console.warn(`[sales] Could not create stub user:`, createErr.message);
      }
    }
  } catch (e: any) {
    console.warn(`[sales] Could not verify user ${userId}:`, e.message);
  }

  // count today's sales to build invoice number
  const { start, end } = todayRange();
  const todayCount = await db.sale.count({
    where: { createdAt: { gte: start, lte: end } },
  });
  const prefix = body.invoicePrefix || "INV";
  const invoiceNo = generateInvoiceNo(prefix, todayCount);

  // validate stock & build items
  let subtotal = 0;
  let taxTotal = 0;
  const saleItemsData: any[] = [];
  for (const it of items) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
    const qty = Number(it.quantity);
    if (qty <= 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    const price = Number(it.price ?? product.salePrice);
    const lineTotal = price * qty;
    subtotal += lineTotal;
    taxTotal += lineTotal * (product.taxRate / 100);

    saleItemsData.push({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price,
      costPrice: product.costPrice,
      quantity: qty,
      unit: product.unit,
      taxRate: product.taxRate,
      lineTotal,
    });
  }

  const discount = Number(body.discount) || 0;
  const total = Math.max(0, subtotal + taxTotal - discount);
  const paidAmount = Number(body.paidAmount) || total;
  const change = Math.max(0, paidAmount - total);

  // Create the sale WITHOUT `include: { user }` to avoid the
  // "Field user is required to return data, got null instead" error when
  // the user row is missing from a restored backup DB.
  // We fetch items separately and construct the user field manually.
  const sale = await db.sale.create({
    data: {
      invoiceNo,
      userId,
      customerName: body.customerName || null,
      customerPhone: body.customerPhone || null,
      subtotal,
      taxTotal,
      discount,
      total,
      paidAmount,
      change,
      paymentMethod: body.paymentMethod || "CASH",
      status: "COMPLETED",
      note: body.note || null,
      items: { create: saleItemsData },
    },
    include: { items: true, card: true },
  });

  // Attach the user name manually (no Prisma relation lookup)
  const saleWithUser = {
    ...sale,
    user: { name: userName },
  };

  // deduct stock + log
  // ────────────────────────────────────────────────────────────────────────
  // Stock model:
  //   - BOX product (has packBarcode set): stock counted in BOXES
  //   - PIECE product (no packBarcode): stock counted in PIECES
  //
  // When selling a BOX:
  //   - Decrement BOX product stock by qty (boxes sold)
  //   - Decrement linked PIECE product stock by packQuantity × qty
  //
  // When selling a PIECE:
  //   - Decrement PIECE product stock by qty
  //   - If piece stock falls below packQuantity AND a linked box exists,
  //     auto-open 1 box (decrement box stock by 1, increment piece stock
  //     by packQuantity) so the next sale won't run out.
  //
  // Example (user's spec):
  //   9 boxes × 80 pcs = 720 total pieces
  //   Sell 1 box → box stock 9→8, piece stock 720→640
  //   Sell 1 piece → piece stock 640→639
  // ────────────────────────────────────────────────────────────────────────
  for (const it of saleItemsData) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) continue;

    const isBoxSale = !!product.packBarcode && product.packQuantity > 0;

    if (isBoxSale) {
      // ─── BOX SALE ─────────────────────────────────────────────────────────
      // 1. Decrement BOX product stock by number of boxes sold
      const boxQty = it.quantity;
      await db.product.update({
        where: { id: product.id },
        data: { stock: { decrement: boxQty } },
      });
      await db.stockLog.create({
        data: {
          productId: product.id,
          type: "SALE",
          quantity: -boxQty,
          note: `Box sale ${invoiceNo} (${boxQty} box × ${product.packQuantity} pcs = ${boxQty * product.packQuantity} pcs)`,
        },
      });

      // 2. Find the linked PIECE product by its barcode (= packBarcode)
      //    and decrement its stock by packQuantity × boxQty
      const pieceProduct = await db.product.findUnique({
        where: { barcode: product.packBarcode! },
      });
      if (pieceProduct) {
        const pieceDeduction = product.packQuantity * boxQty;
        await db.product.update({
          where: { id: pieceProduct.id },
          data: { stock: { decrement: pieceDeduction } },
        });
        await db.stockLog.create({
          data: {
            productId: pieceProduct.id,
            type: "SALE",
            quantity: -pieceDeduction,
            note: `Box sale ${invoiceNo} (sold as ${boxQty} box × ${product.packQuantity} pcs)`,
          },
        });
      }
    } else {
      // ─── PIECE SALE (regular) ─────────────────────────────────────────────
      const stockDeduction = it.quantity;
      await db.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: stockDeduction } },
      });
      await db.stockLog.create({
        data: {
          productId: it.productId,
          type: "SALE",
          quantity: -stockDeduction,
          note: `Sale ${invoiceNo}`,
        },
      });

      // ─── AUTO-REFILL ──────────────────────────────────────────────────────
      // When piece stock runs low and a linked box exists with stock > 0,
      // automatically "open" one box: decrement box stock by 1, increment
      // piece stock by packQuantity. This keeps the piece product sellable
      // without the cashier needing to manually restock.
      const boxProduct = await db.product.findFirst({
        where: { packBarcode: product.barcode },
      });
      if (boxProduct && boxProduct.stock > 0) {
        const refreshedPiece = await db.product.findUnique({
          where: { id: product.id },
        });
        const pieceStockAfter = refreshedPiece?.stock ?? 0;
        const packQty = boxProduct.packQuantity || 1;
        if (pieceStockAfter < packQty) {
          // Open the box
          await db.product.update({
            where: { id: boxProduct.id },
            data: { stock: { decrement: 1 } },
          });
          await db.product.update({
            where: { id: product.id },
            data: { stock: { increment: packQty } },
          });
          await db.stockLog.create({
            data: {
              productId: boxProduct.id,
              type: "ADJUSTMENT",
              quantity: -1,
              note: `Auto-opened 1 box for ${product.name} after sale ${invoiceNo}`,
            },
          });
          await db.stockLog.create({
            data: {
              productId: product.id,
              type: "ADJUSTMENT",
              quantity: packQty,
              note: `Auto-refill from box after sale ${invoiceNo} (+${packQty} pcs)`,
            },
          });
        }
      }
    }
  }

  // If linked to a card, deduct from balance
  if (body.cardId) {
    const card = await db.customerCard.findUnique({ where: { id: body.cardId } });
    if (card) {
      await db.customerCard.update({
        where: { id: body.cardId },
        data: {
          totalPurchases: { increment: total },
          balance: { decrement: total },
        },
      });
      await db.cardTransaction.create({
        data: {
          cardId: body.cardId,
          type: "PURCHASE",
          amount: total,
          description: `Sale ${invoiceNo} — auto-deducted from account`,
          saleId: sale.id,
        },
      });
    }
  }

  return NextResponse.json({ sale: saleWithUser });
}
