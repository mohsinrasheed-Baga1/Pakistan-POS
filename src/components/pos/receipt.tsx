"use client";

import * as React from "react";
import { Printer, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney, unitLabel } from "@/lib/pos-utils";
import { BarcodeDisplay } from "@/components/barcode/barcode-display";
import { useReceiptSettings } from "@/hooks/use-receipt-settings";
import { getReceiptWidth } from "@/lib/receipt-settings";

interface ReceiptProps {
  sale: any;
  settings: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function Receipt({ sale, settings, open, onOpenChange }: ReceiptProps) {
  const printRef = React.useRef<HTMLDivElement>(null);
  const { settings: receiptSettings, loading: receiptLoading } = useReceiptSettings();

  if (!sale) return null;

  const currency = settings?.currency || "Rs";
  const taxEnabled = !!settings?.taxEnabled;
  const subName = settings?.subName?.trim() || "";
  const logo = settings?.logo || "";

  // Use receipt settings (with fallback to old hardcoded values while loading)
  const rs = receiptSettings;
  const widthMm = receiptLoading ? (settings?.printerWidth === 80 ? 76 : 52) : getReceiptWidth(rs);
  const fontSize = `${rs.fontSize}px`;
  const tableFontSize = `${rs.fontSize - 1}px`;
  const headerFontSize = `${rs.headerFontSize}px`;
  const titleFontSize = `${rs.titleFontSize}px`;
  const maxWidth = `${widthMm * 3.78}px`;
  const fontFamily = rs.fontFamily;
  const fontBold = rs.fontBold ? "bold" : "normal";
  const textColor = rs.textColor;
  const headerColor = rs.headerColor;
  const textAlign = rs.layout;
  const barcodeHeight = 24;
  const barcodeWidth = widthMm > 60 ? 1.5 : 1;

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", `width=${widthMm > 60 ? 320 : 240},height=600`);
    if (!win) return;
    win.document.write(`
      <html dir="ltr"><head><title>Receipt ${sale.invoiceNo}</title>
      <style>
        @page { size: ${widthMm}mm auto; margin: ${rs.marginTop}mm ${rs.marginRight}mm ${rs.marginBottom}mm ${rs.marginLeft}mm; }
        * { font-family: '${fontFamily}', 'Courier New', monospace; box-sizing: border-box; margin: 0; padding: 0; font-weight: ${fontBold}; }
        body { width: ${widthMm}mm; font-size: ${fontSize}; color: ${textColor}; -webkit-print-color-adjust: exact; print-color-adjust: exact; line-height: ${rs.lineSpacing}; }
        .center { text-align: center; }
        .left { text-align: left; }
        .right { text-align: right; }
        .row { display: flex; justify-content: space-between; }
        .border { border-top: 2px solid #000; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { text-align: left; padding: 1px 0; font-size: ${tableFontSize}; word-wrap: break-word; overflow: hidden; font-weight: ${fontBold}; }
        th { border-bottom: 1px solid #000; font-weight: bold; }
        .bold { font-weight: bold; }
        .big { font-size: ${headerFontSize}; font-weight: bold; color: ${headerColor}; }
        .sub-name { font-size: ${titleFontSize}; font-weight: bold; margin-top: 2px; }
        .logo { max-height: 50px; height: 50px; max-width: 100%; margin: 0 auto 2px auto; display: block; }
        .barcode-container { text-align: center; margin: 4px 0; }
        .barcode-container svg { max-width: 100%; height: auto; display: inline-block; }
        .item-name { font-size: ${tableFontSize}; font-weight: bold; }
        .item-detail { font-size: ${rs.fontSize - 2}px; color: ${textColor}; font-weight: ${fontBold}; }
        .payment-label { font-weight: bold; }
        .text-${textAlign} { text-align: ${textAlign}; }
      </style></head><body>${content.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 400);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            Sale Successful
          </DialogTitle>
        </DialogHeader>
        {/* Scrollable receipt area */}
        <div className="flex-1 overflow-y-auto min-h-0">
        <div
          ref={printRef}
          className="bg-white text-black p-3 rounded-lg space-y-1"
          style={{
            maxWidth,
            margin: "0 auto",
            fontFamily: `'${fontFamily}', 'Courier New', monospace`,
            color: textColor,
            fontSize,
            lineHeight: rs.lineSpacing,
            textAlign: textAlign as any,
          }}
        >
          {/* Header — respects receipt settings show flags */}
          <div className={rs.layout === "center" ? "center" : rs.layout === "right" ? "right" : "left"}>
            {rs.showLogo && logo && (
              <img
                src={logo}
                alt="Shop logo"
                style={{
                  maxHeight: "50px",
                  height: "50px",
                  maxWidth: "100%",
                  margin: "0 auto 2px auto",
                  display: "block",
                  objectFit: "contain",
                }}
              />
            )}
            {rs.showShopName && (
              <div className="big">{settings?.shopName || "POS"}</div>
            )}
            {rs.showShopAddress && settings?.shopAddress && (
              <div style={{ fontSize: tableFontSize }}>{settings.shopAddress}</div>
            )}
            {rs.showShopPhone && settings?.shopPhone && (
              <div style={{ fontSize: tableFontSize }}>Ph: {settings.shopPhone}</div>
            )}
            {rs.showSubName && subName && (
              <div className="sub-name" style={{ marginTop: "2px" }}>{subName}</div>
            )}
          </div>

          <div className="border" />

          {/* Invoice info — respects show flags */}
          {rs.showInvoiceNo && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Inv:</span>
              <span>{sale.invoiceNo}</span>
            </div>
          )}
          {rs.showDateTime && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Date:</span>
              <span>{new Date(sale.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
          )}

          {/* ─── Customer Type (Regular / Wholesale / Shopkeeper) ─── */}
          {rs.showSaleType && sale.saleType && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Type:</span>
              <span>
                {sale.saleType === "RETAIL" ? "Regular"
                  : sale.saleType === "WHOLESALE" ? "Wholesale"
                  : sale.saleType === "SHOPKEEPER" ? "Shopkeeper"
                  : sale.saleType}
              </span>
            </div>
          )}

          {/* ─── Customer Name — shows if shop card used OR manually entered ─── */}
          {rs.showCustomerName && sale.customerName && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Customer:</span>
              <span>{sale.customerName}</span>
            </div>
          )}
          {rs.showCustomerPhone && sale.customerPhone && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Phone:</span>
              <span>{sale.customerPhone}</span>
            </div>
          )}
          {rs.showCardDetails && sale.card?.name && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Card:</span>
              <span>{sale.card.name} ({sale.card.cardNumber})</span>
            </div>
          )}

          <div className="border" />

          {/* Items table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: "55%" }}>Item</th>
                <th style={{ width: "15%", textAlign: "center" }}>Qty</th>
                <th style={{ width: "30%", textAlign: "right" }}>Amt</th>
              </tr>
            </thead>
            <tbody>
              {sale.items?.map((it: any) => (
                <tr key={it.id}>
                  <td style={{ width: "55%" }}>
                    <div className="item-name">{it.name}</div>
                    <div className="item-detail">{it.price} x {it.quantity} {unitLabel(it.unit)}</div>
                  </td>
                  <td style={{ width: "15%", textAlign: "center" }}>{it.quantity}</td>
                  <td style={{ width: "30%", textAlign: "right" }}>{formatMoney(it.lineTotal, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border" />

          {/* Totals */}
          <div className="row" style={{ fontSize: tableFontSize }}>
            <span>Subtotal:</span>
            <span>{formatMoney(sale.subtotal, currency)}</span>
          </div>
          {taxEnabled && sale.taxTotal > 0 && (
            <div className="row bold" style={{ fontSize: tableFontSize, fontWeight: "bold", color: "#000" }}>
              <span>Tax:</span>
              <span>{formatMoney(sale.taxTotal, currency)}</span>
            </div>
          )}
          {sale.discount > 0 && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Discount:</span>
              <span>-{formatMoney(sale.discount, currency)}</span>
            </div>
          )}
          <div className="row bold big" style={{ marginTop: "2px" }}>
            <span>TOTAL:</span>
            <span>{formatMoney(sale.total, currency)}</span>
          </div>

          {/* Payment */}
          {rs.showPaymentMethod && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span className="payment-label">Payment:</span>
              <span>
                {sale.paymentMethod === "CASH"
                  ? "Cash"
                  : sale.paymentMethod === "CARD"
                  ? "Card"
                  : sale.paymentMethod === "SHOP_CARD"
                  ? "Shop Card"
                  : "Mobile"}
                {" "}({formatMoney(sale.paidAmount, currency)})
              </span>
            </div>
          )}
          {rs.showChange && sale.change > 0 && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Change:</span>
              <span>{formatMoney(sale.change, currency)}</span>
            </div>
          )}

          <div className="border" />

          {rs.showBarcode && (
            <div className="barcode-container" style={{ textAlign: "center", margin: "2px 0" }}>
              <BarcodeDisplay
                value={sale.invoiceNo}
                format="CODE128"
                height={barcodeHeight}
                width={barcodeWidth}
                displayValue={true}
              />
            </div>
          )}

          {/* Footer — uses receipt settings footer text */}
          {rs.showFooter && (
            <div className={rs.layout === "center" ? "center" : rs.layout === "right" ? "right" : "left"} style={{ fontSize: tableFontSize, marginTop: "4px" }}>
              {rs.receiptFooter || settings?.receiptFooter || "Thank you! Please come again."}
            </div>
          )}
        </div>
        </div>
        {/* Sticky footer — always visible regardless of receipt length */}
        <div className="flex gap-2 flex-shrink-0 border-t pt-3 mt-2 bg-background">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePrint}
          >
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
