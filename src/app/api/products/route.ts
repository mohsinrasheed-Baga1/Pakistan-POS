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
      { packBarcode: { contains: q } },
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
    // auto-generate an internal EAN-13 barcode for loose items (sugar, ghee, etc.)
    barcode = generateInternalBarcode();
    barcodeType = "EAN13";
  } else {
    barcodeType = "COMPANY";
  }

  // ensure unique
  const dup = await db.product.findUnique({ where: { barcode } });
  if (dup) {
    return NextResponse.json(
      { error: "This barcode already exists" },
      { status: 400 }
    );
  }

  // Box/pack fields — optional. If packBarcode provided, ensure it's unique.
  const packBarcode = body.packBarcode?.trim() || null;
  const packQuantity = Number(body.packQuantity) || 0;
  const packPrice = Number(body.packPrice) || 0;
  const packWholesalePrice = Number(body.packWholesalePrice) || 0;
  const packShopkeeperPrice = Number(body.packShopkeeperPrice) || 0;
  if (packBarcode) {
    const dupPack = await db.product.findUnique({ where: { packBarcode } });
    if (dupPack) {
      return NextResponse.json(
        { error: "This box barcode already exists" },
        { status: 400 }
      );
    }
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
      packBarcode,
      packQuantity,
      packPrice,
      packWholesalePrice,
      packShopkeeperPrice,
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
