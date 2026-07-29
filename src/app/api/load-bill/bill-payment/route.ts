import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);

    const where: Record<string, any> = {};

    // Filter by category
    const category = searchParams.get("category");
    if (category) {
      where.category = category;
    }

    // Filter by date range
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    // Search by consumer name, phone, account number, or reference
    const search = searchParams.get("search")?.trim();
    if (search) {
      where.OR = [
        { consumerName: { contains: search } },
        { consumerPhone: { contains: search } },
        { accountNo: { contains: search } },
        { referenceNo: { contains: search } },
      ];
    }

    const payments = await db.billPaymentTxn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ payments });
  } catch (error: any) {
    console.error("[bill-payment GET]", error);
    return NextResponse.json({ error: "Failed to fetch bill payments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      category,
      consumerName,
      consumerPhone,
      accountNo,
      billAmount,
      serviceCharge,
      referenceNo,
      operatorName,
      note,
    } = body;

    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    const parsedBillAmount = Number(billAmount);
    if (isNaN(parsedBillAmount) || parsedBillAmount <= 0) {
      return NextResponse.json({ error: "Bill amount must be a positive number" }, { status: 400 });
    }

    const parsedServiceCharge = Number(serviceCharge) || 0;
    const totalPaid = parsedBillAmount + parsedServiceCharge;

    const validCategories = ["electricity", "gas", "water", "internet", "other"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    const payment = await db.billPaymentTxn.create({
      data: {
        category,
        consumerName: consumerName?.toString().trim() || null,
        consumerPhone: consumerPhone?.toString().trim() || null,
        accountNo: accountNo?.toString().trim() || null,
        billAmount: parsedBillAmount,
        serviceCharge: parsedServiceCharge,
        totalPaid,
        referenceNo: referenceNo?.toString().trim() || null,
        operatorName: operatorName || user.name || null,
        note: note?.toString().trim() || null,
      },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error: any) {
    console.error("[bill-payment POST]", error);
    return NextResponse.json({ error: "Failed to create bill payment" }, { status: 500 });
  }
}
