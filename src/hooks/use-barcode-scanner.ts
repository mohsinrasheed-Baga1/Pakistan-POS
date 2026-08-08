"use client";

import * as React from "react";

type ScanCallback = (code: string) => void;

interface ScanOptions {
  minLength?: number;
  maxGap?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED BARCODE SCANNER HOOK (v2.9.12)
// ─────────────────────────────────────────────────────────────────────────────
// Captures barcode scanner input SEPARATELY from normal keyboard input.
//
// HOW IT WORKS:
// The hook detects barcode scanner input by measuring the time between
// keystrokes. Barcode scanners type very fast (< 50ms between keys),
// while humans type slowly (> 100ms). When we detect fast input followed
// by Enter, we treat it as a scan.
//
// THREE SCENARIOS:
// 1. NO input focused (body):
//    - Capture all keys into buffer
//    - On Enter → fire scan
//
// 2. REGULAR input focused (search bar, NOT data-barcode-input):
//    - Detect if input is fast (scanner) or slow (human)
//    - If slow (human typing) → let input handle normally, don't capture
//    - If fast (scanner) → capture into buffer, prevent chars from
//      reaching input, clear input on Enter, fire scan
//
// 3. DEDICATED barcode input focused (data-barcode-input="true"):
//    - Always capture, always prevent chars from reaching input
//    - On Enter → fire scan
//
// This makes barcode scanning work in ALL cases without breaking
// manual typing in the search bar.
// ─────────────────────────────────────────────────────────────────────────────

const subscribers = new Set<ScanCallback>();
let listenerAttached = false;
let buffer = "";
let lastKeyTime = 0;
// Track whether we're in "scanner mode" (fast input detected)
let scannerMode = false;

// Fire lock: prevent rapid duplicate scans
let scanLock = false;
const SCAN_LOCK_MS = 300;

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

  // If more than 100ms since last key, this is a NEW input sequence.
  // Reset buffer and scanner mode.
  if (gap > 100) {
    buffer = "";
    scannerMode = false;
  }

  // Detect scanner mode: if gap between keys is < 35ms, it's a scanner
  // (humans can't type that fast). Once detected, stay in scanner mode
  // until Enter or long gap.
  if (lastKeyTime > 0 && gap < 35 && buffer.length > 0) {
    scannerMode = true;
  }

  lastKeyTime = now;

  // For dedicated barcode inputs: always capture, always prevent
  if (isBarcodeInput) {
    e.preventDefault();
  } else if (isInputFocused) {
    // Regular input (search bar) is focused.
    // Only capture if we're in scanner mode (fast input detected).
    // If human is typing slowly, let the input handle normally.
    if (scannerMode) {
      // Scanner is typing into the search bar — prevent chars from
      // reaching it so it doesn't show garbage text.
      e.preventDefault();
    } else {
      // Human typing — let input handle normally, reset buffer
      buffer = "";
      return;
    }
  }

  // Enter triggers a scan if buffer has enough characters
  if (e.key === "Enter") {
    if (buffer.length >= 4) {
      const code = buffer.trim();
      if (code.length >= 4) {
        fireScan(code);
      }
    }
    buffer = "";
    scannerMode = false;
    // If scanner was typing into an input, clear it
    if (isInputFocused && scannerMode) {
      const input = active as HTMLInputElement;
      if (input.value) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
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
