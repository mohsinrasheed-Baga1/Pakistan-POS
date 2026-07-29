import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    const company = await db.mobileLoadCompany.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error("[companies/id GET]", error);
    return NextResponse.json({ error: "Failed to fetch company" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.mobileLoadCompany.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const data: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = (body.name || "").toString().trim();
      if (!name) {
        return NextResponse.json({ error: "Company name cannot be empty" }, { status: 400 });
      }
      data.name = name;
    }
    if (body.active !== undefined) {
      data.active = Boolean(body.active);
    }

    const company = await db.mobileLoadCompany.update({
      where: { id },
      data,
    });

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error("[companies/id PUT]", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Company name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await db.mobileLoadCompany.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (existing._count.transactions > 0) {
      return NextResponse.json(
        { error: "Cannot delete company with existing transactions" },
        { status: 400 }
      );
    }

    await db.mobileLoadCompany.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[companies/id DELETE]", error);
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 });
  }
}
