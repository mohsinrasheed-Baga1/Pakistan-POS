import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// Lookup product OR card by scanned barcode.
// Also checks packBarcode — if a scanned code matches a product's packBarcode,
// the response includes isPack=true so the POS can handle box sales correctly.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") || "";
  if (!code) return NextResponse.json({ error: "Barcode is required" }, { status: 400 });

  // Try product by its own barcode first
  const product = await db.product.findUnique({
    where: { barcode: code },
    include: { category: true },
  });
  if (product) {
    return NextResponse.json({ found: true, kind: "product", product, isPack: false });
  }

  // Try packBarcode — check if any product has this code as its box barcode
  const boxProduct = await db.product.findFirst({
    where: { packBarcode: code },
    include: { category: true },
  });
  if (boxProduct) {
    // Return the product with isPack=true so POS knows this is a box scan
    return NextResponse.json({ found: true, kind: "product", product: boxProduct, isPack: true });
  }

  // Try customer card
  const card = await db.customerCard.findUnique({
    where: { cardNumber: code },
  });
  if (card) {
    return NextResponse.json({ found: true, kind: "card", card });
  }

  return NextResponse.json({ found: false, kind: "none" });
}
