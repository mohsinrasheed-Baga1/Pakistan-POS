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
//        - stock += boxCount  (boxes added to inventory)
//        - costPrice = purchasePrice (if provided)
//        - expiryDate = expiryDate (if provided)
//   4. Updates the linked PIECE product's COST PRICE ONLY:
//        - costPrice = purchasePrice / packQuantity
//        - expiryDate = same expiry date
//        - **stock is NOT touched** — pieces are auto-added on demand
//          (see v2.10.77 change below)
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
//   6. Logs box stock movement to StockLog (type "PURCHASE").
//
// ─────────────────────────────────────────────────────────────────────────────
// v2.10.77: FULLY AUTOMATIC BOX-OPEN CYCLE (per user spec)
// ─────────────────────────────────────────────────────────────────────────────
// PREVIOUSLY (v2.10.62 and earlier):
//   - Buying 10 boxes would ALSO auto-add 10 × packQty pieces to the
//     linked piece product's stock. So if you bought 10 boxes of 30
//     eggs each, you got: +10 boxes stock AND +300 pieces stock.
//   - Problem: Because pieces were pre-added, the auto-box-open logic
//     in /api/sales NEVER triggered — piece stock was always sufficient
//     (since it was pre-filled with all pieces from all boxes).
//   - User complaint: "میں نے نے 10 ٹرے انڈے ایڈ کر دیے — جب بھی ایک
//     پیس بیچوں گا تو پہلا ڈبہ اٹومیٹک کھلنا چاہیے — پہلے ڈبے کی پیس
//     جب بک جائیں گے تو اگلا ڈبہ کھل جائے گا" (I added 10 trays of
//     eggs — when I sell one piece, the first box should auto-open —
//     when pieces from the first box are sold, the next box should open)
//
// NOW (v2.10.77):
//   - Buying boxes ONLY increases BOX stock. Piece stock is NOT touched.
//   - When you sell a piece and piece stock is 0 (or insufficient):
//       → /api/sales auto-opens 1 box (decrements box stock by 1,
//         increments piece stock by packQuantity)
//   - This creates the user's desired "circular" cycle:
//       Add 10 boxes → 10 boxes, 0 pieces
//       Sell 1 piece → auto-open 1 box → 9 boxes, packQty pieces, sell 1
//       Continue selling until 0 pieces → next sale auto-opens next box
//       ... continues until 0 boxes, 0 pieces
//   - Selling a BOX (the box product itself) just decreases box stock
//     (existing behavior, unchanged)
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
  const totalPiecesAvailable = packQty * numBoxCount;  // informational only — NOT added to piece stock

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
    // 1. Update BOX product (increment box stock by numBoxCount)
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

    // 2. Find & update the linked PIECE product's PRICES ONLY (NO stock change)
    // v2.10.77: We intentionally do NOT increment piece stock here.
    // Piece stock is auto-refilled on demand when pieces are sold (see
    // /api/sales auto-box-open logic). The user wants a "circular" cycle:
    //   Buy 10 boxes → 10 boxes, 0 pieces
    //   Sell 1 piece → auto-open 1 box → 9 boxes, packQty pieces, sell 1
    //   Continue until 0 pieces → next sale auto-opens next box
    const pieceProduct = await tx.product.findUnique({
      where: { barcode: boxProduct.packBarcode! },
    });

    let updatedPiece: any = null;
    if (pieceProduct) {
      const pieceUpdate: any = {};
      // Update piece cost price (= box cost / packQty) if purchase price provided
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
      // Only update if there's at least one field to update (avoid empty update)
      if (Object.keys(pieceUpdate).length > 0) {
        updatedPiece = await tx.product.update({
          where: { id: pieceProduct.id },
          data: pieceUpdate,
        });
      } else {
        updatedPiece = pieceProduct;  // no changes needed, return as-is
      }

      // v2.10.77: Note in piece product's stock log that boxes were
      // purchased — but DON'T add pieces. The pieces will auto-come
      // from boxes when sold (see /api/sales auto-box-open).
      await tx.stockLog.create({
        data: {
          productId: pieceProduct.id,
          type: "ADJUSTMENT",
          quantity: 0,  // zero — pieces will be added on demand when sold
          note: `Box purchase: ${numBoxCount} boxes × ${packQty} pcs = ${totalPiecesAvailable} pieces available in boxes (auto-open on sale)${note ? ` — ${note}` : ""}`,
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
    boxesAdded: numBoxCount,
    totalPiecesAvailableInBoxes: totalPiecesAvailable,  // informational only
    piecesAddedToPieceStock: 0,  // v2.10.77: always 0 now — pieces auto-open on sale
    pricesRecalculated: shouldRecalc,
    oldBoxCost: boxProduct.costPrice,
    newBoxCost: numPurchasePrice,
    newBoxSalePrice: shouldRecalc ? newBoxSalePrice : null,
    newBoxWholesalePrice: shouldRecalc ? newBoxWholesalePrice : null,
    newBoxShopkeeperPrice: shouldRecalc ? newBoxShopkeeperPrice : null,
  });
}
