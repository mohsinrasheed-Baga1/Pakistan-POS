"use client";

import * as React from "react";

type ScanCallback = (code: string) => void;

interface ScanOptions {
  minLength?: number;
  maxGap?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED BARCODE SCANNER HOOK (v2.9.11)
// ─────────────────────────────────────────────────────────────────────────────
// This hook captures barcode scanner input SEPARATELY from normal keyboard
// input. It works by detecting rapid character input (< 100ms gap between
// keys) followed by Enter — this pattern is unique to barcode scanners.
//
// KEY DESIGN DECISIONS:
// 1. The hook ALWAYS fires, even when a text input is focused.
//    This means the scanner is captured regardless of focus.
// 2. When a scan fires, the hook CLEARS the focused input's value
//    so scanner characters don't pollute the search bar.
// 3. The hook does NOT interfere with manual typing — if a human types
//    slowly (> 100ms between keys), the buffer resets and no scan fires.
// 4. The scan callback receives the EXACT barcode string (trimmed,
//    preserving leading zeros, treated as STRING not NUMBER).
//
// This makes barcode scanning a DEDICATED system — the visible search bar
// is never used as the primary barcode scanning mechanism.
// ─────────────────────────────────────────────────────────────────────────────

const subscribers = new Set<ScanCallback>();
let listenerAttached = false;
let buffer = "";
let lastKeyTime = 0;

// Fire lock: prevent rapid duplicate scans
let scanLock = false;
const SCAN_LOCK_MS = 500;

function fireScan(code: string) {
  if (scanLock) return;
  scanLock = true;
  setTimeout(() => { scanLock = false; }, SCAN_LOCK_MS);

  // ─── CLEAR the focused input so scanner chars don't stay in search bar ───
  // This is critical: the scanner types characters into whatever input is
  // focused. We must clear that input so the user doesn't see garbage text.
  const active = document.activeElement;
  if (active && active.tagName === "INPUT") {
    const input = active as HTMLInputElement;
    // Only clear if the current value looks like scanner input (not user's
    // manually typed search). We check if the buffer matches the end of
    // the input value, indicating scanner appended to it.
    if (input.value && input.value.endsWith(code)) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (input.value === code) {
      // Scanner replaced the entire input
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  subscribers.forEach((cb) => {
    try {
      cb(code);
    } catch {}
  });
}

function handleKeyDown(e: KeyboardEvent) {
  // Ignore modifier combos (Ctrl+C, Ctrl+Z, etc.)
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const now = Date.now();
  // If more than 100ms since last key, this is a NEW input sequence
  // (human typing or new scan). Reset buffer.
  if (now - lastKeyTime > 100) {
    buffer = "";
  }
  lastKeyTime = now;

  // Enter triggers a scan if buffer has enough characters
  if (e.key === "Enter") {
    if (buffer.length >= 4) {
      // Normalize: trim whitespace, preserve leading zeros
      const code = buffer.trim();
      if (code.length >= 4) {
        fireScan(code);
      }
      e.preventDefault();
    }
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
