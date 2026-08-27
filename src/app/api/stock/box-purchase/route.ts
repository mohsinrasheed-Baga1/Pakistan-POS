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
//   5. AUTO-RECALCULATE SALE PRICES by maintaining markup percentages.
//      When the cost price changes, the sale/wholesale/shopkeeper prices
//      are recalculated to maintain the same percentage markup as before:
//        newSalePrice = newCostPrice × (oldSalePrice / oldCostPrice)
//        newWholesalePrice = newCostPrice × (oldWholesale / oldCostPrice)
//        newShopkeeperPrice = newCostPrice × (oldShopkeeper / oldCostPrice)
//      This matches the user's spec: if they bought a box for Rs 50, set
//      sale = Rs 60, wholesale = Rs 58, shopkeeper = Rs 52, and now they
//      buy the same box for Rs 60, the prices auto-adjust to:
//        sale = Rs 72, wholesale = Rs 69.60, shopkeeper = Rs 62.40
//   6. Logs both stock movements to StockLog.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }
  const body = await req.json();
  const { barcode, boxCount, purchasePrice, expiryDate, note, recalcPrices } = body;

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

  // ─── Calculate new sale prices if cost changed and recalc is requested ───
  // We maintain the markup percentage: newPrice = newCost × (oldPrice / oldCost)
  const shouldRecalc = recalcPrices !== false && numPurchasePrice !== null &&
    boxProduct.costPrice > 0 && numPurchasePrice !== boxProduct.costPrice;

  let newBoxSalePrice = boxProduct.salePrice;
  let newBoxWholesalePrice = boxProduct.wholesalePrice;
  let newBoxShopkeeperPrice = boxProduct.shopkeeperPrice;
  let newPieceSalePrice: number | null = null;
  let newPieceWholesalePrice: number | null = null;
  let newPieceShopkeeperPrice: number | null = null;

  if (shouldRecalc) {
    const oldCost = boxProduct.costPrice;
    const ratio = numPurchasePrice / oldCost;
    newBoxSalePrice = Math.round(boxProduct.salePrice * ratio * 100) / 100;
    newBoxWholesalePrice = Math.round(boxProduct.wholesalePrice * ratio * 100) / 100;
    newBoxShopkeeperPrice = Math.round(boxProduct.shopkeeperPrice * ratio * 100) / 100;
    // Piece prices also recalc (per-piece = per-box ÷ packQty)
    if (packQty > 0) {
      newPieceSalePrice = Math.round((newBoxSalePrice / packQty) * 100) / 100;
      newPieceWholesalePrice = Math.round((newBoxWholesalePrice / packQty) * 100) / 100;
      newPieceShopkeeperPrice = Math.round((newBoxShopkeeperPrice / packQty) * 100) / 100;
    }
  }

  // Use a transaction so all updates succeed or fail together
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
    if (shouldRecalc) {
      boxUpdate.salePrice = newBoxSalePrice;
      boxUpdate.wholesalePrice = newBoxWholesalePrice;
      boxUpdate.shopkeeperPrice = newBoxShopkeeperPrice;
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
      if (shouldRecalc && newPieceSalePrice !== null) {
        pieceUpdate.salePrice = newPieceSalePrice;
        pieceUpdate.wholesalePrice = newPieceWholesalePrice;
        pieceUpdate.shopkeeperPrice = newPieceShopkeeperPrice;
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
        note: `Box purchase: ${numBoxCount} boxes${numPurchasePrice ? ` @ Rs ${numPurchasePrice}` : ""}${note ? ` — ${note}` : ""}${shouldRecalc ? ` (prices auto-recalculated)` : ""}`,
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
    pricesRecalculated: shouldRecalc,
    oldBoxCost: boxProduct.costPrice,
    newBoxCost: numPurchasePrice,
    newBoxSalePrice: shouldRecalc ? newBoxSalePrice : null,
    newBoxWholesalePrice: shouldRecalc ? newBoxWholesalePrice : null,
    newBoxShopkeeperPrice: shouldRecalc ? newBoxShopkeeperPrice : null,
  });
}
