"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";

interface BarcodeDisplayProps {
  value: string;
  format?: string; // CODE128 | EAN13 | CODE39 | UPC | EAN8 ...
  width?: number;        // bar width in px (default 2 — scanner-safe)
  height?: number;       // bar height in px (default 80 — generous for scanners)
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  className?: string;
  /**
   * Tries to render the value in the requested format, but if the value is
   * invalid for that format (e.g. EAN13 needs exactly 13 digits, UPC needs 12),
   * silently falls back to CODE128 so the UI never breaks.
   */
  fallbackToCode128?: boolean;
}

/**
 * Renders a high-quality, scanner-friendly barcode using JsBarcode.
 *
 * ⚠️ PERMANENT STANDARD: This app uses EAN-13 as the default barcode format.
 * EAN-13 is the most widely supported retail barcode format — virtually
 * every USB / Bluetooth / built-in scanner can read it reliably. The user
 * explicitly confirmed EAN-13 is the permanent standard.
 *
 * DO NOT change the default format to CODE128 or any other format unless
 * the user explicitly requests it. EAN-13 provides:
 *   - Built-in checksum (13th digit) that prevents misreads
 *   - Universal scanner compatibility
 *   - Standard retail format used worldwide
 *
 * Defaults are tuned for retail sticker printers (50×35mm):
 *   - format=EAN13 (retail standard)
 *   - width=2px (minimum recommended bar width for reliable scanning)
 *   - height=80px (taller bars scan more reliably from angles)
 *   - margin=10px (quiet zone required by all barcode scanners)
 *   - monospace font for the human-readable digits below the bars
 *
 * If the barcode value is not valid for EAN-13 (not 13 digits), the
 * component automatically falls back to CODE128 so the UI never breaks.
 */
export function BarcodeDisplay({
  value,
  format = "EAN13",
  width = 2,
  height = 80,
  displayValue = true,
  fontSize = 16,
  margin = 10,
  className,
  fallbackToCode128 = true,
}: BarcodeDisplayProps) {
  const ref = React.useRef<SVGSVGElement>(null);

  const render = React.useCallback(() => {
    if (!ref.current || !value) return;
    // Determine the actual format to use:
    // - If format is EAN13 but value is not 13 digits, fall back to CODE128
    // - If format is EAN13 and value is 13 digits, use EAN13
    let actualFormat = format;
    if (format === "EAN13" && !/^\d{13}$/.test(value)) {
      actualFormat = "CODE128";
    }
    if (format === "EAN8" && !/^\d{8}$/.test(value)) {
      actualFormat = "CODE128";
    }
    if (format === "UPC" && !/^\d{12}$/.test(value)) {
      actualFormat = "CODE128";
    }
    const opts: JsBarcode.BaseOptions = {
      format: actualFormat as any,
      width,
      height,
      displayValue,
      fontSize,
      margin,
      textMargin: 4,
      font: "OCR-B, monospace",
      fontOptions: "bold",
      textAlign: "center",
      textPosition: "bottom",
      background: "#ffffff",
      lineColor: "#000000",
    };
    try {
      JsBarcode(ref.current, value, opts);
    } catch (e) {
      if (!fallbackToCode128) return;
      // Try CODE128 fallback for any invalid value (wrong length for EAN/UPC,
      // non-digit characters where digits are required, etc.)
      try {
        JsBarcode(ref.current, value, { ...opts, format: "CODE128" });
      } catch {
        // Last resort — render a placeholder so the UI doesn't crash
        if (ref.current) {
          ref.current.innerHTML = "";
          const text = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
          );
          text.setAttribute("x", "50%");
          text.setAttribute("y", "50%");
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("font-family", "monospace");
          text.setAttribute("font-size", "14");
          text.textContent = value || "—";
          ref.current.appendChild(text);
        }
      }
    }
  }, [value, format, width, height, displayValue, fontSize, margin, fallbackToCode128]);

  React.useEffect(() => {
    render();
  }, [render]);

  return <svg ref={ref} className={className} />;
}
