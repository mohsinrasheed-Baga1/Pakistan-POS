import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const DEFAULTS = {
  id: "default",
  receiptSize: "58mm",
  customWidth: 58,
  customHeight: 0,
  layout: "left",
  showLogo: true,
  showShopName: true,
  showSubName: true,
  showShopAddress: true,
  showShopPhone: true,
  showInvoiceNo: true,
  showDateTime: true,
  showCustomerName: true,
  showCustomerPhone: false,
  showSaleType: true,
  showPaymentMethod: true,
  showCardDetails: true,
  showBarcode: true,
  showFooter: true,
  fontFamily: "Consolas",
  fontSize: 9,
  fontBold: true,
  headerFontSize: 13,
  titleFontSize: 11,
  textColor: "#000000",
  headerColor: "#000000",
  marginTop: 2,
  marginBottom: 2,
  marginLeft: 3,
  marginRight: 1,
  lineSpacing: 1.2,
  receiptFooter: null,
  showItemDetails: true,
  showSubtotal: true,
  showTax: true,
  showDiscount: true,
  showChange: true,
};

// GET /api/settings/receipt
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let settings = await db.receiptSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      settings = await db.receiptSettings.create({ data: DEFAULTS });
    }
    return NextResponse.json({ settings });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/settings/receipt
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") return NextResponse.json({ error: "Manager only" }, { status: 403 });

  try {
    const body = await req.json();

    const data: any = {
      receiptSize: body.receiptSize || "58mm",
      customWidth: Number(body.customWidth) || 58,
      customHeight: Number(body.customHeight) || 0,
      layout: body.layout || "left",
      showLogo: body.showLogo !== false,
      showShopName: body.showShopName !== false,
      showSubName: body.showSubName !== false,
      showShopAddress: body.showShopAddress !== false,
      showShopPhone: body.showShopPhone !== false,
      showInvoiceNo: body.showInvoiceNo !== false,
      showDateTime: body.showDateTime !== false,
      showCustomerName: body.showCustomerName !== false,
      showCustomerPhone: body.showCustomerPhone === true,
      showSaleType: body.showSaleType !== false,
      showPaymentMethod: body.showPaymentMethod !== false,
      showCardDetails: body.showCardDetails !== false,
      showBarcode: body.showBarcode !== false,
      showFooter: body.showFooter !== false,
      fontFamily: body.fontFamily || "Consolas",
      fontSize: Number(body.fontSize) || 9,
      fontBold: body.fontBold !== false,
      headerFontSize: Number(body.headerFontSize) || 13,
      titleFontSize: Number(body.titleFontSize) || 11,
      textColor: body.textColor || "#000000",
      headerColor: body.headerColor || "#000000",
      marginTop: Number(body.marginTop) || 2,
      marginBottom: Number(body.marginBottom) || 2,
      marginLeft: Number(body.marginLeft) || 3,
      marginRight: Number(body.marginRight) || 1,
      lineSpacing: Number(body.lineSpacing) || 1.2,
      receiptFooter: body.receiptFooter || null,
      showItemDetails: body.showItemDetails !== false,
      showSubtotal: body.showSubtotal !== false,
      showTax: body.showTax !== false,
      showDiscount: body.showDiscount !== false,
      showChange: body.showChange !== false,
    };

    const settings = await db.receiptSettings.upsert({
      where: { id: "default" },
      create: { ...DEFAULTS, ...data },
      update: data,
    });

    return NextResponse.json({ settings });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/settings/receipt — reset to defaults
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") return NextResponse.json({ error: "Manager only" }, { status: 403 });

  try {
    await db.receiptSettings.deleteMany({ where: { id: "default" } });
    const settings = await db.receiptSettings.create({ data: DEFAULTS });
    return NextResponse.json({ settings });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
