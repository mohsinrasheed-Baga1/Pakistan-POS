import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema, resetSchemaFlag } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/db-diagnose
//
// Inspects the actual SQLite database schema and reports:
//   - Which tables exist / are missing
//   - Which columns exist / are missing on each table
//   - Whether ensureSchema ran successfully
//   - A "healthy" boolean at the top level
//
// This endpoint is read-only — it only queries sqlite_master and PRAGMA
// table_info, never modifies the database. Use POST to force a re-run of
// ensureSchema (useful if a backup restore left the schema in a partial
// state).
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_TABLES = [
  "User", "Category", "Vendor", "VendorPurchase",
  "Product", "Sale", "SaleReturn", "SaleItem",
  "StockLog", "CustomerCard", "CardTransaction", "StoreTransaction",
  "Expense", "Settings",
  "MobileLoadCompany", "MobileLoadTxn", "BillPaymentTxn", "WalletTxn",
];

const EXPECTED_COLUMNS: Record<string, string[]> = {
  User: ["id", "email", "name", "password", "phone", "role", "active", "securityQuestion", "securityAnswer", "createdAt", "updatedAt"],
  Category: ["id", "name", "icon", "createdAt", "updatedAt"],
  Vendor: ["id", "name", "companyName", "phone", "address", "note", "active", "totalPurchased", "totalPaid", "balance", "createdAt", "updatedAt"],
  VendorPurchase: ["id", "vendorId", "amount", "type", "description", "paymentDate", "createdAt"],
  Product: ["id", "name", "barcode", "barcodeType", "categoryId", "vendorId", "costPrice", "salePrice", "wholesalePrice", "shopkeeperPrice", "unit", "stock", "storeStock", "minStock", "taxRate", "expiryDate", "manufacturingDate", "hasBarcode", "image", "active", "packBarcode", "packQuantity", "packPrice", "createdAt", "updatedAt"],
  Sale: ["id", "invoiceNo", "userId", "cardId", "customerName", "customerPhone", "subtotal", "taxTotal", "discount", "total", "paidAmount", "change", "paymentMethod", "saleType", "status", "originalSaleId", "note", "createdAt"],
  SaleReturn: ["id", "saleId", "userId", "amount", "reason", "restocked", "createdAt"],
  SaleItem: ["id", "saleId", "productId", "name", "barcode", "price", "costPrice", "quantity", "unit", "taxRate", "lineTotal"],
  StockLog: ["id", "productId", "type", "quantity", "note", "createdAt"],
  CustomerCard: ["id", "cardNumber", "customerId", "name", "phone", "address", "type", "balance", "totalPurchases", "totalPaid", "active", "createdAt", "updatedAt"],
  CardTransaction: ["id", "cardId", "type", "amount", "description", "saleId", "operatorName", "note", "createdAt"],
  StoreTransaction: ["id", "productId", "type", "quantity", "note", "createdAt"],
  Expense: ["id", "title", "amount", "category", "note", "date", "createdAt"],
  Settings: ["id", "shopName", "subName", "logo", "shopAddress", "shopPhone", "currency", "taxEnabled", "defaultTax", "receiptFooter", "invoicePrefix", "printerWidth", "backupPasswordHash", "shareMode", "dbNetworkPath", "googleClientId", "googleClientSecret", "googleRefreshToken", "createdAt", "updatedAt"],
  MobileLoadCompany: ["id", "name", "balance", "totalPurchased", "totalSold", "totalProfit", "active", "createdAt", "updatedAt"],
  MobileLoadTxn: ["id", "companyId", "type", "amount", "costPrice", "salePrice", "profit", "customerPhone", "customerName", "referenceNo", "operatorName", "note", "createdAt"],
  BillPaymentTxn: ["id", "category", "consumerName", "consumerPhone", "accountNo", "billAmount", "serviceCharge", "totalPaid", "referenceNo", "operatorName", "note", "createdAt"],
  WalletTxn: ["id", "provider", "type", "amount", "serviceCharge", "customerName", "customerPhone", "referenceNo", "operatorName", "note", "createdAt"],
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  try {
    // 1. List all tables in the database
    const tables = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name;"
    ) as any[];
    const existingTables = new Set(tables.map((t) => t.name));
    const missingTables = EXPECTED_TABLES.filter((t) => !existingTables.has(t));

    // 2. For each expected table, check its columns
    const tableReport: any[] = [];
    for (const tableName of EXPECTED_TABLES) {
      if (!existingTables.has(tableName)) {
        tableReport.push({
          table: tableName,
          exists: false,
          missingColumns: EXPECTED_COLUMNS[tableName] || [],
          existingColumns: [],
        });
        continue;
      }
      const cols = await db.$queryRawUnsafe(`PRAGMA table_info(${tableName});`) as any[];
      const existingCols = new Set(cols.map((c) => c.name));
      const expected = EXPECTED_COLUMNS[tableName] || [];
      const missing = expected.filter((c) => !existingCols.has(c));
      tableReport.push({
        table: tableName,
        exists: true,
        missingColumns: missing,
        existingColumns: Array.from(existingCols),
      });
    }

    // 3. Overall health
    const totalMissingColumns = tableReport.reduce((s, t) => s + t.missingColumns.length, 0);
    const healthy = missingTables.length === 0 && totalMissingColumns === 0;

    return NextResponse.json({
      healthy,
      summary: {
        totalTablesExpected: EXPECTED_TABLES.length,
        tablesPresent: existingTables.size,
        tablesMissing: missingTables.length,
        totalMissingColumns,
        databasePath: process.env.DATABASE_URL || "(not set)",
      },
      missingTables,
      tableReport,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[db-diagnose GET]", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to diagnose database",
        code: error.code,
      },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/db-diagnose
//
// Forces a re-run of ensureSchema (resets the schemaEnsured flag first).
// Use this after restoring a backup to make sure the DB is fully upgraded
// to the current schema before attempting any sales or other writes.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  try {
    // Reset the flag and force ensureSchema to re-run
    resetSchemaFlag();
    await ensureSchema();

    // Now re-check the schema to see if it's healthy
    const tables = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name;"
    ) as any[];
    const existingTables = new Set(tables.map((t) => t.name));
    const missingTables = EXPECTED_TABLES.filter((t) => !existingTables.has(t));

    let totalMissingColumns = 0;
    const stillMissing: any[] = [];
    for (const tableName of EXPECTED_TABLES) {
      if (!existingTables.has(tableName)) {
        stillMissing.push({ table: tableName, missing: EXPECTED_COLUMNS[tableName] || [] });
        continue;
      }
      const cols = await db.$queryRawUnsafe(`PRAGMA table_info(${tableName});`) as any[];
      const existingCols = new Set(cols.map((c) => c.name));
      const expected = EXPECTED_COLUMNS[tableName] || [];
      const missing = expected.filter((c) => !existingCols.has(c));
      if (missing.length > 0) {
        totalMissingColumns += missing.length;
        stillMissing.push({ table: tableName, missing });
      }
    }

    return NextResponse.json({
      success: true,
      message: "ensureSchema re-run completed",
      healthy: missingTables.length === 0 && totalMissingColumns === 0,
      missingTables,
      stillMissingColumns: stillMissing,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[db-diagnose POST]", error);
    return NextResponse.json(
      { error: error.message || "Failed to repair schema", code: error.code },
      { status: 500 }
    );
  }
}
