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

  const sales = await db.sale.findMany({
    where,
    include: {
      items: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ sales });
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
    // If the sale failed with a schema-related error (missing column, missing
    // table, etc.), reset the schema flag and retry ensureSchema, then retry
    // the sale ONCE. This handles the common case where a user restored an
    // old backup DB and the first sale triggers a "column does not exist"
    // error — the retry will succeed after ensureSchema adds the column.
    const msg = (e.message || "").toLowerCase();
    const isSchemaError =
      msg.includes("does not exist") ||
      msg.includes("no such column") ||
      msg.includes("no such table") ||
      msg.includes("sqlite_error") ||
      e.code === "P2021" || // "The table `X` does not exist in the current database"
      e.code === "P2022";   // "The column `X` does not exist in the current database"

    if (isSchemaError) {
      console.error("[sales POST] Schema error detected, retrying after ensureSchema:", e.message);
      try {
        resetSchemaFlag();
        await ensureSchema();
        return await processSale(user.id, body, items);
      } catch (e2: any) {
        console.error("[sales POST] Retry also failed:", e2.message, e2.code, e2.meta);
        return NextResponse.json(
          {
            error: `Database schema error after retry: ${e2.message || "Unknown"}`,
            code: e2.code,
            detail: "Please restart the app. If the problem persists, the backup database may be from an incompatible version.",
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
    include: { items: true, user: { select: { name: true } } },
  });

  // deduct stock + log
  for (const it of saleItemsData) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) continue;

    const isBoxSale = !!product.packBarcode && product.packQuantity > 0;

    if (isBoxSale) {
      // ─── BOX SALE ─────────────────────────────────────────────────────────
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

      // AUTO-REFILL: when piece stock runs low and a linked box exists,
      // automatically "open" one box.
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

  return NextResponse.json({ sale });
}
