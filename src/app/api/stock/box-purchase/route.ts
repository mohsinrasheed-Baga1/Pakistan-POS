import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stock/box-purchase
//
// Purchase stock by scanning a BOX barcode. This endpoint:
//   1. Looks up the BOX product by barcode.
//   2. Reads `boxCount` (how many boxes purchased) + `purchasePrice` (per-box
//      cost price) + optional `expiryDate` from the request body.
//   3. Updates the BOX product:
//        - stock += boxCount
//        - costPrice = purchasePrice (if provided)
//        - expiryDate = expiryDate (if provided)
//   4. Also updates the linked PIECE product:
//        - stock += packQuantity × boxCount  (auto-divide pieces)
//        - costPrice = purchasePrice / packQuantity
//        - expiryDate = same expiry date
//   5. Logs both stock movements to StockLog.
//
// This is the workflow the user described:
//   "Main Store پر barcode scan ہوتے ہی اگر باکس کا barcode سکین ہوا تو
//    پوچھے کتنے باکس ہیں اور پر باکس کتنے کا لگا ہے (purchase price)،
//    ساتھ expiry date بھی پوچھے۔ پھر باکس کے لحاظ سے اگر 10 باکس ایڈ کریں
//    تو خود پیس کے اندر divide کر دے۔"
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }
  const body = await req.json();
  const { barcode, boxCount, purchasePrice, expiryDate, note } = body;

  if (!barcode || !boxCount || Number(boxCount) <= 0) {
    return NextResponse.json(
      { error: "Barcode and box count are required" },
      { status: 400 }
    );
  }

  // Find the BOX product (a product whose `packBarcode` is set, meaning it
  // represents a box and links to a separate piece product).
  const boxProduct = await db.product.findUnique({
    where: { barcode: String(barcode).trim() },
  });

  if (!boxProduct) {
    return NextResponse.json(
      { error: "No product found with this barcode. Make sure you scanned a BOX product." },
      { status: 404 }
    );
  }

  if (!boxProduct.packBarcode || boxProduct.packQuantity <= 0) {
    return NextResponse.json(
      { error: "This product is not a box product (no linked piece product). Use the regular stock add for piece products." },
      { status: 400 }
    );
  }

  const numBoxCount = Number(boxCount);
  const numPurchasePrice = purchasePrice ? Number(purchasePrice) : null;
  const parsedExpiry = expiryDate ? new Date(expiryDate) : null;
  const packQty = boxProduct.packQuantity;
  const totalPiecesAdded = packQty * numBoxCount;

  // Use a transaction so both updates succeed or fail together
  const result = await db.$transaction(async (tx) => {
    // 1. Update BOX product
    const boxUpdate: any = {
      stock: { increment: numBoxCount },
    };
    if (numPurchasePrice !== null && !isNaN(numPurchasePrice)) {
      boxUpdate.costPrice = numPurchasePrice;
    }
    if (parsedExpiry) {
      boxUpdate.expiryDate = parsedExpiry;
    }
    const updatedBox = await tx.product.update({
      where: { id: boxProduct.id },
      data: boxUpdate,
    });

    // 2. Find & update the linked PIECE product
    const pieceProduct = await tx.product.findUnique({
      where: { barcode: boxProduct.packBarcode! },
    });

    let updatedPiece: any = null;
    if (pieceProduct) {
      const pieceUpdate: any = {
        stock: { increment: totalPiecesAdded },
      };
      if (numPurchasePrice !== null && !isNaN(numPurchasePrice) && packQty > 0) {
        pieceUpdate.costPrice = numPurchasePrice / packQty;
      }
      if (parsedExpiry) {
        pieceUpdate.expiryDate = parsedExpiry;
      }
      updatedPiece = await tx.product.update({
        where: { id: pieceProduct.id },
        data: pieceUpdate,
      });

      await tx.stockLog.create({
        data: {
          productId: pieceProduct.id,
          type: "PURCHASE",
          quantity: totalPiecesAdded,
          note: `Box purchase: ${numBoxCount} box × ${packQty} pcs = ${totalPiecesAdded} pcs${note ? ` — ${note}` : ""}`,
        },
      });
    }

    // 3. Log box stock movement
    await tx.stockLog.create({
      data: {
        productId: boxProduct.id,
        type: "PURCHASE",
        quantity: numBoxCount,
        note: `Box purchase: ${numBoxCount} boxes${numPurchasePrice ? ` @ Rs ${numPurchasePrice}` : ""}${note ? ` — ${note}` : ""}`,
      },
    });

    return { box: updatedBox, piece: updatedPiece };
  });

  return NextResponse.json({
    success: true,
    boxProduct: result.box,
    pieceProduct: result.piece,
    piecesAdded: totalPiecesAdded,
    boxesAdded: numBoxCount,
  });
}
