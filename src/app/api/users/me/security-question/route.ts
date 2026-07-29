import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// GET - fetch current user's security question (answer NOT included)
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { securityQuestion: true },
    });

    return NextResponse.json({ question: dbUser?.securityQuestion || null });
  } catch {
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

// PUT - set/update security question and answer
export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { securityQuestion, securityAnswer } = body;

    if (!securityQuestion || !securityAnswer) {
      return NextResponse.json(
        { error: "Question and answer are required" },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        securityQuestion: securityQuestion.trim(),
        securityAnswer: securityAnswer.trim(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
