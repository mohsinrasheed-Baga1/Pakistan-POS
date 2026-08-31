import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const companies = await db.mobileLoadCompany.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error("[companies GET]", error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = (body.name || "").toString().trim();

    if (!name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const company = await db.mobileLoadCompany.create({
      data: { name },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    console.error("[companies POST]", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Company name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}

// v2.10.52: PUT — edit company (rename, update balance, toggle active)
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, name, balance, active } = body;
    if (!id) return NextResponse.json({ error: "Company ID required" }, { status: 400 });

    const existing = await db.mobileLoadCompany.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (balance !== undefined) updateData.balance = Number(balance);
    if (active !== undefined) updateData.active = Boolean(active);

    // Check name uniqueness if being renamed
    if (updateData.name && updateData.name !== existing.name) {
      const dup = await db.mobileLoadCompany.findUnique({ where: { name: updateData.name } });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: "Company name already exists" }, { status: 409 });
      }
    }

    const company = await db.mobileLoadCompany.update({ where: { id }, data: updateData });
    return NextResponse.json({ company });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// v2.10.52: DELETE — delete company (cascades to its transactions)
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Company ID required" }, { status: 400 });

    await db.mobileLoadCompany.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
