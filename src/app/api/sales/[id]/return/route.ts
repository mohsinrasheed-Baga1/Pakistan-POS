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

  // Calculate refund amount (sum of lineTotals for returned items)
  const refundAmount = itemsToReturn.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
  const isFullReturn = itemsToReturn.length === sale.items.length;

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
        type: "PAYMENT",
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
