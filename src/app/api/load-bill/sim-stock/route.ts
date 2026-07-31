import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // IN_STOCK | SOLD | undefined (all)
    const where: any = {};
    if (status) where.status = status;
    const sims = await db.simStock.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ sims });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") return NextResponse.json({ error: "Manager only" }, { status: 403 });
  try {
    const body = await req.json();
    const { company, type, phoneNumber, costPrice, salePrice, note } = body;
    if (!company || !type) return NextResponse.json({ error: "Company and type required" }, { status: 400 });
    const validTypes = ["NEW", "REPLACEMENT"];
    if (!validTypes.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    const sim = await db.simStock.create({
      data: {
        company,
        type,
        phoneNumber: phoneNumber?.trim() || null,
        costPrice: Number(costPrice) || 0,
        salePrice: Number(salePrice) || 0,
        note: note?.trim() || null,
      },
    });
    return NextResponse.json({ sim }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT — sell a SIM (mark as SOLD, update customer info)
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id, customerName, customerPhone, salePrice, note } = body;
    if (!id) return NextResponse.json({ error: "SIM ID required" }, { status: 400 });
    const sim = await db.simStock.update({
      where: { id },
      data: {
        status: "SOLD",
        soldAt: new Date(),
        customerName: customerName?.trim() || null,
        customerPhone: customerPhone?.trim() || null,
        salePrice: Number(salePrice) || undefined,
        note: note?.trim() || undefined,
      },
    });
    return NextResponse.json({ sim });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
