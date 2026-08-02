import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // IN_STOCK | SOLD | undefined (all)
    const where: any = {};
    if (status) where.status = status;
    const sims = await db.simStock.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ sims });
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
    const { company, type, phoneNumber, costPrice, salePrice, note, linkedCompanyId, linkedSimId } = body;
    if (!company || !type) return NextResponse.json({ error: "Company and type required" }, { status: 400 });
    const validTypes = ["NEW", "REPLACEMENT"];
    if (!validTypes.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

    // If linkedCompanyId provided, verify the company exists
    if (linkedCompanyId) {
      const linkedCompany = await db.mobileLoadCompany.findUnique({ where: { id: linkedCompanyId } });
      if (!linkedCompany) {
        return NextResponse.json({ error: "Linked load company not found" }, { status: 400 });
      }
    }

    const sim = await db.simStock.create({
      data: {
        company,
        type,
        phoneNumber: phoneNumber?.trim() || null,
        costPrice: Number(costPrice) || 0,
        salePrice: Number(salePrice) || 0,
        note: note?.trim() || null,
        linkedCompanyId: linkedCompanyId || null,
        linkedSimId: linkedSimId || null,
      },
    });
    return NextResponse.json({ sim }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT — sell a SIM (mark as SOLD, update customer info, deduct cost from linked company)
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { id, customerName, customerPhone, salePrice, note } = body;
    if (!id) return NextResponse.json({ error: "SIM ID required" }, { status: 400 });

    // Fetch the SIM to get its cost and linked company
    const existing = await db.simStock.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "SIM not found" }, { status: 404 });
    if (existing.status === "SOLD") return NextResponse.json({ error: "SIM already sold" }, { status: 400 });

    const finalSalePrice = Number(salePrice) || existing.salePrice;
    const costPrice = existing.costPrice || 0;
    const profit = finalSalePrice - costPrice;

    // Use transaction: update SIM + deduct from linked company + create load txn
    const result = await db.$transaction(async (tx) => {
      // 1. Mark SIM as sold
      const sim = await tx.simStock.update({
        where: { id },
        data: {
          status: "SOLD",
          soldAt: new Date(),
          customerName: customerName?.trim() || null,
          customerPhone: customerPhone?.trim() || null,
          salePrice: finalSalePrice,
          note: note?.trim() || undefined,
        },
      });

      // 2. If linked to a load company, deduct cost from its balance + create a SALE txn
      let companyAfter: { balance: number; totalSold: number; totalProfit: number } | null = null;
      if (existing.linkedCompanyId) {
        const company = await tx.mobileLoadCompany.findUnique({ where: { id: existing.linkedCompanyId } });
        if (company) {
          // Create a MobileLoadTxn representing the SIM sale (deducts costPrice from balance)
          await tx.mobileLoadTxn.create({
            data: {
              companyId: existing.linkedCompanyId,
              type: "SALE",
              amount: costPrice,           // Deduct cost from balance
              costPrice: costPrice,
              salePrice: finalSalePrice,
              profit: profit,
              customerName: customerName?.trim() || null,
              customerPhone: customerPhone?.trim() || null,
              operatorName: user.name || null,
              note: `SIM Sale: ${existing.company} ${existing.type} ${existing.phoneNumber || ""}`.trim(),
            },
          });
          const updated = await tx.mobileLoadCompany.update({
            where: { id: existing.linkedCompanyId },
            data: {
              balance: company.balance - costPrice,
              totalSold: company.totalSold + costPrice,
              totalProfit: company.totalProfit + profit,
            },
          });
          companyAfter = {
            balance: updated.balance,
            totalSold: updated.totalSold,
            totalProfit: updated.totalProfit,
          };
        }
      }

      return { sim, companyAfter, profit, costPrice };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
