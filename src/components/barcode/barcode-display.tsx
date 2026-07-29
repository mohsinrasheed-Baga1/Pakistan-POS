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
 * Defaults are tuned for retail sticker printers (50×25mm and similar):
 *   - width=2px   (minimum recommended bar width for reliable scanning)
 *   - height=80px (taller bars scan more reliably from angles)
 *   - margin=10px (quiet zone required by all barcode scanners)
 *   - monospace font for the human-readable digits below the bars
 *
 * Always pass `displayValue=true` (the default) unless you are printing a
 * tiny sticker where the digits would overlap the bars — in that case pass
 * `displayValue={false}` and render the digits yourself below the SVG.
 */
export function BarcodeDisplay({
  value,
  format = "CODE128",
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
    const opts: JsBarcode.BaseOptions = {
      format: format as any,
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
