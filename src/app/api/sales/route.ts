import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
    // stock check for non-loose items handled loosely; deduct anyway
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
      userId: user.id,
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
    // Re-fetch the product (it may be either a PIECE product or a BOX product).
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) continue;

    // ─── Determine sale type ───────────────────────────────────────────────
    // A "box sale" is when the user scanned a BOX product's barcode (a product
    // whose `packBarcode` is set — i.e. this product represents a box, and it
    // links to a separate piece product via packBarcode).
    //
    // When selling 1 box:
    //   - The BOX product's stock (counted in BOXES) decrements by `it.quantity`
    //   - The PIECE product's stock (counted in PIECES) also decrements by
    //     packQuantity × it.quantity (because those pieces are now gone)
    //
    // This is the fix for the user's "Lemon Biscuit" bug:
    //   - 6 boxes × 6 pieces = 36 pieces total
    //   - User sells 1 box → box stock 6→5, piece stock 36→30
    //   - (Previously the code was decrementing the BOX stock by
    //     packQuantity×qty = 6, wiping out all 6 boxes in one sale!)
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

      // 2. Find the linked PIECE product and decrement its stock by
      //    packQuantity × boxQty (the pieces that were in those boxes)
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

      // ─── AUTO-REFILL: when piece stock runs low and a linked box exists,
      // automatically "open" one box — decrement box stock by 1 and increment
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

  // If linked to a card, deduct from balance (payment auto-deducted from card account)
  if (body.cardId) {
    const card = await db.customerCard.findUnique({ where: { id: body.cardId } });
    if (card) {
      // Deduct total from balance. Balance can go negative (customer owes).
      // If they have advance (positive balance), it reduces their credit.
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
