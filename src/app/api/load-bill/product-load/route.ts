import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// v2.10.47: Product Load Requests API
// GET  /api/load-bill/product-load?status=PENDING  — list load requests
// POST /api/load-bill/product-load                   — create new load request
// PATCH /api/load-bill/product-load?id=XXX           — update status (e.g. mark as COMPLETED)

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // PENDING | COMPLETED | CANCELLED
  const limit = Number(searchParams.get("limit") || 100);

  const where: any = {};
  if (status) where.status = status;

  const requests = await db.productLoadRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const productName = (body.productName || "").toString().trim();
  if (!productName) {
    return NextResponse.json({ error: "productName is required" }, { status: 400 });
  }

  const loadAmount = Number(body.loadAmount) || 0;
  const extraCharges = Number(body.extraCharges) || 0;
  const totalAmount = loadAmount + extraCharges;
  const due = Number(body.due) || 0;

  if (loadAmount <= 0) {
    return NextResponse.json({ error: "loadAmount must be > 0" }, { status: 400 });
  }

  const request = await db.productLoadRequest.create({
    data: {
      productName,
      customerName: body.customerName?.trim() || null,
      customerPhone: body.customerPhone?.trim() || null,
      loadAmount,
      extraCharges,
      totalAmount,
      due,
      status: "PENDING",
      referenceNo: body.referenceNo?.trim() || null,
      operatorName: body.operatorName?.trim() || null,
      note: body.note?.trim() || null,
    },
  });

  return NextResponse.json({ request });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const body = await req.json();
  const data: any = {};
  if (body.status) data.status = body.status;
  if (body.processedAt) data.processedAt = new Date(body.processedAt);
  if (body.processedBy !== undefined) data.processedBy = body.processedBy;
  if (body.due !== undefined) data.due = Number(body.due) || 0;
  if (body.note !== undefined) data.note = body.note;

  const request = await db.productLoadRequest.update({
    where: { id },
    data,
  });

  return NextResponse.json({ request });
}
