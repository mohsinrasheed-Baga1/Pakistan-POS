import { db, ensureSchema } from "@/lib/db";
import bcrypt from "bcryptjs";

let seeded = false;

export async function seedIfNeeded() {
  if (seeded) return;
  try {
    // Always ensure schema exists first
    await ensureSchema();
    const settings = await db.settings.findUnique({ where: { id: "shop" } });
    if (!settings) {
      await db.settings.create({
        data: {
          id: "shop",
          shopName: "My Shop",
          subName: "Master Abdul Rasheed & Sons",
          currency: "Rs",
          receiptFooter: "Thank you! Please come again.",
          invoicePrefix: "INV",
          printerWidth: 58,
        },
      });
    }
    const admin = await db.user.findUnique({ where: { email: "admin@pos.local" } });
    if (!admin) {
      const hash = await bcrypt.hash("admin123", 10);
      await db.user.create({
        data: {
          email: "admin@pos.local",
          name: "Admin",
          password: hash,
          role: "ADMIN",
          active: true,
          securityQuestion: "What is your shop name?",
          securityAnswer: "My Shop",
        },
      });
    }
    const cashier = await db.user.findUnique({ where: { email: "cashier@pos.local" } });
    if (!cashier) {
      const hash = await bcrypt.hash("cashier123", 10);
      await db.user.create({
        data: {
          email: "cashier@pos.local",
          name: "Cashier",
          password: hash,
          role: "CASHIER",
          active: true,
        },
      });
    }
    const cats = ["Groceries", "Beverages", "Household", "Cleaning", "Other"];
    for (const name of cats) {
      const exists = await db.category.findUnique({ where: { name } });
      if (!exists) await db.category.create({ data: { name } });
    }

    // seed common grocery items if no products exist
    const productCount = await db.product.count();
    if (productCount === 0) {
      const groceries = await db.category.findUnique({ where: { name: "Groceries" } });
      const cleaning = await db.category.findUnique({ where: { name: "Cleaning" } });
      const household = await db.category.findUnique({ where: { name: "Household" } });
      const beverages = await db.category.findUnique({ where: { name: "Beverages" } });
      const items = [
        { name: "Sugar 1kg", barcode: "2000000000017", cat: groceries?.id, cost: 130, sale: 145, wholesale: 138 },
        { name: "Tea 950g", barcode: "2000000000024", cat: groceries?.id, cost: 1200, sale: 1300, wholesale: 1250 },
        { name: "Basmati Rice 1kg", barcode: "2000000000031", cat: groceries?.id, cost: 280, sale: 320, wholesale: 300 },
        { name: "Cooking Oil 1L", barcode: "2000000000048", cat: groceries?.id, cost: 380, sale: 420, wholesale: 400 },
        { name: "Ghee 1kg", barcode: "2000000000055", cat: groceries?.id, cost: 420, sale: 460, wholesale: 440 },
        { name: "Wheat Flour 1kg", barcode: "2000000000062", cat: groceries?.id, cost: 80, sale: 95, wholesale: 88 },
        { name: "Salt 800g", barcode: "2000000000079", cat: groceries?.id, cost: 60, sale: 75, wholesale: 68 },
        { name: "Soap Bar", barcode: "2000000000086", cat: cleaning?.id, cost: 90, sale: 110, wholesale: 100 },
        { name: "Shampoo 200ml", barcode: "2000000000093", cat: cleaning?.id, cost: 280, sale: 340, wholesale: 310 },
        { name: "Toothpaste 100g", barcode: "2000000000109", cat: cleaning?.id, cost: 160, sale: 195, wholesale: 180 },
        { name: "Biscuits Family Pack", barcode: "2000000000116", cat: groceries?.id, cost: 100, sale: 130, wholesale: 115 },
        { name: "Dish Soap 500ml", barcode: "2000000000123", cat: cleaning?.id, cost: 180, sale: 220, wholesale: 200 },
        { name: "Cola 1.5L", barcode: "2000000000130", cat: beverages?.id, cost: 180, sale: 220, wholesale: 200 },
        { name: "Mineral Water 1.5L", barcode: "2000000000147", cat: beverages?.id, cost: 70, sale: 90, wholesale: 80 },
        { name: "Milk 1L", barcode: "2000000000154", cat: groceries?.id, cost: 180, sale: 210, wholesale: 195 },
        { name: "Detergent 1kg", barcode: "2000000000161", cat: cleaning?.id, cost: 380, sale: 440, wholesale: 410 },
      ];
      for (const it of items) {
        await db.product.create({
          data: {
            name: it.name,
            barcode: it.barcode,
            barcodeType: "EAN13",
            categoryId: it.cat || null,
            costPrice: it.cost,
            salePrice: it.sale,
            wholesalePrice: it.wholesale,
            unit: "piece",
            stock: 10,
            storeStock: 50,
            minStock: 5,
            hasBarcode: true,
          },
        });
      }
    }
    seeded = true;
  } catch (e) {
    // ignore seeding errors
  }
}
