import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema, resetSchemaFlag } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { generateInvoiceNo, todayRange } from "@/lib/pos-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const today = searchParams.get("today") === "true";
  const date = searchParams.get("date"); // YYYY-MM-DD format for custom date filter
  const limit = Number(searchParams.get("limit") || 50);

  const where: any = {};
  if (date) {
    // Custom date filter — sales on the selected date
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59");
    where.createdAt = { gte: start, lte: end };
  } else if (today) {
    const { start, end } = todayRange();
    where.createdAt = { gte: start, lte: end };
  }

  // Fetch sales WITHOUT `include: { user }` to avoid the
  // "Field user is required to return data, got null instead" error when
  // a restored backup DB has Sale rows pointing to deleted User records.
  // We fetch user names separately and attach them manually.
  const sales = await db.sale.findMany({
    where,
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Collect all unique userIds and fetch their names in one query
  const userIds = [...new Set(sales.map((s: any) => s.userId).filter(Boolean))];
  const users: any[] = userIds.length > 0
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name || "Unknown"]));

  // Attach user name to each sale
  const salesWithUser = sales.map((s: any) => ({
    ...s,
    user: { name: userMap.get(s.userId) || "Unknown" },
  }));

  return NextResponse.json({ sales: salesWithUser });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const items: any[] = body.items || [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  try {
    return await processSale(user.id, body, items);
  } catch (e: any) {
    // ─── AUTO-RETRY LOGIC ────────────────────────────────────────────────
    // If the sale failed with a schema-related error OR a foreign key
    // constraint violation, we retry after:
    //   1. Resetting the schemaEnsured flag
    //   2. Re-running ensureSchema (which now also re-asserts FK OFF)
    //   3. Explicitly disabling FK constraints again
    //   4. Retrying the sale ONCE
    //
    // This handles the common backup-restore scenarios:
    //   - Old DB missing columns → "no such column" error
    //   - Old DB with inconsistent FK references → "Foreign key constraint
    //     violated" error (e.g. SaleItem pointing to deleted Product)
    const msg = (e.message || "").toLowerCase();
    const isSchemaError =
      msg.includes("does not exist") ||
      msg.includes("no such column") ||
      msg.includes("no such table") ||
      msg.includes("sqlite_error") ||
      msg.includes("foreign key constraint") ||  // ← FK violation
      msg.includes("constraint failed") ||
      e.code === "P2021" || // table missing
      e.code === "P2022" || // column missing
      e.code === "P2003";   // foreign key constraint violation

    if (isSchemaError) {
      console.error("[sales POST] Schema/FK error detected, retrying after ensureSchema + FK disable:", e.message);
      try {
        resetSchemaFlag();
        await ensureSchema();
        // Explicitly disable FK constraints for this connection before retry
        try {
          await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
        } catch {}
        return await processSale(user.id, body, items);
      } catch (e2: any) {
        console.error("[sales POST] Retry also failed:", e2.message, e2.code, e2.meta);
        return NextResponse.json(
          {
            error: `Database error after retry: ${e2.message || "Unknown"}`,
            code: e2.code,
            detail: "Please restart the app. If the problem persists, the backup database may have inconsistent foreign key references — try restoring a newer backup or run DB Diagnose from Settings.",
          },
          { status: 500 }
        );
      }
    }

    // Non-schema error — return the actual error so the user can see what
    // went wrong (previously this became a generic "network error" on the
    // frontend because the response had no parseable body).
    console.error("[sales POST] Error:", e.message, e.code, e.meta);
    return NextResponse.json(
      {
        error: e.message || "Failed to complete sale",
        code: e.code,
        meta: e.meta,
      },
      { status: 500 }
    );
  }
}

/**
 * The actual sale-processing logic, extracted into a separate function so
 * the POST handler can wrap it in try/catch and retry on schema errors.
 */
