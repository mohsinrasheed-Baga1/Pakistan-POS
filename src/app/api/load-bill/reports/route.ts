import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "daily-cash";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const companyId = searchParams.get("companyId");

    // Build date range filter
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const createdAtFilter = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

    switch (type) {
      // ─── Daily Cash Summary ───────────────────────────────────────
      case "daily-cash": {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const start = from ? new Date(from) : today;
        const end = to ? new Date(to) : new Date();
        end.setHours(23, 59, 59, 999);

        // Mobile load sales summary
        const mobileLoadSales = await db.mobileLoadTxn.aggregate({
          where: {
            type: "SALE",
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true, profit: true },
          _count: true,
        });

        // Mobile load purchases summary
        const mobileLoadPurchases = await db.mobileLoadTxn.aggregate({
          where: {
            type: "PURCHASE",
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
          _count: true,
        });

        // Bill payments summary
        const billPayments = await db.billPaymentTxn.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
          },
          _sum: { billAmount: true, serviceCharge: true, totalPaid: true },
          _count: true,
        });

        // Wallet transactions summary
        const walletTxns = await db.walletTxn.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true, serviceCharge: true },
          _count: true,
        });

        const totalLoadSalesAmount = mobileLoadSales._sum.amount || 0;
        const totalLoadSalesProfit = mobileLoadSales._sum.profit || 0;
        const totalLoadPurchasesAmount = mobileLoadPurchases._sum.amount || 0;
        const totalBillServiceCharge = billPayments._sum.serviceCharge || 0;
        const totalBillPaid = billPayments._sum.totalPaid || 0;
        const totalWalletServiceCharge = walletTxns._sum.serviceCharge || 0;

        return NextResponse.json({
          type: "daily-cash",
          period: { from: start, to: end },
          mobileLoad: {
            salesAmount: totalLoadSalesAmount,
            salesProfit: totalLoadSalesProfit,
            salesCount: mobileLoadSales._count || 0,
            purchaseAmount: totalLoadPurchasesAmount,
            purchaseCount: mobileLoadPurchases._count || 0,
            netCashflow: totalLoadSalesAmount - totalLoadPurchasesAmount,
          },
          billPayments: {
            totalPaid: totalBillPaid,
            serviceCharge: totalBillServiceCharge,
            count: billPayments._count || 0,
          },
          wallet: {
            totalAmount: walletTxns._sum.amount || 0,
            serviceCharge: totalWalletServiceCharge,
            count: walletTxns._count || 0,
          },
          totalServiceCharge: totalBillServiceCharge + totalWalletServiceCharge,
          totalProfit: totalLoadSalesProfit,
        });
      }

      // ─── Company-wise Breakdown ───────────────────────────────────
      case "company-wise": {
        const companies = await db.mobileLoadCompany.findMany({
          where: companyId ? { id: companyId } : undefined,
          include: {
            transactions: createdAtFilter
              ? {
                  where: { createdAt: createdAtFilter },
                  orderBy: { createdAt: "desc" },
                }
              : {
                  orderBy: { createdAt: "desc" },
                },
          },
          orderBy: { name: "asc" },
        });

        const breakdown = companies.map((c) => {
          const filteredTxns = createdAtFilter
            ? c.transactions.filter((t) => {
                if (createdAtFilter.gte && t.createdAt < createdAtFilter.gte) return false;
                if (createdAtFilter.lte && t.createdAt > createdAtFilter.lte) return false;
                return true;
              })
            : c.transactions;

          const sales = filteredTxns.filter((t) => t.type === "SALE");
          const purchases = filteredTxns.filter((t) => t.type === "PURCHASE");

          return {
            id: c.id,
            name: c.name,
            active: c.active,
            currentBalance: c.balance,
            totalPurchased: purchases.reduce((s, t) => s + t.amount, 0),
            totalSold: sales.reduce((s, t) => s + t.amount, 0),
            totalProfit: sales.reduce((s, t) => s + t.profit, 0),
            salesCount: sales.length,
            purchaseCount: purchases.length,
            transactions: filteredTxns,
          };
        });

        return NextResponse.json({
          type: "company-wise",
          companies: breakdown,
        });
      }

      // ─── Service Charge Report ────────────────────────────────────
      case "service-charge": {
        const start = from ? new Date(from) : new Date();
        start.setHours(0, 0, 0, 0);
        const end = to ? new Date(to) : new Date();
        end.setHours(23, 59, 59, 999);

        // Bill payment service charges grouped by category
        const billCharges = await db.billPaymentTxn.groupBy({
          by: ["category"],
          where: { createdAt: { gte: start, lte: end } },
          _sum: { serviceCharge: true, billAmount: true, totalPaid: true },
          _count: true,
        });

        // Wallet service charges grouped by provider
        const walletCharges = await db.walletTxn.groupBy({
          by: ["provider"],
          where: { createdAt: { gte: start, lte: end } },
          _sum: { serviceCharge: true, amount: true },
          _count: true,
        });

        const totalBillCharge = billCharges.reduce((s, g) => s + (g._sum.serviceCharge || 0), 0);
        const totalWalletCharge = walletCharges.reduce((s, g) => s + (g._sum.serviceCharge || 0), 0);

        return NextResponse.json({
          type: "service-charge",
          period: { from: start, to: end },
          billPaymentCharges: billCharges,
          walletCharges: walletCharges,
          totalServiceCharge: totalBillCharge + totalWalletCharge,
        });
      }

      // ─── Profit Report ───────────────────────────────────────────
      case "profit": {
        const start = from ? new Date(from) : new Date();
        start.setHours(0, 0, 0, 0);
        const end = to ? new Date(to) : new Date();
        end.setHours(23, 59, 59, 999);

        const profitTxns = await db.mobileLoadTxn.findMany({
          where: {
            type: "SALE",
            createdAt: { gte: start, lte: end },
            ...(companyId ? { companyId } : {}),
          },
          include: { company: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        });

        const totalProfit = profitTxns.reduce((s, t) => s + t.profit, 0);
        const totalCost = profitTxns.reduce((s, t) => s + t.costPrice, 0);
        const totalRevenue = profitTxns.reduce((s, t) => s + t.salePrice, 0);

        // Group by company
        const byCompany: Record<string, { name: string; profit: number; count: number }> = {};
        for (const t of profitTxns) {
          if (!byCompany[t.companyId]) {
            byCompany[t.companyId] = { name: t.company.name, profit: 0, count: 0 };
          }
          byCompany[t.companyId].profit += t.profit;
          byCompany[t.companyId].count += 1;
        }

        return NextResponse.json({
          type: "profit",
          period: { from: start, to: end },
          transactions: profitTxns,
          summary: {
            totalRevenue,
            totalCost,
            totalProfit,
            profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0",
            transactionCount: profitTxns.length,
          },
          byCompany,
        });
      }

      // ─── Wallet Report ───────────────────────────────────────────
      case "wallet": {
        const start = from ? new Date(from) : new Date();
        start.setHours(0, 0, 0, 0);
        const end = to ? new Date(to) : new Date();
        end.setHours(23, 59, 59, 999);

        const txns = await db.walletTxn.findMany({
          where: { createdAt: { gte: start, lte: end } },
          orderBy: { createdAt: "desc" },
        });

        const sends = txns.filter((t) => t.type === "SEND");
        const receives = txns.filter((t) => t.type === "RECEIVE");

        const totalSendAmount = sends.reduce((s, t) => s + t.amount, 0);
        const totalReceiveAmount = receives.reduce((s, t) => s + t.amount, 0);
        const totalServiceCharge = txns.reduce((s, t) => s + t.serviceCharge, 0);

        // Group by provider
        const byProvider = await db.walletTxn.groupBy({
          by: ["provider"],
          where: { createdAt: { gte: start, lte: end } },
          _sum: { amount: true, serviceCharge: true },
          _count: true,
        });

        // Group by type
        const byType = await db.walletTxn.groupBy({
          by: ["type"],
          where: { createdAt: { gte: start, lte: end } },
          _sum: { amount: true, serviceCharge: true },
          _count: true,
        });

        return NextResponse.json({
          type: "wallet",
          period: { from: start, to: end },
          transactions: txns,
          summary: {
            totalSent: totalSendAmount,
            totalReceived: totalReceiveAmount,
            totalAmount: totalSendAmount + totalReceiveAmount,
            totalServiceCharge,
            sendCount: sends.length,
            receiveCount: receives.length,
          },
          byProvider,
          byType,
        });
      }

      default:
        return NextResponse.json(
          {
            error: "Invalid report type. Use: daily-cash, company-wise, service-charge, profit, or wallet",
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[load-bill/reports GET]", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
