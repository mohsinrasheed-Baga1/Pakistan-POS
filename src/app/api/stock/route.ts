import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// Stock adjustment (add stock) for a product
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json();
  const { productId, quantity, type = "PURCHASE", note } = body;
  if (!productId || !quantity) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
  const product = await db.product.update({
    where: { id: productId },
    data: { stock: { increment: Number(quantity) } },
    // v2.10.136: Stock should never be negative — clamp after increment
    const afterInc = await db.product.findUnique({ where: { id: productId }, select: { stock: true } });
    if (afterInc && afterInc.stock < 0) {
      await db.product.update({ where: { id: productId }, data: { stock: 0 } });
    }
  });
  await db.stockLog.create({
    data: {
      productId,
      type,
      quantity: Number(quantity),
      note: note || "Stock addition",
    },
  });
  return NextResponse.json({ product });
}
