"use client";

import * as React from "react";

type ScanCallback = (code: string) => void;

interface ScanOptions {
  minLength?: number;
  maxGap?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED BARCODE SCANNER HOOK (v2.9.13)
// ─────────────────────────────────────────────────────────────────────────────
// Captures barcode scanner input SEPARATELY from normal keyboard input.
//
// RELIABLE DETECTION METHOD:
// Instead of relying on a fixed 35ms threshold (which many scanners don't
// meet), we use a COMBINATION of signals:
//
// 1. TOTAL TIME: A barcode scanner completes a full scan (all chars + Enter)
//    in typically 50-200ms total. Humans take 2+ seconds for 10+ chars.
//
// 2. MINIMUM LENGTH: Barcode scanners produce 4+ character codes.
//    Short inputs (1-3 chars) are ignored.
//
// 3. ENTER TERMINATED: Scanners always end with Enter. If we get 4+ chars
//    followed by Enter within a short time window, it's a scan.
//
// HOW IT WORKS WITH FOCUSED INPUTS:
// - When NO input is focused: capture all keys, fire on Enter
// - When REGULAR input is focused (search bar):
//   * We STILL capture into our own buffer (parallel to the input)
//   * We DON'T preventDefault (let the input work normally)
//   * When Enter is pressed, we check: if our buffer has 6+ chars AND
//     the total time was < 500ms, it's a scan → fire scan + clear input
//   * Otherwise, it's manual typing → let the input's Enter handler work
// - When DEDICATED barcode input is focused: always capture + prevent
//
// This is MORE reliable because:
// - No strict per-key gap threshold
// - Uses total sequence time (more stable across scanner models)
// - Doesn't interfere with manual typing (no preventDefault on chars)
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
// - Buffer has >= 6 characters (most barcodes are 8-13 digits)
// - Total time from first char to Enter is <= 500ms
// - This distinguishes scanner (fast) from human (slow)
const MIN_SCAN_LENGTH = 6;
const MAX_SCAN_TIME_MS = 500;

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

  // If more than 200ms since last key, this is a NEW sequence.
  // Reset buffer and timing.
  if (gap > 200) {
    buffer = "";
    firstKeyTime = now;
  }
  lastKeyTime = now;

  // For dedicated barcode inputs: always capture, always prevent
  if (isBarcodeInput) {
    e.preventDefault();
  }
  // For regular inputs: we DON'T preventDefault on character keys.
  // We let the input work normally. We just capture into our buffer
  // in parallel. When Enter is pressed, we decide if it was a scan.

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
          // Clear the focused input if it has scanner text
          if (isInputFocused) {
            const input = active as HTMLInputElement;
            if (input.value) {
              input.value = "";
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          // Prevent the Enter from also triggering the input's handler
          // (which would try to search for the barcode text as a name)
          e.preventDefault();
          buffer = "";
          return;
        }
      }
    }
    // Not a scan — let Enter work normally (input's handler will fire)
    buffer = "";
    return;
  }

  // Accumulate printable characters
  if (e.key.length === 1) {
    buffer += e.key;
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
