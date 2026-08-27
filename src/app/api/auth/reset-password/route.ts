import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// Reset password using security question answer (no login required)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, securityAnswer, newPassword } = body;

    if (!email || !securityAnswer || !newPassword) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (!user.securityQuestion || !user.securityAnswer) {
      return NextResponse.json(
        { error: "No security question set for this account. Contact administrator." },
        { status: 400 }
      );
    }

    // Case-insensitive comparison with trimmed whitespace
    if (
      user.securityAnswer.toLowerCase().trim() !==
      securityAnswer.toLowerCase().trim()
    ) {
      return NextResponse.json(
        { error: "Security answer is incorrect" },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
