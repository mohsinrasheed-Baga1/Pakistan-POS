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
