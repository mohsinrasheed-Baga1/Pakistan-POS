import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await db.settings.findUnique({ where: { id: "shop" } });
  if (!settings) {
    const created = await db.settings.create({ data: { id: "shop" } });
    return NextResponse.json({ settings: created });
  }
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = await req.json();
  const data: any = {
    shopName: body.shopName,
    subName: body.subName ?? null,
    logo: body.logo ?? null,
    shopAddress: body.shopAddress,
    shopPhone: body.shopPhone,
    currency: body.currency,
    taxEnabled: body.taxEnabled === true,
    defaultTax: Number(body.defaultTax) || 0,
    receiptFooter: body.receiptFooter,
    invoicePrefix: body.invoicePrefix,
    printerWidth: Number(body.printerWidth) === 80 ? 80 : 58,
    // v2.10.18: Save printer names for silent printing
    receiptPrinterName: typeof body.receiptPrinterName === "string" && body.receiptPrinterName.trim()
      ? body.receiptPrinterName.trim()
      : null,
    stickerPrinterName: typeof body.stickerPrinterName === "string" && body.stickerPrinterName.trim()
      ? body.stickerPrinterName.trim()
      : null,
  };
  // Multi-computer sharing fields (optional). When present we persist them
  // alongside the other settings so the GET /api/settings response reflects
  // the current sharing mode to the UI.
  if (typeof body.shareMode === "string") {
    const mode = body.shareMode;
    if (mode === "local" || mode === "host" || mode === "client") {
      data.shareMode = mode;
    }
  }
  if (body.dbNetworkPath !== undefined) {
    const p = typeof body.dbNetworkPath === "string" ? body.dbNetworkPath.trim() : "";
    data.dbNetworkPath = p ? p : null;
  }
  // Google Drive backup integration fields (optional, nullable).
  // An empty string is treated as null (disconnects Google Drive).
  if (body.googleClientId !== undefined) {
    const v = typeof body.googleClientId === "string" ? body.googleClientId.trim() : "";
    data.googleClientId = v ? v : null;
  }
  if (body.googleClientSecret !== undefined) {
    const v = typeof body.googleClientSecret === "string" ? body.googleClientSecret.trim() : "";
    data.googleClientSecret = v ? v : null;
  }
  if (body.googleRefreshToken !== undefined) {
    const v = typeof body.googleRefreshToken === "string" ? body.googleRefreshToken.trim() : "";
    data.googleRefreshToken = v ? v : null;
  }
  // v2.10.56: Enable Load & Bill Management toggle
  if (body.enableLoadBill !== undefined) {
    data.enableLoadBill = body.enableLoadBill === true;
  }
  const settings = await db.settings.upsert({
    where: { id: "shop" },
    update: data,
    create: { id: "shop", ...data },
  });

  // v2.10.40: Auto-sync shop_info to Supabase when settings change
  // This ensures the customer card page always shows the right shop name/address
  // (no "My Shop" default). Settings PUT is called when the user saves their
  // shop name in Settings → Shop Info.
  try {
    const { forceSyncShopInfo } = await import("@/lib/supabase-sync");
    // forceSync bypasses the rate limit so it always syncs immediately
    // on settings change
    await forceSyncShopInfo();
  } catch (e: any) {
    console.warn("[Settings PUT] shop_info sync failed (non-fatal):", e?.message);
  }

  return NextResponse.json({ settings });
}
