import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { generateProductCode, generateBarcodeValue } from "@/lib/product-code";

/**
 * POST /api/barcode/product-code
 * Body: { categoryId?: string }
 * Returns: { productCode: string, barcodeValue: string }
 *
 * Generates the next unique product code for a category, and the
 * corresponding barcode value (same as product code for CODE128).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") return NextResponse.json({ error: "Manager only" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const categoryId = body.categoryId || undefined;

    const productCode = await generateProductCode(categoryId);
    const barcodeValue = generateBarcodeValue(productCode);

    return NextResponse.json({ productCode, barcodeValue });
  } catch (e: any) {
    console.error("[barcode/product-code POST]", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
