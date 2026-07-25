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
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMoney, unitLabel } from "@/lib/pos-utils";
import { BarcodeDisplay } from "@/components/barcode/barcode-display";

interface ReceiptProps {
  sale: any;
  settings: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function Receipt({ sale, settings, open, onOpenChange }: ReceiptProps) {
  const printRef = React.useRef<HTMLDivElement>(null);

  if (!sale) return null;

  const currency = settings?.currency || "Rs";
  const taxEnabled = !!settings?.taxEnabled;
  const subName = settings?.subName?.trim() || "";
  const logo = settings?.logo || "";
  const printerWidth = settings?.printerWidth === 80 ? 80 : 58;

  // Width in mm, font sizes based on printer width
  const widthMm = printerWidth === 80 ? 76 : 52;
  const fontSize = printerWidth === 80 ? "12px" : "9px";
  const tableFontSize = printerWidth === 80 ? "11px" : "8px";
  const maxWidth = printerWidth === 80 ? "300px" : "200px";
  const barcodeHeight = 24;
  const barcodeWidth = printerWidth === 80 ? 1.5 : 1;

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", `width=${printerWidth === 80 ? 320 : 240},height=600`);
    if (!win) return;
    win.document.write(`
      <html dir="ltr"><head><title>Receipt ${sale.invoiceNo}</title>
      <style>
        @page { size: ${widthMm}mm auto; margin: 0 1mm 1mm 1mm; }
        * { font-family: 'Consolas', 'Courier New', monospace; box-sizing: border-box; margin: 0; padding: 0; font-weight: bold; }
        body { width: ${widthMm}mm; font-size: ${fontSize}; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .center { text-align: center; }
        .row { display: flex; justify-content: space-between; }
        .border { border-top: 2px solid #000; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { text-align: left; padding: 1px 0; font-size: ${tableFontSize}; word-wrap: break-word; overflow: hidden; font-weight: bold; }
        th { border-bottom: 1px solid #000; font-weight: bold; }
        .bold { font-weight: bold; }
        .big { font-size: ${printerWidth === 80 ? "20px" : "16px"}; font-weight: bold; letter-spacing: 0.5px; }
        .sub-name { font-size: ${printerWidth === 80 ? "14px" : "11px"}; font-weight: bold; margin-top: 2px; }
        .logo { max-height: 50px; height: 50px; max-width: 100%; margin: 0 auto 2px auto; display: block; }
        .barcode-container { text-align: center; margin: 4px 0; }
        .barcode-container svg { max-width: 100%; height: auto; display: inline-block; }
        .item-name { font-size: ${tableFontSize}; font-weight: bold; }
        .item-detail { font-size: ${printerWidth === 80 ? "10px" : "9px"}; color: #000; font-weight: bold; }
        .payment-label { font-weight: bold; }
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
      <DialogContent className="max-w-sm flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            Sale Successful
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 px-4">
          <div
            ref={printRef}
            className="bg-white text-black p-3 rounded-lg space-y-1"
            style={{ maxWidth, margin: "0 auto", fontFamily: "'Consolas', 'Courier New', monospace", color: "#000", fontWeight: "bold" }}
          >
          {/* Header */}
          <div className="center" style={{ textAlign: "center" }}>
            {logo && (
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
            <div className="big" style={{ fontSize: printerWidth === 80 ? "20px" : "16px", fontWeight: "bold", letterSpacing: "0.5px" }}>{settings?.shopName || "POS"}</div>
            {settings?.shopAddress && (
              <div style={{ fontSize: tableFontSize, fontWeight: "bold" }}>{settings.shopAddress}</div>
            )}
            {settings?.shopPhone && (
              <div style={{ fontSize: tableFontSize, fontWeight: "bold" }}>Ph: {settings.shopPhone}</div>
            )}
            {subName && (
              <div className="sub-name" style={{ marginTop: "2px", fontSize: printerWidth === 80 ? "14px" : "11px", fontWeight: "bold" }}>{subName}</div>
            )}
          </div>

          <div className="border" />

          {/* Invoice info */}
          <div className="row" style={{ fontSize: tableFontSize }}>
            <span>Inv:</span>
            <span>{sale.invoiceNo}</span>
          </div>
          <div className="row" style={{ fontSize: tableFontSize }}>
            <span>Date:</span>
            <span>{new Date(sale.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          {sale.customerName && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Customer:</span>
              <span>{sale.customerName}</span>
            </div>
          )}
          {sale.card?.name && (
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
          {sale.change > 0 && (
            <div className="row" style={{ fontSize: tableFontSize }}>
              <span>Change:</span>
              <span>{formatMoney(sale.change, currency)}</span>
            </div>
          )}

          <div className="border" />

          {/* Barcode — inline, compact, dark black */}
          <div className="barcode-container" style={{ textAlign: "center", margin: "2px 0" }}>
            <BarcodeDisplay
              value={sale.invoiceNo}
              format="CODE128"
              height={barcodeHeight}
              width={barcodeWidth}
              displayValue={true}
            />
          </div>

          {/* Footer */}
          <div className="center" style={{ fontSize: tableFontSize, marginTop: "4px" }}>
            {settings?.receiptFooter || "Thank you! Please come again."}
          </div>
          </div>
        </ScrollArea>
        <div className="flex gap-2 p-4 pt-2 shrink-0 border-t">
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
