import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

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
  const { amount, description, payAll } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount is required" }, { status: 400 });
  }

  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  // Pay All = pay remaining balance
  const payAmount = payAll ? Math.max(0, vendor.balance) : Math.min(amount, vendor.balance);

  if (payAmount <= 0) {
    return NextResponse.json({ error: "No balance to pay" }, { status: 400 });
  }

  // Record payment and update vendor
  const purchase = await db.vendorPurchase.create({
    data: {
      vendorId: id,
      amount: payAmount,
      type: "PAYMENT",
      description: description || (payAll ? "Full balance payment" : "Partial payment"),
    },
  });

  const updatedVendor = await db.vendor.update({
    where: { id },
    data: {
      totalPaid: { increment: payAmount },
      balance: { decrement: payAmount },
    },
  });

  return NextResponse.json({ purchase, vendor: updatedVendor });
}
