import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// GET purchases for a vendor
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const purchases = await db.vendorPurchase.findMany({
    where: { vendorId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ purchases });
}

// POST a new purchase for a vendor
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const { amount, description } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount is required" }, { status: 400 });
  }

  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const purchase = await db.vendorPurchase.create({
    data: {
      vendorId: id,
      amount,
      type: "PURCHASE",
      description: description || null,
    },
  });

  const updatedVendor = await db.vendor.update({
    where: { id },
    data: {
      totalPurchased: { increment: amount },
      balance: { increment: amount },
    },
  });

  return NextResponse.json({ purchase, vendor: updatedVendor });
}
