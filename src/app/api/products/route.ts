import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { generateInternalBarcode } from "@/lib/pos-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const barcode = searchParams.get("barcode") || "";
  const lowStock = searchParams.get("lowStock") === "true";

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { barcode: { contains: q } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (barcode) where.barcode = barcode;
  if (lowStock) {
    where.stock = { lte: db.product.fields.minStock };
  }

  const products = await db.product.findMany({
    where,
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  // Determine barcode
  let barcode = body.barcode?.trim();
  let barcodeType = body.barcodeType || "CODE128";
  const hasBarcode = body.hasBarcode !== false;

  if (!barcode || barcode === "") {
    // auto-generate an internal Code-128 barcode for loose items (sugar, ghee, etc.)
    // Code-128 is the most universally scannable format — works with virtually
    // every USB / Bluetooth / built-in scanner. EAN-13 was used previously but
    // many low-cost Pakistani scanners fail to read EAN-13 reliably.
    barcode = generateInternalBarcode();
    barcodeType = "CODE128";
  } else {
    // User scanned or typed a real manufacturer barcode — mark as COMPANY so
    // the UI knows to render it as-is (Code-128 can encode it losslessly).
    barcodeType = "CODE128";
  }

  // ensure unique
  const dup = await db.product.findUnique({ where: { barcode } });
  if (dup) {
    return NextResponse.json(
      { error: "This barcode already exists" },
      { status: 400 }
    );
  }

  const product = await db.product.create({
    data: {
      name: body.name,
      barcode,
      barcodeType,
      categoryId: body.categoryId || null,
      vendorId: body.vendorId || null,
      costPrice: Number(body.costPrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      wholesalePrice: Number(body.wholesalePrice) || 0,
      shopkeeperPrice: Number(body.shopkeeperPrice) || 0,
      unit: body.unit || "piece",
      stock: Number(body.stock) || 0,
      storeStock: Number(body.storeStock) || 0,
      minStock: Number(body.minStock) || 0,
      taxRate: Number(body.taxRate) || 0,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      manufacturingDate: body.manufacturingDate ? new Date(body.manufacturingDate) : null,
      hasBarcode,
      image: body.image || null,
      active: body.active !== false,
      packBarcode: body.packBarcode || null,
      packQuantity: Number(body.packQuantity) || 0,
      packPrice: Number(body.packPrice) || 0,
    },
    include: { category: true, vendor: true },
  });

  // stock log for initial stock
  if (product.stock > 0) {
    await db.stockLog.create({
      data: {
        productId: product.id,
        type: "PURCHASE",
        quantity: product.stock,
        note: "Initial stock",
      },
    });
  }

  return NextResponse.json({ product });
}
