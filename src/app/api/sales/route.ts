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
  const boxSaleFlags: Record<string, boolean> = {};
  for (const it of items) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
    const qty = Number(it.quantity);
    if (qty <= 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    // Determine if this is a whole-box sale via isBox flag OR price matching packPrice
    const isBoxSale = !!it.isBox || (product.packPrice > 0 && Number(it.price) === product.packPrice);
    const price = Number(it.price ?? product.salePrice);
    const lineTotal = price * qty;
    subtotal += lineTotal;
    taxTotal += lineTotal * (product.taxRate / 100);

    boxSaleFlags[product.id] = isBoxSale;
    saleItemsData.push({
      productId: product.id,
      name: product.name + (isBoxSale ? " (Box)" : ""),
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
    const product = await db.product.findUnique({ where: { id: it.productId } });
    const isBoxSale = !!boxSaleFlags[it.productId];
    // Box sale: deduct packQuantity pieces per box sold.
    // Piece sale: deduct 1 piece per unit sold.
    const stockDeduction = isBoxSale
      ? (product?.packQuantity || 1) * it.quantity
      : it.quantity;

    await db.product.update({
      where: { id: it.productId },
      data: { stock: { decrement: stockDeduction } },
    });
    await db.stockLog.create({
      data: {
        productId: it.productId,
        type: "SALE",
        quantity: -stockDeduction,
        note: isBoxSale
          ? `Box sale ${invoiceNo} (${it.quantity} box × ${product?.packQuantity} pcs = ${stockDeduction} pcs)`
          : `Sale ${invoiceNo} (${it.quantity} pcs)`,
      },
    });
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
