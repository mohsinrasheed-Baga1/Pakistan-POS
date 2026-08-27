import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET security question for a given email (used in forgot-password flow)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { securityQuestion: true, name: true },
    });

    if (!user) {
      // Don't reveal whether account exists for security
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (!user.securityQuestion) {
      return NextResponse.json(
        { error: "No security question set for this account" },
        { status: 400 }
      );
    }

    return NextResponse.json({ question: user.securityQuestion });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
