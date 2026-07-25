import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// Lookup product OR card by scanned barcode.
// A product can be matched by its piece barcode (Product.barcode) or by its
// box barcode (Product.packBarcode). When matched by packBarcode, we return
// isPack=true so the POS knows to sell a whole box (deduct packQuantity).
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") || "";
  if (!code) return NextResponse.json({ error: "Barcode is required" }, { status: 400 });

  // 1) Try matching by piece barcode (primary)
  const byPiece = await db.product.findUnique({
    where: { barcode: code },
    include: { category: true },
  });
  if (byPiece) {
    return NextResponse.json({ found: true, kind: "product", product: byPiece, isPack: false });
  }

  // 2) Try matching by box/pack barcode
  const byPack = await db.product.findUnique({
    where: { packBarcode: code },
    include: { category: true },
  });
  if (byPack && byPack.packQuantity > 0) {
    return NextResponse.json({ found: true, kind: "product", product: byPack, isPack: true });
  }

  // 3) Try customer card
  const card = await db.customerCard.findUnique({
    where: { cardNumber: code },
  });
  if (card) {
    return NextResponse.json({ found: true, kind: "card", card });
  }

  return NextResponse.json({ found: false, kind: "none" });
}
