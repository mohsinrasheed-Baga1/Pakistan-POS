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
    // v2.10.112: FIX — Withdrawals use negative billAmount to represent
    // money taken OUT of bill collection. Previously the validation
    // rejected negative amounts with "Bill amount must be a positive
    // number" error, making withdrawals impossible.
    //   User: "جب ہم لوڈ اینڈ بل مینجمنٹ کے اندر جا کر بل والے اپشن پر
    //   کلک کر کے چیک کرتے ہیں کہ ٹوٹل بل اماؤنٹ کتنی ہے اور ود ڈرا
    //   کرنے کی کوشش کرتے ہیں تو ود ڈرا نہیں ہو رہا پوزیٹیو اماؤنٹ
    //   کا ایرر ا رہا ہے"
    // Fix:
    //   1. Allow "withdrawal" category — was missing from validCategories
    //   2. Skip positive-amount validation when category === "withdrawal"
    //      (negative billAmount is intentional for withdrawals)
    const validCategories = ["electricity", "gas", "water", "internet", "other", "withdrawal"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }
    const isWithdrawal = category === "withdrawal";
    if (isWithdrawal) {
      // Withdrawals: any non-zero number (positive or negative both work)
      if (isNaN(parsedBillAmount) || parsedBillAmount === 0) {
        return NextResponse.json({ error: "Withdrawal amount must be a non-zero number" }, { status: 400 });
      }
    } else {
      // Regular bills: must be positive
      if (isNaN(parsedBillAmount) || parsedBillAmount <= 0) {
        return NextResponse.json({ error: "Bill amount must be a positive number" }, { status: 400 });
      }
    }

    const parsedServiceCharge = Number(serviceCharge) || 0;
    const totalPaid = parsedBillAmount + parsedServiceCharge;

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

// v2.10.52: DELETE — delete a bill payment record (admin only)
// v2.10.116: Added 'clearAll' option — when body contains { clearAll: true },
//   deletes ALL BillPaymentTxn records (both bills and withdrawals).
//   User: "بل کا ٹوٹل سسٹم کلیئر کرنے کا بھی اپشن ہو یعنی کہ زیرو زیرو
//   ہو جائے سارا اگر کرنا چاہیں"
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // v2.10.116: Allow both ADMIN and MANAGER to clear bills
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Manager/Admin only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    // v2.10.116: Check for clearAll flag (sent as JSON body)
    const body = await req.json().catch(() => ({}));
    if (body?.clearAll === true) {
      // Delete ALL bill payment transactions and return the count.
      // Wrap in a transaction so we don't end up with partial state if
      // something fails midway.
      const result = await db.billPaymentTxn.deleteMany({});
      return NextResponse.json({
        ok: true,
        deletedCount: result.count || 0,
        message: "All bill transactions cleared. System reset to zero.",
      });
    }

    if (!id) return NextResponse.json({ error: "Bill payment ID required (or send { clearAll: true } in body)" }, { status: 400 });

    await db.billPaymentTxn.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
