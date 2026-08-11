import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { todayRange } from "@/lib/pos-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "today"; // today | week | month | all | custom
  const fromParam = searchParams.get("from"); // ISO date string (custom range start)
  const toParam = searchParams.get("to"); // ISO date string (custom range end)

  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);
  if (range === "custom" && fromParam && toParam) {
    start = new Date(fromParam);
    start.setHours(0, 0, 0, 0);
    end = new Date(toParam);
    end.setHours(23, 59, 59, 999);
  } else if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(now.getDate() - 7);
  } else if (range === "month") {
    start.setMonth(now.getMonth() - 1);
  } else {
    start = new Date(0);
  }

  const sales = await db.sale.findMany({
    where: { createdAt: { gte: start, lte: end }, status: "COMPLETED" },
    include: { items: true },
  });

  const totalSales = sales.length;
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalCost = sales.reduce(
    (s, x) => s + x.items.reduce((c, i) => c + i.costPrice * i.quantity, 0),
    0
  );
  const totalProfit = totalRevenue - totalCost - sales.reduce((s, x) => s + x.discount, 0);
  const totalTax = sales.reduce((s, x) => s + x.taxTotal, 0);

  // top products
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  sales.forEach((s) => {
    s.items.forEach((i) => {
      if (!productMap[i.productId]) {
        productMap[i.productId] = { name: i.name, qty: 0, revenue: 0 };
      }
      productMap[i.productId].qty += i.quantity;
      productMap[i.productId].revenue += i.lineTotal;
    });
  });
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // hourly chart for today
  const { start: tStart } = todayRange();
  const todaySales = await db.sale.findMany({
    where: { createdAt: { gte: tStart, lte: now } },
    select: { createdAt: true, total: true },
  });
  const hourly: { hour: string; total: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const total = todaySales
      .filter((s) => new Date(s.createdAt).getHours() === h)
      .reduce((sum, s) => sum + s.total, 0);
    if (total > 0) hourly.push({ hour: `${h}:00`, total });
  }

  // low stock products
  const lowStock = await db.product.findMany({
    where: { active: true, stock: { lte: 5 } },
    take: 10,
    orderBy: { stock: "asc" },
    include: { category: true },
  });

  const productCount = await db.product.count({ where: { active: true } });
  const categoryCount = await db.category.count();

  // Total stock value (shop + store)
  const allProducts = await db.product.findMany({
    where: { active: true },
    select: { stock: true, storeStock: true, costPrice: true, salePrice: true, name: true },
  });
  const totalStockValue = allProducts.reduce(
    (sum, p) => sum + (p.stock + p.storeStock) * p.costPrice,
    0
  );
  const totalRetailValue = allProducts.reduce(
    (sum, p) => sum + (p.stock + p.storeStock) * p.salePrice,
    0
  );
  const totalShopStock = allProducts.reduce((sum, p) => sum + p.stock, 0);
  const totalStoreStock = allProducts.reduce((sum, p) => sum + p.storeStock, 0);

  // Detailed profit breakdown
  const profitByProduct: { name: string; revenue: number; cost: number; profit: number; qtySold: number }[] = [];
  sales.forEach((s) => {
    s.items.forEach((it) => {
      const existing = profitByProduct.find((p) => p.name === it.name);
      const revenue = it.price * it.quantity;
      const cost = it.costPrice * it.quantity;
      const profit = revenue - cost;
      if (existing) {
        existing.revenue += revenue;
        existing.cost += cost;
        existing.profit += profit;
        existing.qtySold += it.quantity;
      } else {
        profitByProduct.push({ name: it.name, revenue, cost, profit, qtySold: it.quantity });
      }
    });
  });
  profitByProduct.sort((a, b) => b.profit - a.profit);

  // ─── VENDOR DUE PAYMENTS ──────────────────────────────────────────────
  // Total money we owe to vendors (sum of positive balances)
  // Total money vendors owe us (sum of negative balances — rare, advances)
  const vendors = await db.vendor.findMany({
    select: { balance: true, totalPurchased: true, totalPaid: true, name: true },
  });
  const totalVendorDue = vendors.reduce((s, v) => s + (v.balance > 0 ? v.balance : 0), 0);
  const totalVendorAdvance = vendors.reduce((s, v) => s + (v.balance < 0 ? Math.abs(v.balance) : 0), 0);
  const totalVendorPurchased = vendors.reduce((s, v) => s + v.totalPurchased, 0);
  const totalVendorPaid = vendors.reduce((s, v) => s + v.totalPaid, 0);
  const vendorsWithDue = vendors.filter((v) => v.balance > 0).map((v) => ({
    name: v.name,
    balance: v.balance,
    totalPurchased: v.totalPurchased,
    totalPaid: v.totalPaid,
  })).sort((a, b) => b.balance - a.balance);

  // ─── CUSTOMER (SHOP CARD) CREDIT/DEBIT ────────────────────────────────
  // balance > 0 = advance (we owe customer — they paid in advance)
  // balance < 0 = due (customer owes us — they bought on credit)
  const cards = await db.customerCard.findMany({
    select: { balance: true, name: true, totalPurchases: true, totalPaid: true },
  });
  const totalCustomerAdvance = cards.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
  const totalCustomerDue = cards.reduce((s, c) => s + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
  const customersWithDue = cards.filter((c) => c.balance < 0).map((c) => ({
    name: c.name,
    balance: c.balance,
    totalPurchases: c.totalPurchases,
    totalPaid: c.totalPaid,
  })).sort((a, b) => a.balance - b.balance); // most due first

  // ─── PAYMENT METHOD BREAKDOWN (v2.9.14) ──────────────────────────────
  // Payment method breakdown — use sale.total (not paidAmount)
  // paidAmount includes the cash the customer handed over (e.g. Rs 500 for
  // a Rs 200 sale), but the ACTUAL sale value is in `total`.
  // The change (Rs 300) should NOT be counted as revenue.
  const cashTotal = sales.filter(s => s.paymentMethod === "CASH").reduce((s, x) => s + x.total, 0);
  const cardTotal = sales.filter(s => s.paymentMethod === "CARD").reduce((s, x) => s + x.total, 0);
  const shopCardTotal = sales.filter(s => s.paymentMethod === "SHOP_CARD").reduce((s, x) => s + x.total, 0);
  const mobileTotal = sales.filter(s => s.paymentMethod === "MOBILE").reduce((s, x) => s + x.total, 0);
  // Pending = VENDOR DUES (money we owe to vendors), NOT customer change
  // This shows how much we owe to suppliers/vendors
  const pendingTotal = totalVendorDue;

  return NextResponse.json({
    range,
    totalSales,
    totalRevenue,
    totalCost,
    totalProfit,
    totalTax,
    topProducts,
    hourly,
    lowStock,
    productCount,
    categoryCount,
    totalStockValue,
    totalRetailValue,
    totalShopStock,
    totalStoreStock,
    // Payment method breakdown
    cashTotal,
    cardTotal,
    shopCardTotal,
    mobileTotal,
    pendingTotal,
    profitByProduct: profitByProduct.slice(0, 20),
    // ─── New: vendor and customer balances ───
    vendorBalances: {
      totalDue: totalVendorDue,           // money we owe vendors
      totalAdvance: totalVendorAdvance,   // money vendors owe us (advances)
      totalPurchased: totalVendorPurchased,
      totalPaid: totalVendorPaid,
      vendorsWithDue,                     // list of vendors we owe money to
    },
    customerBalances: {
      totalAdvance: totalCustomerAdvance, // money we owe customers (advance payments)
      totalDue: totalCustomerDue,         // money customers owe us (credit purchases)
      netPosition: totalCustomerAdvance - totalCustomerDue,
      customersWithDue,                   // list of customers who owe us
    },
  });
}
