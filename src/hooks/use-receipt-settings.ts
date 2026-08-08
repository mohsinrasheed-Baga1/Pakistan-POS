"use client";

import * as React from "react";
import { ReceiptSettings, DEFAULT_RECEIPT_SETTINGS } from "@/lib/receipt-settings";

/**
 * useReceiptSettings — loads receipt settings from /api/settings/receipt
 */
export function useReceiptSettings() {
  const [settings, setSettings] = React.useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/settings/receipt", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          const s = data.settings;
          setSettings({
            ...DEFAULT_RECEIPT_SETTINGS,
            receiptSize: s.receiptSize || "58mm",
            customWidth: s.customWidth || 58,
            customHeight: s.customHeight || 0,
            layout: s.layout || "left",
            showLogo: s.showLogo !== false,
            showShopName: s.showShopName !== false,
            showSubName: s.showSubName !== false,
            showShopAddress: s.showShopAddress !== false,
            showShopPhone: s.showShopPhone !== false,
            showInvoiceNo: s.showInvoiceNo !== false,
            showDateTime: s.showDateTime !== false,
            showCustomerName: s.showCustomerName !== false,
            showCustomerPhone: s.showCustomerPhone === true,
            showSaleType: s.showSaleType !== false,
            showPaymentMethod: s.showPaymentMethod !== false,
            showCardDetails: s.showCardDetails !== false,
            showBarcode: s.showBarcode !== false,
            showFooter: s.showFooter !== false,
            fontFamily: s.fontFamily || "Consolas",
            fontSize: s.fontSize || 9,
            fontBold: s.fontBold !== false,
            headerFontSize: s.headerFontSize || 13,
            titleFontSize: s.titleFontSize || 11,
            textColor: s.textColor || "#000000",
            headerColor: s.headerColor || "#000000",
            marginTop: s.marginTop || 2,
            marginBottom: s.marginBottom || 2,
            marginLeft: s.marginLeft || 3,
            marginRight: s.marginRight || 1,
            lineSpacing: s.lineSpacing || 1.2,
            receiptFooter: s.receiptFooter || null,
            showItemDetails: s.showItemDetails !== false,
            showSubtotal: s.showSubtotal !== false,
            showTax: s.showTax !== false,
            showDiscount: s.showDiscount !== false,
            showChange: s.showChange !== false,
          });
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { settings, loading, reload: load, setSettings };
}
