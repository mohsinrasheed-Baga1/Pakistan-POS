import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaEnsured: boolean | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

// Idempotent schema creation/migration for SQLite. Critical for the Electron
// desktop app where a fresh DB may be created on first launch or an old DB
// upgraded from a previous app version.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'CASHIER',
  active BOOLEAN NOT NULL DEFAULT 1,
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
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
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
CREATE UNIQUE INDEX IF NOT EXISTS Product_packBarcode_key ON Product(packBarcode);

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
  userId TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS CardTransaction (
  id TEXT PRIMARY KEY NOT NULL,
  cardId TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  saleId TEXT,
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
`;

const COLUMN_ADDITIONS: Record<string, [string, string][]> = {
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
  ],
  Sale: [
    ["cardId", "TEXT"],
    ["saleType", "TEXT NOT NULL DEFAULT 'RETAIL'"],
    ["originalSaleId", "TEXT"],
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
};

export async function ensureSchema() {
  if (globalForPrisma.schemaEnsured) return;
  try {
    const statements = SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await db.$executeRawUnsafe(stmt + ";");
      } catch (e: any) {
        // "duplicate column" or "table already exists" errors are OK — skip
        if (e.message && (e.message.includes("duplicate") || e.message.includes("already exists"))) {
          continue;
        }
        throw e;
      }
    }
    for (const [table, cols] of Object.entries(COLUMN_ADDITIONS)) {
      for (const [col, def] of cols) {
        try {
          await db.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
        } catch (e: any) {
          // column already exists — expected, skip
          if (e.message && e.message.includes("duplicate")) continue;
          // other errors also skip (table might not exist yet)
        }
      }
    }
    globalForPrisma.schemaEnsured = true;
  } catch (e) {
    console.error("[ensureSchema] Failed:", e);
  }
}

if (!globalForPrisma.schemaEnsured && process.env.NODE_ENV === 'production') {
  ensureSchema().catch(() => {});
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
