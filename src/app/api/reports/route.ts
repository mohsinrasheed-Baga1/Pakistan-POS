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
    profitByProduct: profitByProduct.slice(0, 20),
  });
}
