import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// Returns notifications: low stock, expiring soon, expired
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  const lowStock = await db.product.findMany({
    where: {
      active: true,
      stock: { lte: db.product.fields.minStock },
    },
    select: { id: true, name: true, stock: true, minStock: true, unit: true },
    orderBy: { stock: "asc" },
    take: 20,
  });

  const expiringSoon = await db.product.findMany({
    where: {
      active: true,
      expiryDate: { gte: now, lte: soon },
    },
    select: { id: true, name: true, expiryDate: true, stock: true },
    orderBy: { expiryDate: "asc" },
    take: 20,
  });

  const expired = await db.product.findMany({
    where: {
      active: true,
      expiryDate: { lt: now },
    },
    select: { id: true, name: true, expiryDate: true, stock: true },
    orderBy: { expiryDate: "asc" },
    take: 20,
  });

  return NextResponse.json({
    lowStock,
    expiringSoon,
    expired,
    counts: {
      lowStock: lowStock.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
      total: lowStock.length + expiringSoon.length + expired.length,
    },
  });
}
