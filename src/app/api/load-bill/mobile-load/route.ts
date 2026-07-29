import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { companyId, type, amount, costPrice, salePrice, customerPhone, customerName, referenceNo, operatorName, note } = body;

    if (!companyId || !type || amount == null) {
      return NextResponse.json(
        { error: "companyId, type, and amount are required" },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    if (type !== "PURCHASE" && type !== "SALE") {
      return NextResponse.json(
        { error: "Type must be PURCHASE or SALE" },
        { status: 400 }
      );
    }

    const parsedCost = Number(costPrice) || 0;
    const parsedSale = Number(salePrice) || 0;
    const profit = type === "SALE" ? parsedSale - parsedCost : 0;

    // Verify company exists
    const company = await db.mobileLoadCompany.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    if (!company.active) {
      return NextResponse.json({ error: "Company is inactive" }, { status: 400 });
    }

    // Create transaction and update company stats atomically
    const result = await db.$transaction(async (tx) => {
      // Create the transaction
      const transaction = await tx.mobileLoadTxn.create({
        data: {
          companyId,
          type,
          amount: parsedAmount,
          costPrice: parsedCost,
          salePrice: parsedSale,
          profit,
          customerPhone: customerPhone?.toString().trim() || null,
          customerName: customerName?.toString().trim() || null,
          referenceNo: referenceNo?.toString().trim() || null,
          operatorName: operatorName || user.name || null,
          note: note?.toString().trim() || null,
        },
      });

      // Update company stats
      let updatedBalance = company.balance;
      let updatedTotalPurchased = company.totalPurchased;
      let updatedTotalSold = company.totalSold;
      let updatedTotalProfit = company.totalProfit;

      if (type === "PURCHASE") {
        updatedBalance += parsedAmount;
        updatedTotalPurchased += parsedAmount;
      } else {
        updatedBalance -= parsedAmount;
        updatedTotalSold += parsedAmount;
        updatedTotalProfit += profit;
      }

      const updatedCompany = await tx.mobileLoadCompany.update({
        where: { id: companyId },
        data: {
          balance: updatedBalance,
          totalPurchased: updatedTotalPurchased,
          totalSold: updatedTotalSold,
          totalProfit: updatedTotalProfit,
        },
      });

      return { transaction, company: updatedCompany };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("[mobile-load POST]", error);
    return NextResponse.json({ error: "Failed to create mobile load transaction" }, { status: 500 });
  }
}
