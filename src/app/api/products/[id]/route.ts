import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prevStock = existing.stock;
  const newStock = Number(body.stock) || existing.stock;
  const stockDiff = newStock - prevStock;

  // Handle pack/box fields
  const packBarcode = body.packBarcode !== undefined ? (body.packBarcode?.trim() || null) : existing.packBarcode;
  const packQuantity = body.packQuantity !== undefined ? Number(body.packQuantity) || 0 : existing.packQuantity;
  const packPrice = body.packPrice !== undefined ? Number(body.packPrice) || 0 : existing.packPrice;
  // Check packBarcode uniqueness if changing
  if (packBarcode && packBarcode !== existing.packBarcode) {
    const dupPack = await db.product.findUnique({ where: { packBarcode } });
    if (dupPack && dupPack.id !== id) {
      return NextResponse.json(
        { error: "This box barcode already exists" },
        { status: 400 }
      );
    }
  }

  const product = await db.product.update({
    where: { id },
    data: {
      name: body.name,
      categoryId: body.categoryId || null,
      vendorId: body.vendorId || null,
      costPrice: Number(body.costPrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      wholesalePrice: Number(body.wholesalePrice) || 0,
      shopkeeperPrice: body.shopkeeperPrice !== undefined ? Number(body.shopkeeperPrice) : existing.shopkeeperPrice,
      unit: body.unit || "piece",
      stock: newStock,
      storeStock: body.storeStock !== undefined && body.storeStock !== "" ? Number(body.storeStock) : existing.storeStock,
      minStock: Number(body.minStock) || 0,
      taxRate: Number(body.taxRate) || 0,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      manufacturingDate: body.manufacturingDate ? new Date(body.manufacturingDate) : null,
      hasBarcode: body.hasBarcode !== false,
      image: body.image || null,
      active: body.active !== false,
      packBarcode,
      packQuantity,
      packPrice,
    },
    include: { category: true, vendor: true },
  });

  if (stockDiff !== 0) {
    await db.stockLog.create({
      data: {
        productId: product.id,
        type: "ADJUSTMENT",
        quantity: stockDiff,
        note: body.stockNote || "Stock adjustment",
      },
    });
  }

  return NextResponse.json({ product });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Admin or manager only" }, { status: 403 });
  }
  const { id } = await params;
  try {
    // Delete related records first to avoid foreign key constraint errors
    await db.stockLog.deleteMany({ where: { productId: id } });
    await db.storeTransaction.deleteMany({ where: { productId: id } });
    // Delete SaleItems that reference this product (set productId null is not possible since required field, so delete them)
    await db.saleItem.deleteMany({ where: { productId: id } });
    // Now delete the product
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // If product not found, return ok
    if (e.code === "P2025") {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: e.message || "Failed to delete product" },
      { status: 500 }
    );
  }
}
