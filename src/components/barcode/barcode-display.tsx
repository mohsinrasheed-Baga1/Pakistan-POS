"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";

interface BarcodeDisplayProps {
  value: string;
  format?: string; // CODE128 | EAN13 | CODE39 | UPC ...
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export function BarcodeDisplay({
  value,
  format = "CODE128",
  width = 2,
  height = 60,
  displayValue = true,
  className,
}: BarcodeDisplayProps) {
  const ref = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    try {
      let fmt = format;
      // EAN13 requires 13 digits; fallback to CODE128 if invalid
      if (format === "EAN13") {
        if (!/^\d{13}$/.test(value)) fmt = "CODE128";
      }
      if (format === "EAN8") {
        if (!/^\d{8}$/.test(value)) fmt = "CODE128";
      }
      if (format === "UPC") {
        if (!/^\d{12}$/.test(value)) fmt = "CODE128";
      }
      JsBarcode(ref.current, value, {
        format: fmt,
        width,
        height,
        displayValue,
        fontSize: 10,
        margin: 2,
        textMargin: 1,
      });
    } catch (e) {
      // fallback to plain CODE128
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          width,
          height,
          displayValue,
          fontSize: 10,
          margin: 2,
          textMargin: 1,
        });
      } catch {}
    }
  }, [value, format, width, height, displayValue]);

  return <svg ref={ref} className={className} />;
}
