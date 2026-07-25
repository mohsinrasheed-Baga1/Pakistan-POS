import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const card = await db.customerCard.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager/Admin only" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const existing = await db.customerCard.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {
    name: (body.name || "").toString().trim() || existing.name,
    shopkeeperName: body.shopkeeperName != null ? String(body.shopkeeperName).trim() || null : existing.shopkeeperName,
    phone: body.phone != null ? String(body.phone).trim() || null : existing.phone,
    address: body.address != null ? String(body.address).trim() || null : existing.address,
    type: body.type === "WHOLESALE" ? "WHOLESALE" : "REGULAR",
    active: body.active !== false,
  };

  const card = await db.customerCard.update({ where: { id }, data });
  return NextResponse.json({ card });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await params;

  await db.customerCard.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