async function processSale(userId: string, body: any, items: any[]) {
  // ─── Ensure the user record exists ──────────────────────────────────────
  // When restoring an old backup DB, the User table may be empty or the
  // logged-in user's row may have been deleted. Prisma's `include: { user }`
  // then fails with "Field user is required to return data, got null instead"
  // because the Sale row references a userId that doesn't exist in User.
  //
  // We do two things:
  //   1. Verify the user exists. If not, create a stub user record so the
  //      FK reference is valid.
  //   2. Don't use `include: { user }` in the sale.create — fetch the user
  //      name separately afterwards, with a fallback to "Unknown" if the
  //      user row is missing.
  let userName = "Unknown";
  try {
    const existingUser = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (existingUser) {
      userName = existingUser.name || "Unknown";
    } else {
      // User row missing — create a stub so the Sale FK is valid.
      // This preserves the sale even if the user record was lost.
      console.warn(`[sales] User ${userId} not found in DB — creating stub`);
      try {
        await db.user.create({
          data: {
            id: userId,
            email: `restored-${userId.substring(0, 8)}@pos.local`,
            name: "Restored User",
            password: "restored",
            role: "CASHIER",
            active: true,
          },
        });
        userName = "Restored User";
      } catch (createErr: any) {
        // If we can't create the user (e.g. id conflict), the sale will
        // still go through but with userName = "Unknown". The FK violation
        // is already handled by PRAGMA foreign_keys = OFF.
        console.warn(`[sales] Could not create stub user:`, createErr.message);
      }
    }
  } catch (e: any) {
    console.warn(`[sales] Could not verify user ${userId}:`, e.message);
  }

  // count today's sales to build invoice number
  const { start, end } = todayRange();
  const todayCount = await db.sale.count({
    where: { createdAt: { gte: start, lte: end } },
  });
  const prefix = body.invoicePrefix || "INV";
  const invoiceNo = generateInvoiceNo(prefix, todayCount);

  // validate stock & build items
  let subtotal = 0;
  let taxTotal = 0;
  const saleItemsData: any[] = [];

  // v2.10.18: Merge duplicate items (same productId) before processing
  // This prevents receipt from showing the same product multiple times
  const mergedItems: { productId: string; quantity: number; price: number }[] = [];
  for (const it of items) {
    const existing = mergedItems.find((m) => m.productId === it.productId);
    if (existing) {
      existing.quantity += Number(it.quantity);
    } else {
      mergedItems.push({
        productId: it.productId,
        quantity: Number(it.quantity),
        price: Number(it.price),
      });
    }
  }

  for (const it of mergedItems) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
    const qty = it.quantity;
    if (qty <= 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    const price = Number(it.price ?? product.salePrice);
    const lineTotal = price * qty;
    subtotal += lineTotal;
    taxTotal += lineTotal * (product.taxRate / 100);

    saleItemsData.push({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      price,
      costPrice: product.costPrice,
      quantity: qty,
      unit: product.unit,
      taxRate: product.taxRate,
      lineTotal,
    });
  }

  const discount = Number(body.discount) || 0;
  const total = Math.max(0, subtotal + taxTotal - discount);

  // v2.10.15: Properly handle paidAmount, change, and balanceDue
  // - If paidAmount >= total: change = paidAmount - total, balanceDue = 0
  // - If paidAmount < total: change = 0, balanceDue = total - paidAmount
  //   (customer still owes money — recorded as due)
  // - If paidAmount not provided: paidAmount = total (exact payment, no change)
  const rawPaidAmount = Number(body.paidAmount);
  const paidAmount = isNaN(rawPaidAmount) ? total : rawPaidAmount;
  const change = paidAmount >= total ? paidAmount - total : 0;
  const balanceDue = paidAmount < total ? total - paidAmount : 0;

  // Create the sale WITHOUT `include: { user }` to avoid the
  // "Field user is required to return data, got null instead" error when
  // the user row is missing from a restored backup DB.
  // We fetch items separately and construct the user field manually.
  const sale = await db.sale.create({
    data: {
      invoiceNo,
      userId,
      customerName: body.customerName || null,
      customerPhone: body.customerPhone || null,
      subtotal,
      taxTotal,
      discount,
      total,
      paidAmount,
      change,
      balanceDue,
      paymentMethod: body.paymentMethod || "CASH",
      status: "COMPLETED",
      note: body.note || null,
      items: { create: saleItemsData },
    },
    include: { items: true, card: true },
  });

  // Attach the user name manually (no Prisma relation lookup)
  const saleWithUser = {
    ...sale,
    user: { name: userName },
  };

  // deduct stock + log
  // ────────────────────────────────────────────────────────────────────────
  // Stock model:
  //   - BOX product (has packBarcode set): stock counted in BOXES
  //   - PIECE product (no packBarcode): stock counted in PIECES
  //
  // When selling a BOX:
  //   - Decrement BOX product stock by qty (boxes sold)
  //   - Decrement linked PIECE product stock by packQuantity × qty
  //
  // When selling a PIECE:
  //   - Decrement PIECE product stock by qty
  //   - If piece stock falls below packQuantity AND a linked box exists,
  //     auto-open 1 box (decrement box stock by 1, increment piece stock
  //     by packQuantity) so the next sale won't run out.
  //
  // Example (user's spec):
  //   9 boxes × 80 pcs = 720 total pieces
  //   Sell 1 box → box stock 9→8, piece stock 720→640
  //   Sell 1 piece → piece stock 640→639
  // ────────────────────────────────────────────────────────────────────────
  for (const it of saleItemsData) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) continue;

    const isBoxSale = !!product.packBarcode && product.packQuantity > 0;

    if (isBoxSale) {
      // ─── BOX SALE ─────────────────────────────────────────────────────────
      // 1. Decrement BOX product stock by number of boxes sold
      const boxQty = it.quantity;
      await db.product.update({
        where: { id: product.id },
        data: { stock: { decrement: boxQty } },
      });
      await db.stockLog.create({
        data: {
          productId: product.id,
          type: "SALE",
          quantity: -boxQty,
          note: `Box sale ${invoiceNo} (${boxQty} box × ${product.packQuantity} pcs = ${boxQty * product.packQuantity} pcs)`,
        },
      });

      // 2. Find the linked PIECE product by its barcode (= packBarcode)
      //    and decrement its stock by packQuantity × boxQty
      const pieceProduct = await db.product.findUnique({
        where: { barcode: product.packBarcode! },
      });
      if (pieceProduct) {
        const pieceDeduction = product.packQuantity * boxQty;
        await db.product.update({
          where: { id: pieceProduct.id },
          data: { stock: { decrement: pieceDeduction } },
        });
        await db.stockLog.create({
          data: {
            productId: pieceProduct.id,
            type: "SALE",
            quantity: -pieceDeduction,
            note: `Box sale ${invoiceNo} (sold as ${boxQty} box × ${product.packQuantity} pcs)`,
          },
        });
      }
    } else {
      // ─── PIECE SALE (regular) ─────────────────────────────────────────────
      // v2.10.25: Loose products (MAIN_STORE) should ONLY deduct from Main Store
      // Regular SHOP products deduct from shop stock as normal
      const isMainStoreProduct = product.inventorySource === "MAIN_STORE";

      if (!isMainStoreProduct) {
        // Regular shop product — deduct from shop stock
        const stockDeduction = it.quantity;
        await db.product.update({
          where: { id: it.productId },
          data: { stock: { decrement: stockDeduction } },
        });
        await db.stockLog.create({
          data: {
            productId: it.productId,
            type: "SALE",
            quantity: -stockDeduction,
            note: `Sale ${invoiceNo}`,
          },
        });

        // ─── AUTO-REFILL ──────────────────────────────────────────────────────
        const boxProduct = await db.product.findFirst({
          where: { packBarcode: product.barcode },
        });
        if (boxProduct && boxProduct.stock > 0) {
          const refreshedPiece = await db.product.findUnique({
            where: { id: product.id },
          });
          const pieceStockAfter = refreshedPiece?.stock ?? 0;
          const packQty = boxProduct.packQuantity || 1;
          if (pieceStockAfter < packQty) {
            // Open the box
            await db.product.update({
              where: { id: boxProduct.id },
              data: { stock: { decrement: 1 } },
            });
            await db.product.update({
              where: { id: product.id },
              data: { stock: { increment: packQty } },
            });
            await db.stockLog.create({
              data: {
                productId: boxProduct.id,
                type: "ADJUSTMENT",
                quantity: -1,
                note: `Auto-opened 1 box for ${product.name} after sale ${invoiceNo}`,
              },
            });
            await db.stockLog.create({
              data: {
                productId: product.id,
                type: "ADJUSTMENT",
                quantity: packQty,
                note: `Auto-refill from box after sale ${invoiceNo} (+${packQty} pcs)`,
              },
            });
          }
        }
      }
      // Note: For MAIN_STORE products, we do NOT deduct from shop stock.
      // The deduction happens only from Main Store (storeStock) below.
      // If this product is a loose product linked to a Main Store product,
      // deduct the sold quantity from the Main Store product's storeStock
      // instead of (or in addition to) the shop stock.
      if (product.inventorySource === "MAIN_STORE") {
        // Try to find the linked store product — by ID first, then by name
        let storeProduct = product.linkedStoreProductId
          ? await db.product.findUnique({ where: { id: product.linkedStoreProductId } })
          : null;

        // Auto-link by name if not linked yet (fallback)
        // SQLite doesn't support 'mode: insensitive' in Prisma — use raw SQL
        if (!storeProduct) {
          const results = await db.$queryRaw`
            SELECT * FROM Product
            WHERE LOWER(name) LIKE ${"%" + product.name.toLowerCase() + "%"}
            AND storeStock > 0
            LIMIT 1
          ` as any[];
          storeProduct = results[0] || null;
          // If found, save the link for next time
          if (storeProduct) {
            await db.product.update({
              where: { id: product.id },
              data: { linkedStoreProductId: storeProduct.id },
            });
          }
        }

        if (storeProduct) {
          await db.product.update({
            where: { id: storeProduct.id },
            data: { storeStock: { decrement: it.quantity } },
          });
          await db.storeTransaction.create({
            data: {
              productId: storeProduct.id,
              type: "TRANSFER",
              quantity: -it.quantity,
              note: `Loose sale ${invoiceNo} — ${product.name} (${it.quantity} ${product.unit})`,
            },
          });
          await db.stockLog.create({
            data: {
              productId: storeProduct.id,
              type: "SALE",
              quantity: -it.quantity,
              note: `Loose sale ${invoiceNo} via ${product.name}`,
            },
          });
        }
      }
    }
  }

  // If linked to a card, deduct from balance
  if (body.cardId) {
    const card = await db.customerCard.findUnique({ where: { id: body.cardId } });
    if (card) {
      await db.customerCard.update({
        where: { id: body.cardId },
        data: {
          totalPurchases: { increment: total },
          balance: { decrement: total },
        },
      });
      await db.cardTransaction.create({
        data: {
          cardId: body.cardId,
          type: "PURCHASE",
          amount: total,
          description: `Sale ${invoiceNo} — auto-deducted from account`,
          saleId: sale.id,
        },
      });
    }
  }

  // v2.10.50: LoadBill entity balance deduction
  // If any sale item is a LOAD_COMPANY / WALLET_ACCOUNT / SIM_STOCK product,
  // deduct from the ORIGINAL entity's balance (not just Product.stock).
  for (const it of saleItemsData) {
    const product = await db.product.findUnique({ where: { id: it.productId } });
    if (!product) continue;

    // ─── LOAD COMPANY: deduct load amount from company balance ─────────────
    // For load products, the SALE PRICE is the load amount + extra charges.
    // We deduct the FULL sale price (load + charges) from the company
    // balance because that's the money the shopkeeper spent.
    if (product.inventorySource === "LOAD_COMPANY" && product.linkedStoreProductId) {
      try {
        const company = await db.mobileLoadCompany.findUnique({
          where: { id: product.linkedStoreProductId },
        });
        if (company) {
          const deductAmount = it.price * it.quantity; // total for this line
          const newBalance = Math.max(0, company.balance - deductAmount);
          await db.mobileLoadCompany.update({
            where: { id: company.id },
            data: {
              balance: newBalance,
              totalSold: { increment: deductAmount },
            },
          });
          // Record the transaction as a SALE
          await db.mobileLoadTxn.create({
            data: {
              companyId: company.id,
              type: "SALE",
              amount: it.price * it.quantity, // face value approximation
              salePrice: it.price * it.quantity,
              profit: 0, // charges are included in salePrice for simplicity
              due: 0,
              customerName: body.customerName || null,
              customerPhone: body.customerPhone || null,
              note: `POS sale ${invoiceNo}`,
            },
          });
          console.log(`[sales] Load company ${company.name} balance: ${company.balance} → ${newBalance} (deducted ${deductAmount})`);
        }
      } catch (e: any) {
        console.error("[sales] Load company balance deduction error:", e?.message);
      }
    }

    // ─── WALLET ACCOUNT: deduct sent amount from wallet balance ────────────
    if (product.inventorySource === "WALLET_ACCOUNT" && product.linkedStoreProductId) {
      try {
        const account = await db.walletAccount.findUnique({
          where: { id: product.linkedStoreProductId },
        });
        if (account) {
          const txnAmount = it.price * it.quantity;
          const newBalance = account.balance - txnAmount; // can go negative if SEND
          await db.walletAccount.update({
            where: { id: account.id },
            data: {
              balance: newBalance,
              totalSent: { increment: txnAmount },
            },
          });
          await db.walletTxn.create({
            data: {
              accountId: account.id,
              provider: account.provider,
              type: "SEND",
              amount: txnAmount,
              serviceCharge: 0,
              due: 0,
              customerName: body.customerName || null,
              customerPhone: body.customerPhone || null,
              note: `POS sale ${invoiceNo}`,
            },
          });
          console.log(`[sales] Wallet ${account.name} balance: ${account.balance} → ${newBalance}`);
        }
      } catch (e: any) {
        console.error("[sales] Wallet balance deduction error:", e?.message);
      }
    }

    // ─── SIM STOCK: deduct quantity from SimStock rows ─────────────────────
    if (product.inventorySource === "SIM_STOCK" && product.linkedStoreProductId) {
      try {
        // linkedStoreProductId is "company-type" key
        const [company, type] = product.linkedStoreProductId.split("-");
        let remaining = it.quantity;

        // Deduct from individual SIM stock rows (FIFO)
        const sims = await db.simStock.findMany({
          where: { company, type, status: "IN_STOCK" },
          orderBy: { createdAt: "asc" },
        });

        for (const sim of sims) {
          if (remaining <= 0) break;
          const available = sim.stockQuantity || 1;
          const take = Math.min(available, remaining);
          const newQty = available - take;

          if (newQty <= 0) {
            // Mark as SOLD
            await db.simStock.update({
              where: { id: sim.id },
              data: {
                stockQuantity: 0,
                status: "SOLD",
                soldAt: new Date(),
                customerName: body.customerName || null,
                customerPhone: body.customerPhone || null,
              },
            });
          } else {
            await db.simStock.update({
              where: { id: sim.id },
              data: { stockQuantity: newQty },
            });
          }
          remaining -= take;
        }
        console.log(`[sales] SIM stock deducted: ${company} ${type} × ${it.quantity}`);
      } catch (e: any) {
        console.error("[sales] SIM stock deduction error:", e?.message);
      }
    }
  }

  return NextResponse.json({ sale: saleWithUser });
}
