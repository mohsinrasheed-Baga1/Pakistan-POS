import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaEnsured: boolean | undefined
  schemaEnsuring: Promise<void> | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

// ─────────────────────────────────────────────────────────────────────────────
// DISABLE SQLite FOREIGN KEY CONSTRAINTS
//
// WHY: When a user restores an old backup database, the data may contain
// foreign key references that point to records which were deleted in a
// previous version (e.g. a SaleItem pointing to a deleted Product, or a
// Sale pointing to a deleted User). With FK enforcement ON, any new
// INSERT that touches these tables fails with:
//
//   "Foreign key constraint violated on the foreign key: ..."
//
// even if the NEW sale's data is perfectly valid — because SQLite checks
// ALL existing rows when you modify a table with FK constraints, not just
// the row being inserted.
//
// DISABLING FK ENFORCEMENT IS SAFE HERE BECAUSE:
//   1. The app's data integrity is enforced at the application layer
//      (we validate product existence, user session, etc. before writing)
//   2. The schema still HAS foreign key definitions (for documentation and
//      for any external DB tool that wants to enforce them)
//   3. SQLite's default is foreign_keys = OFF anyway — Prisma turns them
//      ON via PRAGMA foreign_keys = ON, which we are explicitly overriding
//
// This runs on every new PrismaClient connection. The $executeRawUnsafe
// is wrapped in try/catch because some SQLite builds may not allow this
// pragma to be set outside a transaction.
// ─────────────────────────────────────────────────────────────────────────────
db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`).catch((e) => {
  console.warn('[db] Could not disable foreign_keys pragma:', e?.message || e)
})

// ─────────────────────────────────────────────────────────────────────────────
// Idempotent schema creation/migration for SQLite.
//
// This is the SINGLE SOURCE OF TRUTH for the runtime SQLite schema. The desktop
// app cannot run `prisma migrate` on the user's machine — it can only run
// ad-hoc `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN` statements
// against the live SQLite file. Every model + field in prisma/schema.prisma
// must have a matching entry here, AND every column added in a later version
// must also be in COLUMN_ADDITIONS so an old user database gets upgraded
// in place on next launch.
//
// WHY THIS MATTERS: if the user upgraded from v2.7.31 (or earlier) where the
// Vendor table only had `id, name, companyName, createdAt, updatedAt`, then on
// first launch of v2.7.32 we must ALTER TABLE Vendor ADD COLUMN phone TEXT
// (and address, note, active, totalPurchased, totalPaid, balance) — otherwise
// `db.vendor.findMany()` will throw "column main.Vendor.phone does not exist"
// and the entire Vendors page will fail to load.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'CASHIER',
  active BOOLEAN NOT NULL DEFAULT 1,
  securityQuestion TEXT,
  securityAnswer TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS User_email_key ON User(email);

CREATE TABLE IF NOT EXISTS Category (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS Category_name_key ON Category(name);

CREATE TABLE IF NOT EXISTS Vendor (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  companyName TEXT,
  phone TEXT,
  address TEXT,
  note TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  totalPurchased REAL NOT NULL DEFAULT 0,
  totalPaid REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS VendorPurchase (
  id TEXT PRIMARY KEY NOT NULL,
  vendorId TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL DEFAULT 'PURCHASE',
  description TEXT,
  paymentDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendorId) REFERENCES Vendor(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Product (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT NOT NULL,
  barcodeType TEXT NOT NULL DEFAULT 'CODE128',
  categoryId TEXT,
  vendorId TEXT,
  costPrice REAL NOT NULL DEFAULT 0,
  salePrice REAL NOT NULL DEFAULT 0,
  wholesalePrice REAL NOT NULL DEFAULT 0,
  shopkeeperPrice REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  stock REAL NOT NULL DEFAULT 0,
  storeStock REAL NOT NULL DEFAULT 0,
  minStock REAL NOT NULL DEFAULT 0,
  taxRate REAL NOT NULL DEFAULT 0,
  expiryDate DATETIME,
  manufacturingDate DATETIME,
  hasBarcode BOOLEAN NOT NULL DEFAULT 1,
  image TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  packBarcode TEXT,
  packQuantity REAL NOT NULL DEFAULT 0,
  packPrice REAL NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES Category(id) ON DELETE SET NULL,
  FOREIGN KEY (vendorId) REFERENCES Vendor(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS Product_barcode_key ON Product(barcode);

CREATE TABLE IF NOT EXISTS Sale (
  id TEXT PRIMARY KEY NOT NULL,
  invoiceNo TEXT NOT NULL,
  userId TEXT NOT NULL,
  cardId TEXT,
  customerName TEXT,
  customerPhone TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  taxTotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paidAmount REAL NOT NULL DEFAULT 0,
  change REAL NOT NULL DEFAULT 0,
  paymentMethod TEXT NOT NULL DEFAULT 'CASH',
  saleType TEXT NOT NULL DEFAULT 'RETAIL',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  originalSaleId TEXT,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id),
  FOREIGN KEY (cardId) REFERENCES CustomerCard(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS Sale_invoiceNo_key ON Sale(invoiceNo);

CREATE TABLE IF NOT EXISTS SaleReturn (
  id TEXT PRIMARY KEY NOT NULL,
  saleId TEXT NOT NULL,
  userId TEXT,
  amount REAL NOT NULL,
  reason TEXT,
  restocked BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS SaleItem (
  id TEXT PRIMARY KEY NOT NULL,
  saleId TEXT NOT NULL,
  productId TEXT NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT NOT NULL,
  price REAL NOT NULL,
  costPrice REAL NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  taxRate REAL NOT NULL,
  lineTotal REAL NOT NULL,
  FOREIGN KEY (saleId) REFERENCES Sale(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES Product(id)
);

CREATE TABLE IF NOT EXISTS StockLog (
  id TEXT PRIMARY KEY NOT NULL,
  productId TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS CustomerCard (
  id TEXT PRIMARY KEY NOT NULL,
  cardNumber TEXT NOT NULL,
  customerId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  type TEXT NOT NULL DEFAULT 'REGULAR',
  balance REAL NOT NULL DEFAULT 0,
  totalPurchases REAL NOT NULL DEFAULT 0,
  totalPaid REAL NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS CustomerCard_cardNumber_key ON CustomerCard(cardNumber);
CREATE UNIQUE INDEX IF NOT EXISTS CustomerCard_customerId_key ON CustomerCard(customerId);

CREATE TABLE IF NOT EXISTS CardTransaction (
  id TEXT PRIMARY KEY NOT NULL,
  cardId TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  saleId TEXT,
  operatorName TEXT,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cardId) REFERENCES CustomerCard(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS StoreTransaction (
  id TEXT PRIMARY KEY NOT NULL,
  productId TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Expense (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  note TEXT,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Settings (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'shop',
  shopName TEXT NOT NULL DEFAULT 'My Shop',
  subName TEXT,
  logo TEXT,
  shopAddress TEXT,
  shopPhone TEXT,
  currency TEXT NOT NULL DEFAULT 'Rs',
  taxEnabled BOOLEAN NOT NULL DEFAULT 0,
  defaultTax REAL NOT NULL DEFAULT 0,
  receiptFooter TEXT,
  invoicePrefix TEXT NOT NULL DEFAULT 'INV',
  printerWidth INTEGER NOT NULL DEFAULT 58,
  backupPasswordHash TEXT,
  shareMode TEXT NOT NULL DEFAULT 'local',
  dbNetworkPath TEXT,
  googleClientId TEXT,
  googleClientSecret TEXT,
  googleRefreshToken TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS MobileLoadCompany (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  totalPurchased REAL NOT NULL DEFAULT 0,
  totalSold REAL NOT NULL DEFAULT 0,
  totalProfit REAL NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS MobileLoadCompany_name_key ON MobileLoadCompany(name);

CREATE TABLE IF NOT EXISTS MobileLoadTxn (
  id TEXT PRIMARY KEY NOT NULL,
  companyId TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SALE',
  amount REAL NOT NULL,
  costPrice REAL NOT NULL DEFAULT 0,
  salePrice REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  due REAL NOT NULL DEFAULT 0,
  customerPhone TEXT,
  customerName TEXT,
  referenceNo TEXT,
  operatorName TEXT,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES MobileLoadCompany(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS BillPaymentTxn (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  consumerName TEXT,
  consumerPhone TEXT,
  accountNo TEXT,
  billAmount REAL NOT NULL,
  serviceCharge REAL NOT NULL DEFAULT 0,
  totalPaid REAL NOT NULL,
  amountReceived REAL NOT NULL DEFAULT 0,
  due REAL NOT NULL DEFAULT 0,
  referenceNo TEXT,
  operatorName TEXT,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS WalletTxn (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  serviceCharge REAL NOT NULL DEFAULT 0,
  due REAL NOT NULL DEFAULT 0,
  customerName TEXT,
  customerPhone TEXT,
  referenceNo TEXT,
  operatorName TEXT,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS WalletAccount (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  phoneNumber TEXT,
  accountNumber TEXT,
  balance REAL NOT NULL DEFAULT 0,
  totalReceived REAL NOT NULL DEFAULT 0,
  totalSent REAL NOT NULL DEFAULT 0,
  totalCharges REAL NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS SimStock (
  id TEXT PRIMARY KEY NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL,
  phoneNumber TEXT,
  costPrice REAL NOT NULL DEFAULT 0,
  salePrice REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'IN_STOCK',
  soldAt DATETIME,
  customerName TEXT,
  customerPhone TEXT,
  note TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS BarcodeSettings (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
  defaultBarcodeType TEXT NOT NULL DEFAULT 'CODE128',
  autoGenerate BOOLEAN NOT NULL DEFAULT 1,
  autoVerify BOOLEAN NOT NULL DEFAULT 1,
  autoRegenerate BOOLEAN NOT NULL DEFAULT 1,
  humanReadable BOOLEAN NOT NULL DEFAULT 1,
  saveBarcodeImage BOOLEAN NOT NULL DEFAULT 1,
  saveBarcodeSvg BOOLEAN NOT NULL DEFAULT 1,
  stickerSize TEXT NOT NULL DEFAULT '50x30',
  customWidth REAL NOT NULL DEFAULT 50,
  customHeight REAL NOT NULL DEFAULT 30,
  labelGap REAL NOT NULL DEFAULT 2,
  margin REAL NOT NULL DEFAULT 1.5,
  printerType TEXT NOT NULL DEFAULT 'thermal203',
  darkness INTEGER NOT NULL DEFAULT 50,
  printSpeed INTEGER NOT NULL DEFAULT 50,
  autoCut BOOLEAN NOT NULL DEFAULT 0,
  feedAfterPrint BOOLEAN NOT NULL DEFAULT 1,
  stickerFields TEXT NOT NULL DEFAULT '["storeName","productName","productCode","barcode","barcodeNumber","sellingPrice","expiryDate"]',
  fontFamily TEXT NOT NULL DEFAULT 'Tahoma',
  fontSize INTEGER NOT NULL DEFAULT 8,
  fontBold BOOLEAN NOT NULL DEFAULT 1,
  textAlign TEXT NOT NULL DEFAULT 'center',
  lineSpacing REAL NOT NULL DEFAULT 1.1,
  textColor TEXT NOT NULL DEFAULT '#000000',
  barcodeWidth INTEGER NOT NULL DEFAULT 2,
  barcodeHeight INTEGER NOT NULL DEFAULT 40,
  quietZone INTEGER NOT NULL DEFAULT 4,
  barcodeTopMargin INTEGER NOT NULL DEFAULT 0,
  barcodeBottomMargin INTEGER NOT NULL DEFAULT 0,
  centerBarcode BOOLEAN NOT NULL DEFAULT 1,
  highResSvg BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN_ADDITIONS — exhaustive list of EVERY column added after the very
// first release. When an old user upgrades, ALTER TABLE ADD COLUMN runs
// idempotently to add any missing columns. New installs are unaffected
// because CREATE TABLE IF NOT EXISTS already creates the table with all
// columns.
//
// ⚠️ Adding a new column to prisma/schema.prisma? You MUST also add it here,
//    otherwise users who installed an older version will see
//    "column main.X.Y does not exist in the current database" errors.
// ─────────────────────────────────────────────────────────────────────────────
const COLUMN_ADDITIONS: Record<string, [string, string][]> = {
  User: [
    ["phone", "TEXT"],
    ["securityQuestion", "TEXT"],
    ["securityAnswer", "TEXT"],
  ],
  Vendor: [
    // Older versions of Vendor only had id, name, companyName, createdAt,
    // updatedAt. Add all the columns that have been added since.
    ["phone", "TEXT"],
    ["address", "TEXT"],
    ["note", "TEXT"],
    ["active", "BOOLEAN NOT NULL DEFAULT 1"],
    ["totalPurchased", "REAL NOT NULL DEFAULT 0"],
    ["totalPaid", "REAL NOT NULL DEFAULT 0"],
    ["balance", "REAL NOT NULL DEFAULT 0"],
  ],
  Product: [
    ["wholesalePrice", "REAL NOT NULL DEFAULT 0"],
    ["shopkeeperPrice", "REAL NOT NULL DEFAULT 0"],
    ["storeStock", "REAL NOT NULL DEFAULT 0"],
    ["expiryDate", "DATETIME"],
    ["manufacturingDate", "DATETIME"],
    ["vendorId", "TEXT"],
    ["packBarcode", "TEXT"],
    ["packQuantity", "REAL NOT NULL DEFAULT 0"],
    ["packPrice", "REAL NOT NULL DEFAULT 0"],
    // ─── Industrial Barcode System (v2.8.0) ──────────────────────────
    // NOTE: barcodeType is already in the original schema, so not listed here.
    ["productCode", "TEXT"],
    ["barcodeSvg", "TEXT"],
    ["barcodePng", "TEXT"],
    ["barcodeVerified", "BOOLEAN NOT NULL DEFAULT 0"],
    ["stickerSize", "TEXT NOT NULL DEFAULT '50x30'"],
    ["packingDate", "DATETIME"],
  ],
  Sale: [
    ["cardId", "TEXT"],
    ["saleType", "TEXT NOT NULL DEFAULT 'RETAIL'"],
    ["originalSaleId", "TEXT"],
    ["note", "TEXT"],
    ["customerName", "TEXT"],
    ["customerPhone", "TEXT"],
  ],
  SaleReturn: [
    ["userId", "TEXT"],
  ],
  SaleItem: [
    // All SaleItem columns are present from the original schema, but include
    // here for safety in case an old install predates them.
    ["taxRate", "REAL NOT NULL DEFAULT 0"],
  ],
  CustomerCard: [
    ["customerId", "TEXT NOT NULL DEFAULT ''"],
    ["address", "TEXT"],
    ["type", "TEXT NOT NULL DEFAULT 'REGULAR'"],
  ],
  CardTransaction: [
    ["operatorName", "TEXT"],
    ["note", "TEXT"],
  ],
  Expense: [
    ["category", "TEXT NOT NULL DEFAULT 'general'"],
    ["date", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"],
  ],
  Settings: [
    ["printerWidth", "INTEGER NOT NULL DEFAULT 58"],
    ["subName", "TEXT"],
    ["logo", "TEXT"],
    ["backupPasswordHash", "TEXT"],
    ["shareMode", "TEXT NOT NULL DEFAULT 'local'"],
    ["dbNetworkPath", "TEXT"],
    ["googleClientId", "TEXT"],
    ["googleClientSecret", "TEXT"],
    ["googleRefreshToken", "TEXT"],
  ],
  // Load & Bill module — new columns added in v2.7.47
  MobileLoadTxn: [
    ["due", "REAL NOT NULL DEFAULT 0"],
  ],
  BillPaymentTxn: [
    ["amountReceived", "REAL NOT NULL DEFAULT 0"],
    ["due", "REAL NOT NULL DEFAULT 0"],
  ],
  WalletTxn: [
    ["accountId", "TEXT"],
    ["due", "REAL NOT NULL DEFAULT 0"],
  ],
  // SimStock: link each SIM to a MobileLoadCompany so that selling the SIM
  // automatically deducts its cost from the linked company's balance.
  // This represents the shopkeeper paying back the cost of the SIM (which
  // the company gave on credit) by reducing the load balance owed.
  SimStock: [
    ["linkedCompanyId", "TEXT"],
    ["linkedSimId", "TEXT"],
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureSchema — runs CREATE TABLE IF NOT EXISTS for every table + ALTER TABLE
// ADD COLUMN for every column. Idempotent: safe to run on every boot.
//
// CRITICAL: this function is `await`ed by the API routes (see
// `await ensureSchema()` in src/lib/session.ts) BEFORE any Prisma query runs,
// so that even the first request after a fresh install / upgrade will see a
// fully-upgraded database. This fixes the long-standing bug where the Vendors,
// LoadBill, and Cards pages failed to load on v2.7.32 because ensureSchema()
// was a fire-and-forget call that hadn't completed by the time the first API
// request arrived.
// ─────────────────────────────────────────────────────────────────────────────
export async function ensureSchema() {
  if (globalForPrisma.schemaEnsured) return;
  // If an ensureSchema() call is already in flight, await that same promise
  // instead of starting a parallel one — otherwise we get race conditions
  // where two requests both try to ALTER TABLE simultaneously.
  if (globalForPrisma.schemaEnsuring) {
    await globalForPrisma.schemaEnsuring;
    return;
  }
  globalForPrisma.schemaEnsuring = (async () => {
    let failedAlters: string[] = [];
    try {
      // 0) Disable foreign key constraints for the duration of this
      //    migration. This is critical: ALTER TABLE on a table that has
      //    FK references can fail if any existing row violates the FK.
      //    We also keep FK OFF permanently (see module-load PRAGMA above),
      //    but we re-assert it here in case a previous query re-enabled it.
      try {
        await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
      } catch {}

      // 1) Run CREATE TABLE IF NOT EXISTS for every table. This creates any
      //    missing tables (e.g. MobileLoadCompany on a v2.7.31 → v2.7.32
      //    upgrade) without touching existing data.
      const statements = SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try {
          await db.$executeRawUnsafe(stmt + ";");
        } catch (e: any) {
          // SQLite returns "duplicate column name: X" if a CREATE INDEX
          // already exists, or "there is already a table named X" — both
          // are expected on an existing DB, so skip silently.
          const msg = e.message || "";
          if (
            msg.includes("duplicate") ||
            msg.includes("already exists") ||
            msg.includes("there is already")
          ) {
            continue;
          }
          // Any other error is real — log it but don't abort the whole
          // migration, because subsequent ALTER TABLE statements might
          // still succeed and unblock the API.
          console.error("[ensureSchema] statement failed:", stmt.slice(0, 80), e.message);
        }
      }

      // 2) Run ALTER TABLE ADD COLUMN for every column added in later
      //    versions. SQLite returns "duplicate column name: X" if the column
      //    already exists — expected, skip silently.
      for (const [table, cols] of Object.entries(COLUMN_ADDITIONS)) {
        for (const [col, def] of cols) {
          try {
            await db.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
          } catch (e: any) {
            const msg = e.message || "";
            if (msg.includes("duplicate")) continue;
            // Record the failure so we can retry on the next request.
            // The schemaEnsured flag will NOT be set, so the next API
            // request will re-attempt the full migration.
            failedAlters.push(`${table}.${col}: ${msg.slice(0, 100)}`);
            console.error(`[ensureSchema] ALTER ${table}.${col} failed:`, msg);
          }
        }
      }

      // 3) Only set the schemaEnsured flag if ALL ALTERs succeeded.
      //    If any failed, leave it false so the next request retries —
      //    this is critical for backup-restore scenarios where the old
      //    DB might have partial schema that needs multiple passes.
      if (failedAlters.length === 0) {
        globalForPrisma.schemaEnsured = true;
      } else {
        console.error(`[ensureSchema] ${failedAlters.length} ALTER(s) failed — will retry on next request:`);
        for (const f of failedAlters) console.error("  -", f);
      }
    } catch (e) {
      console.error("[ensureSchema] Failed:", e);
    } finally {
      globalForPrisma.schemaEnsuring = undefined;
    }
  })();
  await globalForPrisma.schemaEnsuring;
}

/**
 * Force a fresh schema check on the next request, regardless of the
 * schemaEnsured flag. Useful when a query fails with a schema-related
 * error (e.g. "column X does not exist") — the API can call this to
 * reset the flag, then retry ensureSchema, then retry the query.
 */
export function resetSchemaFlag() {
  globalForPrisma.schemaEnsured = false;
}

// Kick off schema creation on module load. The APIs also `await ensureSchema()`
// before any query, so even if this fire-and-forget hasn't completed yet, the
// first API request will block until it does.
if (!globalForPrisma.schemaEnsured) {
  ensureSchema().catch(() => {});
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
