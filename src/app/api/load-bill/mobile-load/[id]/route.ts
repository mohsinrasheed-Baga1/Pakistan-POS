import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Find the transaction
    const txn = await db.mobileLoadTxn.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Reverse company stats atomically
    await db.$transaction(async (tx) => {
      let { balance, totalPurchased, totalSold, totalProfit } = txn.company;

      if (txn.type === "PURCHASE") {
        balance -= txn.amount;
        totalPurchased -= txn.amount;
      } else {
        balance += txn.amount;
        totalSold -= txn.amount;
        totalProfit -= txn.profit;
      }

      await tx.mobileLoadCompany.update({
        where: { id: txn.companyId },
        data: { balance, totalPurchased, totalSold, totalProfit },
      });

      await tx.mobileLoadTxn.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[mobile-load/id DELETE]", error);
    return NextResponse.json({ error: "Failed to delete mobile load transaction" }, { status: 500 });
  }
}
