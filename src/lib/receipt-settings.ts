/**
 * Shared Receipt Settings types + defaults
 */

export interface ReceiptSettings {
  // Section 1: Size
  receiptSize: "58mm" | "80mm" | "A4" | "custom";
  customWidth: number;
  customHeight: number;

  // Section 2: Layout
  layout: "left" | "center" | "right";
  showLogo: boolean;
  showShopName: boolean;
  showSubName: boolean;
  showShopAddress: boolean;
  showShopPhone: boolean;
  showInvoiceNo: boolean;
  showDateTime: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showSaleType: boolean;
  showPaymentMethod: boolean;
  showCardDetails: boolean;
  showBarcode: boolean;
  showFooter: boolean;

  // Section 3: Font
  fontFamily: string;
  fontSize: number;
  fontBold: boolean;
  headerFontSize: number;
  titleFontSize: number;

  // Section 4: Colors
  textColor: string;
  headerColor: string;

  // Section 5: Margins
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  lineSpacing: number;

  // Section 6: Content
  receiptFooter: string | null;
  showItemDetails: boolean;
  showSubtotal: boolean;
  showTax: boolean;
  showDiscount: boolean;
  showChange: boolean;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
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

export const RECEIPT_SIZES = [
  { key: "58mm", label: "58mm Thermal", widthMm: 52 },
  { key: "80mm", label: "80mm Thermal", widthMm: 76 },
  { key: "A4", label: "A4 Sheet", widthMm: 210 },
  { key: "custom", label: "Custom", widthMm: 58 },
] as const;

export const RECEIPT_FONTS = [
  "Consolas",
  "Courier New",
  "Monaco",
  "Tahoma",
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Verdana",
  "Georgia",
  "Calibri",
];

export function getReceiptWidth(settings: ReceiptSettings): number {
  if (settings.receiptSize === "custom") return settings.customWidth;
  const found = RECEIPT_SIZES.find(s => s.key === settings.receiptSize);
  return found?.widthMm ?? 52;
}
