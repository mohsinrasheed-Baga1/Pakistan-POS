"use client";

import * as React from "react";

type ScanCallback = (code: string) => void;

interface ScanOptions {
  minLength?: number;
  maxGap?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED BARCODE SCANNER HOOK (v2.9.14)
// ─────────────────────────────────────────────────────────────────────────────
// Captures barcode scanner input SEPARATELY from the search bar.
//
// KEY PRINCIPLE:
// Barcode scanning should NEVER type into the visible search bar.
// The scanner's characters are captured by this hook and sent directly
// to the backend for an EXACT lookup. The search bar remains clean.
//
// DETECTION METHOD:
// We measure the TOTAL TIME from the first character to Enter.
// - Scanner: typically 50-300ms for a full barcode (8-13 chars)
// - Human: 2+ seconds for 8+ characters
//
// When a scan is detected:
// 1. fireScan() is called with the exact barcode
// 2. The focused input (if any) is CLEARED so no scanner text remains
// 3. preventDefault stops the Enter from triggering the input's handler
//
// When manual typing is detected (slow):
// 1. Characters go to the input normally (no preventDefault on chars)
// 2. Enter triggers the input's own handler (manual name search)
//
// This ensures:
// - Scanner barcodes are NEVER typed into the search bar
// - Scanner barcodes go DIRECTLY to backend lookup
// - Manual typing works normally in the search bar
// - Unknown barcodes NEVER select the highlighted product
// ─────────────────────────────────────────────────────────────────────────────

const subscribers = new Set<ScanCallback>();
let listenerAttached = false;
let buffer = "";
let firstKeyTime = 0;
let lastKeyTime = 0;

// Fire lock: prevent rapid duplicate scans
let scanLock = false;
const SCAN_LOCK_MS = 300;

// A scan is considered valid if:
// - Buffer has >= 4 characters (most barcodes are 8-13 digits)
// - Total time from first char to Enter is <= 800ms
//   (generous threshold to catch slower scanners)
// - This distinguishes scanner (fast) from human (slow)
const MIN_SCAN_LENGTH = 4;
const MAX_SCAN_TIME_MS = 1500;

function fireScan(code: string) {
  if (scanLock) return;
  scanLock = true;
  setTimeout(() => { scanLock = false; }, SCAN_LOCK_MS);

  subscribers.forEach((cb) => {
    try {
      cb(code);
    } catch {}
  });
}

function handleKeyDown(e: KeyboardEvent) {
  // Ignore modifier combos (Ctrl+C, Ctrl+Z, etc.)
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const active = document.activeElement;
  const isInputFocused = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  const isBarcodeInput = isInputFocused && (active as HTMLInputElement).getAttribute("data-barcode-input") === "true";

  const now = Date.now();
  const gap = now - lastKeyTime;

  // If more than 300ms since last key, this is a NEW sequence.
  // Reset buffer and timing.
  if (gap > 300) {
    buffer = "";
    firstKeyTime = now;
  }
  lastKeyTime = now;

  // Enter — check if this is a scan
  if (e.key === "Enter") {
    if (buffer.length >= MIN_SCAN_LENGTH) {
      const totalTime = now - firstKeyTime;
      // Check if this was fast enough to be a scan
      // OR if it's a dedicated barcode input (always treat as scan)
      if (isBarcodeInput || totalTime <= MAX_SCAN_TIME_MS) {
        const code = buffer.trim();
        if (code.length >= 4) {
          fireScan(code);
          // Clear the focused input so scanner text doesn't remain
          if (isInputFocused) {
            const input = active as HTMLInputElement;
            if (input.value) {
              input.value = "";
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          // Prevent the Enter from also triggering the input's handler
          e.preventDefault();
          e.stopPropagation();
          buffer = "";
          return;
        }
      }
    }
    // Not a scan — let Enter work normally (input's handler will fire)
    buffer = "";
    return;
  }

  // For dedicated barcode inputs: always prevent chars from reaching input
  if (isBarcodeInput) {
    e.preventDefault();
  }

  // Accumulate printable characters into our buffer
  if (e.key.length === 1) {
    buffer += e.key;
    // If we detect this is a scan (fast input) AND a regular input is focused,
    // prevent chars from reaching the input to keep search bar clean
    if (!isBarcodeInput && isInputFocused) {
      const elapsed = now - firstKeyTime;
      // If we have 4+ chars in < 400ms, it's definitely a scanner
      // Start preventing chars from going to the input
      if (buffer.length >= 4 && elapsed < 400) {
        e.preventDefault();
        // Also clear any chars that already slipped into the input
        const input = active as HTMLInputElement;
        if (input.value) {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }
  }
}

function attachListener() {
  if (listenerAttached) return;
  document.addEventListener("keydown", handleKeyDown, true);
  listenerAttached = true;
}

function detachListener() {
  if (!listenerAttached) return;
  if (subscribers.size === 0) {
    document.removeEventListener("keydown", handleKeyDown, true);
    listenerAttached = false;
  }
}

export function useBarcodeScanner(
  onScan: ScanCallback,
  options: ScanOptions = {}
) {
  const { minLength = 4 } = options;
  const callbackRef = React.useRef(onScan);
  React.useEffect(() => {
    callbackRef.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    const handler: ScanCallback = (code) => {
      if (code.length >= minLength) {
        callbackRef.current(code);
      }
    };
    subscribers.add(handler);
    attachListener();
    return () => {
      subscribers.delete(handler);
      detachListener();
    };
  }, [minLength]);
}
