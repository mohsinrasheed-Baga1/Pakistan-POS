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

  // v2.10.105: REVERTED v2.10.99 changes that included RETURNED/PARTIAL_RETURN
  //   sales as negative amounts. This was causing NEGATIVE PROFIT in morning
  //   reports — when a sale was returned (e.g., via Edit), the RETURNED sale
  //   showed as negative revenue, making the total profit negative.
  //   User: "صبح صبح اکاؤنٹ یعنی منفی میں جا رہا ہے ... پرافٹ منفی میں
  //   جا رہا ہے" (in the morning, the account goes negative... profit goes
  //   negative).
  //   Root cause: When user edits a sale, the original is marked RETURNED.
  //   The report subtracted the RETURNED sale's total from revenue, but the
  //   new COMPLETED sale (from re-checkout) might not have been created yet
  //   (or was on a different day), causing the report to show only the
  //   negative RETURNED sale without the offsetting positive COMPLETED sale.
  //   Fix: Only include COMPLETED sales in revenue/cost/profit calculations.
  //   Returned sales are excluded entirely (their stock was already restored).
  //
  // v2.10.108: REVISED — User now wants returns to be SUBTRACTED as a
  //   separate line item. So:
  //     - COMPLETED sales are summed POSITIVELY into revenue (as before)
  //     - SaleReturn amounts in the date range are summed NEGATIVELY into
  //       a new `totalReturns` field
  //     - Reports show both: totalRevenue (gross) and netRevenue (revenue - returns)
  //     - This is "subtract returns" without the original double-counting bug
  //       (because we subtract the SaleReturn AMOUNT, not the RETURNED sale's
  //       total — SaleReturn.amount is the actual refund given to customer,
  //       which is what matters for cash flow).
  //
  // v2.10.109: CRITICAL FIX — User reported NEGATIVE PROFIT in reports.
  //   Root cause: v2.10.108 was DOUBLE-COUNTING returns.
  //   The `sales` query already filters to status="COMPLETED" (line 58),
  //   so returned sales are EXCLUDED from totalRevenue AND totalCost.
  //   Subtracting totalReturnsAmount from totalProfit AGAIN was wrong:
  //     - Returned sale's revenue: already excluded (not in totalRevenue)
  //     - Returned items' cost: already excluded (not in totalCost, and
  //       inventory was restored so no real cost loss)
  //     - The refund amount: a CASH flow (already subtracted in cashOnHand),
  //       but NOT a profit loss (the shop got their inventory back).
  //   Fix:
  //     - totalProfit = totalRevenue - totalCost - discounts
  //       (DOES NOT subtract returns — they're already excluded from rev/cost)
  //     - netRevenue = totalRevenue (returns already excluded)
  //     - Keep totalReturnsAmount in response for cash flow + informational
  //       display (cash drawer DOES subtract returns because refund was cash)
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: start, lte: end }, status: "COMPLETED" },
    include: { items: true },
  });

  // v2.10.108: Fetch all SaleReturns in the date range (regardless of which
  // day the original sale was made on — the refund happened today, so it
  // affects TODAY's cash flow).
  //
  // v2.10.109: CRITICAL FIX — Only CASH payment returns affect the cash
  // drawer. Card / Shop Card / Mobile returns refund went back to the
  // card/account, NOT to cash. Previously we subtracted ALL SaleReturn
  // amounts from cashOnHand, which made cash on hand too negative when
  // shop card sales were returned. Now we join with the original Sale to
  // get paymentMethod and only count CASH returns for the cash drawer.
  const returns = await db.saleReturn.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: {
      amount: true,
      saleId: true,
      createdAt: true,
      sale: { select: { paymentMethod: true } },
    },
  });
  const totalReturnsAmount = returns.reduce((s, r) => s + (r.amount || 0), 0);
  // v2.10.109: Only CASH payment returns affect the cash drawer
  const cashReturnsAmount = returns
    .filter(r => !r.sale || r.sale.paymentMethod === "CASH")
    .reduce((s, r) => s + (r.amount || 0), 0);

  const totalSales = sales.length;
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  // v2.10.109: netRevenue = totalRevenue (returns are already excluded
  // from totalRevenue because we filter to status="COMPLETED" only).
  // Kept as a separate field for backward compat with reports-view.tsx.
  const netRevenue = totalRevenue;
  const totalCost = sales.reduce(
    (s, x) => s + x.items.reduce((c, i) => c + i.costPrice * i.quantity, 0),
    0
  );
  // v2.10.109: totalProfit NO LONGER subtracts returns — they're already
  // excluded from revenue and cost. The refund was a cash flow (already
  // subtracted in cashOnHand), not a profit loss (inventory was restored).
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
  // v2.10.78: Fetch id+name too so we can build a cardId→name map for
  // the cash deposits list below (avoids a second CustomerCard query).
  const cards = await db.customerCard.findMany({
    select: { id: true, name: true, balance: true, totalPurchases: true, totalPaid: true },
  });
  const totalCustomerAdvance = cards.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
  const totalCustomerDue = cards.reduce((s, c) => s + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
  const customersWithDue = cards.filter((c) => c.balance < 0).map((c) => ({
    name: c.name,
    balance: c.balance,
    totalPurchases: c.totalPurchases,
    totalPaid: c.totalPaid,
  })).sort((a, b) => a.balance - b.balance); // most due first

  // ─── v2.10.78: CASH DEPOSITS (Customer Card Top-ups) ───────────────────
  // These are SEPARATE from sales. Sales = items we sold. Cash deposits =
  // money customers paid to top up their card balance (e.g., paying back
  // old debts, or prepaying for future purchases).
  //
  // The user spec: "سیل وہ ہے جو ہم نے سودا بیچ دیا ہے — کیش وہ ہے جو ہم
  // نے ابھی پرانا سودا بیچے ہوئے پیسے واپس لیے ہیں"
  // (Sales = items we sold. Cash = money we took back for old debts sold.)
  //
  // We sum DEPOSIT-type card transactions in the date range and break them
  // down by cashType (CASH vs LEGITIMATE_CASH — parsed from the description
  // prefix that handleTxSave in cards-view.tsx adds).
  const cardDeposits = await db.cardTransaction.findMany({
    where: {
      type: "DEPOSIT",
      createdAt: { gte: start, lte: end },
    },
    select: {
      amount: true,
      description: true,
      createdAt: true,
      cardId: true,
      note: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  // Build a cardId → customer name map from the already-fetched cards list
  // (avoids an extra DB query — important for performance on large DBs)
  const cardIdToName: Record<string, string> = {};
  cards.forEach((c) => { cardIdToName[c.id] = c.name; });

  let totalCashDeposits = 0;       // sum of all CASH deposits
  let totalLegitimateCash = 0;    // sum of all LEGITIMATE_CASH deposits
  const cashDepositsList: {
    customerName: string;
    amount: number;
    cashType: "CASH" | "LEGITIMATE_CASH";
    description: string;
    createdAt: string;
  }[] = [];
  for (const d of cardDeposits) {
    const desc = d.description || "";
    const isLegitimate = desc.startsWith("[جائز کیش]");
    const isCash = desc.startsWith("[CASH]");
    const cashType: "CASH" | "LEGITIMATE_CASH" = isLegitimate ? "LEGITIMATE_CASH" : "CASH";
    if (isLegitimate) {
      totalLegitimateCash += d.amount;
    } else {
      totalCashDeposits += d.amount;
    }
    cashDepositsList.push({
      customerName: cardIdToName[d.cardId] || "Unknown",
      amount: d.amount,
      cashType,
      description: desc.replace(/^\[(CASH|جائز کیش)\]\s*/, ""),
      createdAt: d.createdAt.toISOString(),
    });
  }


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

  // v2.10.106: Total purchases (stock buying) for the selected period
  // Uses the Expense model with category="purchase"
  const purchases = await db.expense.findMany({
    where: {
      category: "purchase",
      date: { gte: start, lte: end },
    },
    orderBy: { date: "desc" },
    take: 100,
  });
  const totalPurchases = purchases.reduce((s, p) => s + p.amount, 0);

  // ─── v2.10.108: CASH ON HAND CALCULATION ──────────────────────────────
  // Total cash physically present in the shop's cash drawer.
  //
  // v2.10.113: REVISED — LoadBill Management totals (wallet SEND/RECEIVE,
  //   bill collection, load companies) should NOT appear in Reports.
  //   Reports should only reflect the basic karyana (grocery) cash flow.
  //
  // v2.10.117: CRITICAL FIX — cashDeposits (CUSTOMER CARD TOP-UPS) were
  //   incorrectly removed in v2.10.113 along with the LoadBill Management
  //   stuff. But customer card top-ups are NOT part of LoadBill Management —
  //   they're part of Shop Cards (CustomerCard ledger). When a customer
  //   physically hands cash to the shopkeeper to deposit on their card,
  //   that cash IS in the shop's drawer and SHOULD be in Cash in Hand.
  //   User: "جو میں نے کھاتے تھے ویسے ریسیو کیے ہیں 10 ہزار روپیہ تو وہ
  //   کیش کے اندر شامل نہیں ہوا اور کیش ان ہینڈ کے اندر بھی شامل نہیں
  //   ہوا جو نقد ہے اس میں 10 ہزار شامل ہونا چاہیے تھا. جو نیچے کیش
  //   رسید سودا تو کسٹمر سے واپس لیے یعنی کہ کسٹمر ڈیپوزٹ جو شاپ کار سے
  //   سودا لے کر گئے تھے اور واپس پیسے جمع کروائے ہیں اپنے کارڈ کے
  //   اندر ڈیپوزٹ کروائے ہیں اسے درست کرو"
  //   Fix: Add cashDeposits BACK to the cashOnHand formula. Cash deposits
  //   (Rs 10,000 in screenshot) come from CardTransaction (type=DEPOSIT)
  //   — these are the shopkeeper's own customer ledger top-ups.
  //
  // Formula:
  //   opening cash (today's CashEntry OPENING)
  // + cash sales in range (paymentMethod=CASH, status=COMPLETED)
  // + cash deposits in range (customer card top-ups with cash)
  // - CASH returns in range (only cash payment refunds)
  // + manual cash IN entries (CashEntry CASH_IN)
  // - manual cash OUT entries (CashEntry CASH_OUT)
  // - cash purchases in range (stock buying with cash)
  // = Cash in Hand
  //
  // Still removed from cashOnHand (LoadBill Management only):
  //   - wallet SEND/RECEIVE
  //   - bill collection totals
  //   - load companies totals
  //
  // For non-today ranges, opening cash doesn't apply (we only track today's
  // opening) — the value will reflect only the cash flow movements in range.
  const cashSales = sales.filter(s => s.paymentMethod === "CASH").reduce((s, x) => s + x.total, 0);

  // Cash entries (opening + manual in/out) — these are karyana drawer movements
  const cashEntries = await db.cashEntry.findMany({
    where: { date: { gte: start, lte: end } },
  });
  const openingCash = cashEntries.filter(e => e.type === "OPENING").reduce((s, e) => s + e.amount, 0);
  const manualCashIn = cashEntries.filter(e => e.type === "CASH_IN").reduce((s, e) => s + e.amount, 0);
  const manualCashOut = cashEntries.filter(e => e.type === "CASH_OUT").reduce((s, e) => s + e.amount, 0);

  // v2.10.117: Sum of cash deposits (customer card top-ups with cash).
  //   cashDepositsList is computed earlier in this function — it includes
  //   CardTransaction records with type=DEPOSIT, where the description
  //   is prefixed with "[CASH]" or "[جائز کیش]".
  //   totalCashDeposits here = sum of BOTH [CASH] + [جائز کیش] (existing
  //   `totalCashDeposits` variable from earlier code only counts [CASH] —
  //   we need both because both are physical cash drawer inflows).
  const totalCashDepositsInDrawer = totalCashDeposits + totalLegitimateCash;

  // v2.10.117: cashOnHand now includes cashDeposits again — customer
  //   card top-ups ARE cash drawer inflows (the customer handed cash
  //   to the shopkeeper to deposit on their card balance).
  const cashOnHand =
    openingCash +
    cashSales +
    totalCashDepositsInDrawer +  // v2.10.117: customer card top-ups with cash
    manualCashIn -
    manualCashOut -
    cashReturnsAmount -
    totalPurchases;

  return NextResponse.json({
    range,
    totalSales,
    totalRevenue,
    netRevenue,        // v2.10.108: revenue - returns
    totalReturnsAmount, // v2.10.108: total refund amount (subtract from revenue)
    totalCost,
    totalProfit,       // v2.10.108: now subtracts returns
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
    // v2.10.106: Total purchases (stock buying)
    totalPurchases,
    purchasesList: purchases.map(p => ({
      id: p.id,
      title: p.title,
      amount: p.amount,
      note: p.note,
      date: p.date.toISOString(),
    })),
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
    // v2.10.78: CASH DEPOSITS — separate from sales
    // - totalCashDeposits: sum of "[CASH]" prefixed DEPOSIT transactions
    // - totalLegitimateCash: sum of "[جائز کیش]" prefixed DEPOSIT transactions
    // - cashDepositsList: detailed list of each deposit (for table display)
    cashDeposits: {
      totalCashDeposits,        // regular cash (رسد سودا)
      totalLegitimateCash,     // جائز کیش
      grandTotal: totalCashDeposits + totalLegitimateCash,
      list: cashDepositsList,
    },
    // v2.10.108: CASH ON HAND — total cash physically in the drawer
    // v2.10.113: KARYANA-ONLY — removed wallet breakdown per user request.
    //   Reports should only reflect grocery cash flow. LoadBill Management
    //   has its own totals inside its tab.
    // v2.10.117: cashDeposits (customer card top-ups with cash) ADDED BACK
    //   — these are NOT LoadBill Management data, they're Shop Cards data.
    //   Customer physically handed cash to shopkeeper → cash is in drawer.
    cashOnHand: {
      total: cashOnHand,
      opening: openingCash,
      cashSales,
      cashDeposits: totalCashDepositsInDrawer,  // v2.10.117: customer card top-ups
      cashReturns: cashReturnsAmount,  // v2.10.109: only CASH refunds
      totalReturns: totalReturnsAmount,  // all refunds (informational)
      manualCashIn,
      manualCashOut,
      cashPurchases: totalPurchases,
    },
  });
}
