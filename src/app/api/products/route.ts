import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { generateInternalBarcode } from "@/lib/pos-utils";
import { generateProductCode, generateBarcodeValue } from "@/lib/product-code";
import { generateBarcode } from "@/lib/barcode-engine";

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
      { productCode: { contains: q } },
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
    // Auto-generate an internal product code (e.g. "RICE00120") for new products
    // This becomes both the human-readable product code AND the barcode value.
    const productCode = await generateProductCode(body.categoryId);
    barcode = generateBarcodeValue(productCode); // For CODE128, this equals productCode
    barcodeType = "CODE128";
  } else {
    // User scanned or typed a real manufacturer barcode.
    if (/^\d{13}$/.test(barcode)) {
      barcodeType = "EAN13";
    } else {
      barcodeType = "CODE128";
    }
  }

  // ensure unique
  const dup = await db.product.findUnique({ where: { barcode } });
  if (dup) {
    return NextResponse.json(
      { error: "This barcode already exists" },
      { status: 400 }
    );
  }

  // ─── Generate verified barcode SVG + PNG using bwip-js ──────────────
  // This pre-renders the barcode at product creation time so it doesn't
  // need to be regenerated on every print. The SVG is stored in the DB
  // and used directly for sticker printing.
  let barcodeSvg: string | null = null;
  let barcodePng: string | null = null;
  let barcodeVerified = false;
  let productCode: string | null = null;

  try {
    // For internal products (CODE128), the productCode is the barcode value
    if (barcodeType === "CODE128" && !body.barcode?.trim()) {
      productCode = barcode; // e.g. "RICE00120"
    } else if (body.productCode?.trim()) {
      productCode = body.productCode.trim();
    }

    const genResult = await generateBarcode({
      format: barcodeType as any,
      value: barcode,
      scale: 2,
      height: 10,
      includeText: true,
      verify: true,
    });

    if (genResult.success) {
      barcodeSvg = genResult.svg;
      barcodePng = genResult.pngBase64;
      barcodeVerified = genResult.verified;
    }
  } catch (e) {
    console.error("[products POST] barcode generation failed:", e);
    // Continue without pre-rendered barcode — StickerPrinter will generate on-demand
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
      // Industrial Barcode System
      productCode,
      barcodeSvg,
      barcodePng,
      barcodeVerified,
      stickerSize: body.stickerSize || "50x30",
      packingDate: body.packingDate ? new Date(body.packingDate) : null,
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
