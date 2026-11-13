import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// POST: return a sale (full or partial refund).
// Body: {
//   reason?: string,
//   itemIds?: string[]  — if provided, only these SaleItem IDs are returned (partial)
//                         if omitted/empty, ALL items are returned (full refund)
// }
// Restocks items, reverses card transaction (proportional if partial).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const sale = await db.sale.findUnique({
    where: { id },
    include: { items: true, card: true },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  if (sale.status === "RETURNED") {
    return NextResponse.json({ error: "Already returned" }, { status: 400 });
  }

  // Determine which items to return
  const requestedItemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds : [];
  const itemsToReturn = requestedItemIds.length > 0
    ? sale.items.filter(it => requestedItemIds.includes(it.id))
    : sale.items;

  if (itemsToReturn.length === 0) {
    return NextResponse.json({ error: "No items selected for return" }, { status: 400 });
  }

  // v2.10.142: CRITICAL FIX — refund amount was WRONG.
  //   Previously: refundAmount = sum of line totals (subtotal).
  //   But sale.total = subtotal + tax - discount + serviceTax + extraCharges.
  //   When a sale had a DISCOUNT, subtotal > total, so the customer got
  //   back MORE than they actually paid (e.g. paid Rs 581.6 after Rs 52
  //   discount, but refunded Rs 633.6 = the pre-discount subtotal).
  //   User: "ریفنڈ ہونے والی رقم اور ہے اور جو پرچیز وہ اور ہے  ریفنڈ
  //   زیادہ ہوا ہے پیمنٹ پرچیز تھوڑا ہوا ہے"
  //
  //   FIX: refundAmount is now based on the ACTUAL sale.total paid,
  //   scaled proportionally for partial returns.
  const isFullReturn = itemsToReturn.length === sale.items.length;
  const returnedSubtotal = itemsToReturn.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
  const saleSubtotal = sale.subtotal || sale.items.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
  const saleTotalPaid = sale.total || 0;

  let refundAmount: number;
  if (isFullReturn || saleSubtotal <= 0) {
    // Full return: refund exactly what was paid (sale.total).
    // If saleSubtotal is 0 (edge case), also use sale.total.
    refundAmount = saleTotalPaid;
  } else {
    // Partial return: proportional refund based on returned items' share of subtotal.
    // E.g. if returning 50% of items (by subtotal value), refund 50% of sale.total.
    refundAmount = (returnedSubtotal / saleSubtotal) * saleTotalPaid;
  }
  // Round to 2 decimal places to avoid floating-point drift (e.g. 581.60000001)
  refundAmount = Math.round(refundAmount * 100) / 100;

  // Mark sale returned only if ALL items returned
  if (isFullReturn) {
    await db.sale.update({ where: { id }, data: { status: "RETURNED" } });
  } else {
    // Partial return — mark as PARTIAL_RETURN
    await db.sale.update({ where: { id }, data: { status: "PARTIAL_RETURN" } });
  }

  // Restock items
  for (const it of itemsToReturn) {
    await db.product.update({
      where: { id: it.productId },
      data: { stock: { increment: it.quantity } },
    });
    // v2.10.136: Clamp to 0 if somehow negative
    const afterReturn = await db.product.findUnique({ where: { id: it.productId }, select: { stock: true } });
    if (afterReturn && afterReturn.stock < 0) {
      await db.product.update({ where: { id: it.productId }, data: { stock: 0 } });
    }
    await db.stockLog.create({
      data: {
        productId: it.productId,
        type: "RETURN",
        quantity: it.quantity,
        note: `Return ${sale.invoiceNo} — ${it.name} (${it.quantity} ${it.unit || ""})`,
      },
    });
  }

  // Reverse card transaction if linked (proportional refund)
  if (sale.cardId && sale.card && refundAmount > 0) {
    await db.customerCard.update({
      where: { id: sale.cardId },
      data: {
        balance: { increment: refundAmount },
        totalPurchases: { decrement: refundAmount },
      },
    });
    await db.cardTransaction.create({
      data: {
        cardId: sale.cardId,
        // v2.10.142: Changed from "PAYMENT" to "REFUND" so the transaction
        //   shows with the correct color (green/credit) and label ("واپسی")
        //   in the card detail view, instead of looking like a purchase (red/debit).
        //   User: "اس میں کلر بھی سیم ہی رکھا ہے" (refund and purchase same color)
        type: "REFUND",
        amount: refundAmount,
        description: `Return refund ${sale.invoiceNo} (${isFullReturn ? "full" : "partial"})`,
        saleId: sale.id,
      },
    });
  }

  const ret = await db.saleReturn.create({
    data: {
      saleId: id,
      userId: user.id,
      amount: refundAmount,
      reason: body.reason || (isFullReturn ? "Customer return" : "Partial return"),
      restocked: true,
    },
  });

  return NextResponse.json({
    ok: true,
    return: ret,
    refundAmount,
    isFullReturn,
    itemsReturned: itemsToReturn.length,
    itemsTotal: sale.items.length,
  });
}
