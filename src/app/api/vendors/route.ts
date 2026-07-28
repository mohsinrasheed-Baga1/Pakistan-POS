import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { companyName: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  const vendors = await db.vendor.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json({ vendors });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const vendor = await db.vendor.create({
    data: {
      name: body.name.trim(),
      companyName: body.companyName || null,
      phone: body.phone || null,
      address: body.address || null,
      note: body.note || null,
      active: body.active !== false,
    },
  });
  return NextResponse.json({ vendor });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }
  const vendor = await db.vendor.update({
    where: { id: body.id },
    data: {
      name: body.name?.trim(),
      companyName: body.companyName || null,
      phone: body.phone || null,
      address: body.address || null,
      note: body.note || null,
      active: body.active,
    },
  });
  return NextResponse.json({ vendor });
}
