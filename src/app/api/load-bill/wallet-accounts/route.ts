import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status:  401 });
  try {
    const accounts = await db.walletAccount.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ accounts });
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
    const { name, provider, phoneNumber, accountNumber, balance } = body;
    if (!name || !provider) return NextResponse.json({ error: "Name and provider required" }, { status: 400 });
    const validProviders = ["JAZZCASH", "EASYPAISA", "BANK"];
    if (!validProviders.includes(provider)) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    const account = await db.walletAccount.create({
      data: {
        name: name.trim(),
        provider,
        phoneNumber: phoneNumber?.trim() || null,
        accountNumber: accountNumber?.trim() || null,
        balance: Number(balance) || 0,
      },
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT — update account balance (called after wallet transactions)
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id, balance, totalReceived, totalSent, totalCharges } = body;
    if (!id) return NextResponse.json({ error: "Account ID required" }, { status: 400 });
    const existing = await db.walletAccount.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const updateData: any = {};
    if (balance !== undefined) updateData.balance = Number(balance);
    if (totalReceived !== undefined) updateData.totalReceived = existing.totalReceived + Number(totalReceived);
    if (totalSent !== undefined) updateData.totalSent = existing.totalSent + Number(totalSent);
    if (totalCharges !== undefined) updateData.totalCharges = existing.totalCharges + Number(totalCharges);

    // v2.10.52: Also allow editing name/provider/phone/accountNumber
    const { name, provider, phoneNumber, accountNumber, active } = body;
    if (name !== undefined) updateData.name = String(name).trim();
    if (provider !== undefined && ["JAZZCASH", "EASYPAISA", "BANK"].includes(provider)) updateData.provider = provider;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber?.trim() || null;
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber?.trim() || null;
    if (active !== undefined) updateData.active = Boolean(active);

    const account = await db.walletAccount.update({ where: { id }, data: updateData });
    return NextResponse.json({ account });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// v2.10.52: DELETE — delete wallet account
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Account ID required" }, { status: 400 });

    // Delete linked transactions first, then the account
    await db.walletTxn.deleteMany({ where: { accountId: id } }).catch(() => null);
    await db.walletAccount.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
