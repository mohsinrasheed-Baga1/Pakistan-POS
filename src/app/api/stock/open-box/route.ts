import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stock/open-box
//
// Manually break open one or more boxes — converts boxes into pieces.
// This is the REVERSE of buying boxes: instead of adding both box stock
// AND piece stock, we DECREMENT box stock and INCREMENT piece stock.
//
// Use case: The shopkeeper has 12 boxes of eggs (each box = 30 eggs) and
// 5 loose eggs in the tray. They want to "open" 1 box so they have
// 11 boxes + 35 loose eggs (5 + 30). This lets them sell loose eggs
// without running out mid-sale.
//
// Inputs:
//   - boxProductId: ID of the BOX product (must have packBarcode set)
//   - count: how many boxes to open (default 1)
//
// Updates:
//   1. BOX product: stock -= count
//   2. PIECE product (linked via boxProduct.packBarcode):
//        - stock += packQuantity × count
//        - costPrice, salePrice unchanged (cost was already paid when box was purchased)
//   3. Logs both movements to StockLog as type "ADJUSTMENT"
//
// Returns:
//   - success, boxesOpened, piecesAdded, newBoxStock, newPieceStock
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager or admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { boxProductId, count } = body;

  if (!boxProductId) {
    return NextResponse.json(
      { error: "Box product ID is required" },
      { status: 400 }
    );
  }

  const numCount = Math.max(1, Math.floor(Number(count) || 1));
  if (numCount <= 0 || isNaN(numCount)) {
    return NextResponse.json(
      { error: "Count must be a positive number" },
      { status: 400 }
    );
  }

  // 1. Find the BOX product by ID
  const boxProduct = await db.product.findUnique({
    where: { id: String(boxProductId).trim() },
  });

  if (!boxProduct) {
    return NextResponse.json(
      { error: "Box product not found" },
      { status: 404 }
    );
  }

  if (!boxProduct.packBarcode || boxProduct.packQuantity <= 0) {
    return NextResponse.json(
      { error: "This product is not a box product (no linked piece product). Only BOX products can be opened." },
      { status: 400 }
    );
  }

  if (boxProduct.stock < numCount) {
    return NextResponse.json(
      {
        error: `Insufficient box stock — only ${boxProduct.stock} boxes available, but you tried to open ${numCount}.`,
        availableBoxStock: boxProduct.stock,
      },
      { status: 400 }
    );
  }

  const packQty = boxProduct.packQuantity;
  const piecesToAdd = packQty * numCount;

  // 2. Find the linked PIECE product (by barcode = boxProduct.packBarcode)
  const pieceProduct = await db.product.findUnique({
    where: { barcode: boxProduct.packBarcode! },
  });

  if (!pieceProduct) {
    return NextResponse.json(
      {
        error: `Linked piece product not found. The box's packBarcode (${boxProduct.packBarcode}) does not match any product's barcode. Please edit the box product and re-link it to the piece product.`,
      },
      { status: 404 }
    );
  }

  // 3. Use a transaction to atomically: decrement box stock, increment piece stock
  const result = await db.$transaction(async (tx) => {
    // Decrement box stock
    const updatedBox = await tx.product.update({
      where: { id: boxProduct.id },
      data: { stock: { decrement: numCount } },
    });

    // Increment piece stock
    const updatedPiece = await tx.product.update({
      where: { id: pieceProduct.id },
      data: { stock: { increment: piecesToAdd } },
    });

    // Log box stock movement (negative — boxes removed)
    await tx.stockLog.create({
      data: {
        productId: boxProduct.id,
        type: "ADJUSTMENT",
        quantity: -numCount,
        note: `Box opened manually: ${numCount} box(es) broken into ${piecesToAdd} pieces (packQty=${packQty})`,
      },
    });

    // Log piece stock movement (positive — pieces added)
    await tx.stockLog.create({
      data: {
        productId: pieceProduct.id,
        type: "ADJUSTMENT",
        quantity: piecesToAdd,
        note: `Box opened: ${numCount} box(es) of "${boxProduct.name}" broken into ${piecesToAdd} pieces`,
      },
    });

    return { box: updatedBox, piece: updatedPiece };
  });

  return NextResponse.json({
    success: true,
    boxesOpened: numCount,
    piecesAdded: piecesToAdd,
    packQuantity: packQty,
    newBoxStock: result.box.stock,
    newPieceStock: result.piece.stock,
    boxProductName: boxProduct.name,
    pieceProductName: pieceProduct.name,
  });
}
