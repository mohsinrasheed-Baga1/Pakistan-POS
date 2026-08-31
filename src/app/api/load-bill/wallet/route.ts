import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);

    const where: Record<string, any> = {};

    // Filter by provider
    const provider = searchParams.get("provider");
    if (provider) {
      where.provider = provider;
    }

    // Filter by type
    const type = searchParams.get("type");
    if (type) {
      where.type = type;
    }

    // Filter by date range
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    // Search by customer name, phone, or reference
    const search = searchParams.get("search")?.trim();
    if (search) {
      where.OR = [
        { customerName: { contains: search } },
        { customerPhone: { contains: search } },
        { referenceNo: { contains: search } },
      ];
    }

    const transactions = await db.walletTxn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ transactions });
  } catch (error: any) {
    console.error("[wallet GET]", error);
    return NextResponse.json({ error: "Failed to fetch wallet transactions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      provider,
      type,
      amount,
      serviceCharge,
      customerName,
      customerPhone,
      referenceNo,
      operatorName,
      note,
    } = body;

    if (!provider || !type) {
      return NextResponse.json({ error: "Provider and type are required" }, { status: 400 });
    }

    const validProviders = ["JAZZCASH", "EASYPAISA"];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Provider must be one of: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    const validTypes = ["SEND", "RECEIVE"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const parsedServiceCharge = Number(serviceCharge) || 0;

    const transaction = await db.walletTxn.create({
      data: {
        provider,
        type,
        amount: parsedAmount,
        serviceCharge: parsedServiceCharge,
        customerName: customerName?.toString().trim() || null,
        customerPhone: customerPhone?.toString().trim() || null,
        referenceNo: referenceNo?.toString().trim() || null,
        operatorName: operatorName || user.name || null,
        note: note?.toString().trim() || null,
      },
    });

    // v2.10.53: Auto-sync the wallet account's new balance to its POS Product mirror
    // (the WalletTab UI updates the WalletAccount.balance separately via
    // /api/load-bill/wallet-accounts PUT — we just need to mirror that
    // updated balance to the Product.stock for POS sync).
    try {
      if (accountId) {
        const account = await db.walletAccount.findUnique({ where: { id: accountId } });
        if (account) {
          const barcode = `WALLET-${account.name.toUpperCase().replace(/\s+/g, "")}`;
          const product = await db.product.findUnique({ where: { barcode } });
          if (product) {
            await db.product.update({
              where: { id: product.id },
              data: {
                stock: Math.floor(account.balance),
                name: account.name, // in case it was renamed
              },
            });
            console.log(`[wallet] Synced ${account.name} balance → POS Product stock: ${account.balance}`);
          }
        }
      }
    } catch (syncErr: any) {
      console.warn("[wallet] POS Product sync failed (non-fatal):", syncErr?.message);
    }

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error: any) {
    console.error("[wallet POST]", error);
    return NextResponse.json({ error: "Failed to create wallet transaction" }, { status: 500 });
  }
}
