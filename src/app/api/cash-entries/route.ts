import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { todayRange } from "@/lib/pos-utils";

// v2.10.108: Cash drawer entries — opening cash, manual cash in/out.
//
// GET  — list today's entries (or all entries in a date range)
// POST — create a new entry (OPENING | CASH_IN | CASH_OUT)
//
// The cash-on-hand formula in /api/reports combines:
//   opening cash + cash sales - cash returns + wallet SEND - wallet RECEIVE
//   + cash deposits - cash purchases + manual cash in - manual cash out

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "today"; // today | all
  const date = searchParams.get("date"); // YYYY-MM-DD for custom date

  const where: any = {};
  if (date) {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59");
    where.date = { gte: start, lte: end };
  } else if (range === "today") {
    const { start, end } = todayRange();
    where.date = { gte: start, lte: end };
  }

  try {
    const entries = await db.cashEntry.findMany({
      where,
      orderBy: { date: "desc" },
      take: 200,
    });

    // Compute totals by type
    const opening = entries.filter(e => e.type === "OPENING").reduce((s, e) => s + e.amount, 0);
    const cashIn = entries.filter(e => e.type === "CASH_IN").reduce((s, e) => s + e.amount, 0);
    const cashOut = entries.filter(e => e.type === "CASH_OUT").reduce((s, e) => s + e.amount, 0);

    return NextResponse.json({
      entries,
      totals: {
        opening,
        cashIn,
        cashOut,
        net: opening + cashIn - cashOut,
      },
    });
  } catch (e: any) {
    console.error("[cash-entries GET]", e?.message);
    return NextResponse.json({ error: e?.message || "Failed to fetch cash entries" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { amount, type, description } = body;

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const validTypes = ["OPENING", "CASH_IN", "CASH_OUT"];
    const finalType = type || "OPENING";
    if (!validTypes.includes(finalType)) {
      return NextResponse.json({ error: `Type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }

    // If type is OPENING, check if there's already an opening entry today.
    // Only ONE opening cash per day — if user re-enters, we REPLACE the
    // existing one (so they can correct a wrong entry without needing
    // a delete button).
    if (finalType === "OPENING") {
      const { start, end } = todayRange();
      const existing = await db.cashEntry.findFirst({
        where: {
          type: "OPENING",
          date: { gte: start, lte: end },
        },
        orderBy: { date: "desc" },
      });
      if (existing) {
        await db.cashEntry.update({
          where: { id: existing.id },
          data: {
            amount: parsedAmount,
            description: description?.toString().trim() || existing.description,
            date: new Date(),
          },
        });
        const updated = await db.cashEntry.findUnique({ where: { id: existing.id } });
        return NextResponse.json({ entry: updated, replaced: true });
      }
    }

    const entry = await db.cashEntry.create({
      data: {
        amount: parsedAmount,
        type: finalType,
        description: description?.toString().trim() || null,
        date: new Date(),
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (e: any) {
    console.error("[cash-entries POST]", e?.message);
    return NextResponse.json({ error: e?.message || "Failed to create cash entry" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Entry ID required" }, { status: 400 });

    await db.cashEntry.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
