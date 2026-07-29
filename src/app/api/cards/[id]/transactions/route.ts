import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    // Verify card exists
    const card = await db.customerCard.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Build optional filters
    const where: Record<string, any> = { cardId: id };

    const txnType = searchParams.get("type");
    if (txnType) {
      where.type = txnType;
    }

    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const transactions = await db.cardTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ transactions });
  } catch (error: any) {
    console.error("[cards/id/transactions GET]", error);
    return NextResponse.json({ error: "Failed to fetch card transactions" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const { type, amount, description, saleId, note, operatorName } = body;

    const validTypes = ["DEPOSIT", "WITHDRAWAL", "PURCHASE", "PAYMENT", "CREDIT", "DEBIT", "ADJUSTMENT", "REFUND"];

    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type is required and must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json({ error: "Amount must be a non-negative number" }, { status: 400 });
    }

    // For ADJUSTMENT, zero amount is acceptable (it's the new balance)
    if (type !== "ADJUSTMENT" && parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const card = await tx.customerCard.findUnique({ where: { id } });
      if (!card) {
        throw new Error("Card not found");
      }

      // Calculate balance and totals updates based on type
      let newBalance = card.balance;
      let newTotalPaid = card.totalPaid;
      let newTotalPurchases = card.totalPurchases;

      switch (type) {
        case "DEPOSIT":
          newBalance += parsedAmount;
          newTotalPaid += parsedAmount;
          break;
        case "WITHDRAWAL":
          newBalance -= parsedAmount;
          break;
        case "PURCHASE":
          newBalance -= parsedAmount;
          newTotalPurchases += parsedAmount;
          break;
        case "PAYMENT":
          newBalance -= parsedAmount;
          newTotalPaid += parsedAmount;
          break;
        case "CREDIT":
          newBalance += parsedAmount;
          break;
        case "DEBIT":
          newBalance -= parsedAmount;
          break;
        case "ADJUSTMENT":
          newBalance = parsedAmount; // amount is the new balance
          break;
        case "REFUND":
          newBalance += parsedAmount;
          break;
      }

      // Create transaction record
      const transaction = await tx.cardTransaction.create({
        data: {
          cardId: id,
          type,
          amount: parsedAmount,
          description: description?.toString().trim() || null,
          saleId: saleId?.toString().trim() || null,
          operatorName: operatorName?.toString().trim() || user.name || null,
          note: note?.toString().trim() || null,
        },
      });

      // Update card balance and totals
      const updatedCard = await tx.customerCard.update({
        where: { id },
        data: {
          balance: newBalance,
          totalPaid: newTotalPaid,
          totalPurchases: newTotalPurchases,
        },
      });

      return { transaction, card: updatedCard };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("[cards/id/transactions POST]", error);
    if (error.message === "Card not found") {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to create card transaction" }, { status: 500 });
  }
}
