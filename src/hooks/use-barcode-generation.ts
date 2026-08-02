"use client";

/**
 * useBarcodeGeneration
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side hook that calls /api/barcode/generate to create verified
 * barcodes using bwip-js (server-side) + ZXing verification.
 *
 * Usage:
 *   const { generate, loading, result, error } = useBarcodeGeneration();
 *   await generate({ format: "CODE128", value: "RICE00120" });
 *   if (result?.verified) { // safe to print }
 */

import * as React from "react";

export interface BarcodeResult {
  success: boolean;
  value: string;
  format: string;
  svg: string;
  pngBase64: string;
  verified: boolean;
  widthMm: number;
  heightMm: number;
  error?: string;
}

export interface GenerateParams {
  format: "CODE128" | "EAN13" | "UPC_A" | "CODE39" | "QR";
  value: string;
  scale?: number;
  height?: number;
  includeText?: boolean;
  verify?: boolean;
}

export function useBarcodeGeneration() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<BarcodeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const generate = React.useCallback(async (params: GenerateParams): Promise<BarcodeResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/barcode/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate barcode");
        setResult(null);
        return null;
      }
      setResult(data);
      return data;
    } catch (e: any) {
      setError(e.message || "Network error");
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, result, error, setResult };
}
