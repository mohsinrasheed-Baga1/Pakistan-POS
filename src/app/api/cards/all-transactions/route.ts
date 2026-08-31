import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// v2.10.51: GET all card transactions across ALL cards (for bulk sync).
// Returns transactions with card numbers so the client can sync them
// to Supabase (cloud) for the customer card QR page.
//
// Query params:
//   limit — max transactions to return (default 2000)

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 2000);

  const transactions = await db.cardTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      card: {
        select: { cardNumber: true, name: true },
      },
    },
  });

  // Flatten to include cardNumber
  const flat = transactions.map((t: any) => ({
    id: t.id,
    cardNumber: t.card?.cardNumber || null,
    customerName: t.card?.name || null,
    type: t.type,
    amount: t.amount,
    description: t.description,
    saleId: t.saleId,
    createdAt: t.createdAt,
  }));

  return NextResponse.json({ transactions: flat });
}
