"use client";

/**
 * Global Calculator Dialog (v2.10.83 — REDESIGNED)
 * ─────────────────────────────────────────────────────────────────────────────
 * A cash-register-style calculator that opens with Ctrl+C on ANY page.
 *
 * Design (user spec, v2.10.83):
 *   ┌────────────────────────────────────┐
 *   │  Calculator           [Ctrl+C]     │  ← header
 *   ├────────────────────────────────────┤
 *   │  ↑↓ navigate history               │  ← hint
 *   │  ┌──────────────────────────────┐  │
 *   │  │  + 524         ← older entry │  │  ← visible 2 entries (history window)
 *   │  │  + 4521        ← newer entry │  │
 *   │  └──────────────────────────────┘  │
 *   │  ┌──────────────────────────────┐  │
 *   │  │  9                           │  │  ← current input display
 *   │  └──────────────────────────────┘  │
 *   │  ┌──────────────────────────────┐  │
 *   │  │  Total: 51452               │  │  ← running total (always visible)
 *   │  └──────────────────────────────┘  │
 *   ├────────────────────────────────────┤
 *   │  C  ⌫  ÷  ×                        │
 *   │  7  8  9  −                        │  ← buttons grid
 *   │  4  5  6  +                        │
 *   │  1  2  3  =                        │
 *   │  0     .                           │
 *   └────────────────────────────────────┘
 *
 * Behavior:
 * - Shows ONLY the last 2 entries at the top (history window)
 * - Shows the running TOTAL at the bottom (always visible)
 * - All other entries are stored in `entries` array (backend)
 * - ↑/↓ arrow keys: scroll through history entries (move the window)
 * - Like a normal calculator's history check feature
 *
 * This solves the "expanding UI with many entries" issue — the dialog
 * size is FIXED, only 2 entries are visible at any time, rest are scrolled.
 */

import * as React from "react";
import { Calculator as CalculatorIcon, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from "lucide-react";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";

interface GlobalCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Entry {
  value: number;        // the operand value (e.g. 524)
  op: string;           // the operator BEFORE this value (e.g. "+")
  result: number;       // running total AFTER applying this entry
  timestamp: number;
}

export function GlobalCalculator({ open, onOpenChange }: GlobalCalculatorProps) {
  // Current input being typed
  const [display, setDisplay] = React.useState("0");
  // Pending operation (the next op to apply when next digit is entered)
  const [pendingOp, setPendingOp] = React.useState<string | null>(null);
  // Running total (before current input)
  const [runningTotal, setRunningTotal] = React.useState<number>(0);
  // History of completed entries (each entry = { value, op, result, timestamp })
  const [entries, setEntries] = React.useState<Entry[]>([]);
  // History window scroll position — index of the TOPMOST entry visible
  // Default: shows the last 2 entries (most recent at bottom of window)
  const [historyOffset, setHistoryOffset] = React.useState<number>(0);
  // Flag: are we waiting for the next digit (after an operator was pressed)?
  const [waitingForOperand, setWaitingForOperand] = React.useState(false);

  function reset() {
    setDisplay("0");
    setPendingOp(null);
    setRunningTotal(0);
    setEntries([]);
    setHistoryOffset(0);
    setWaitingForOperand(false);
  }

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Helper: scroll history window up/down (within bounds)
  function scrollHistory(direction: "up" | "down") {
    if (entries.length === 0) return;
    // Window shows 2 entries: top = entries[offset], bottom = entries[offset+1]
    // Max offset = entries.length - 2 (so last 2 entries are visible)
    // Min offset = 0 (oldest 2 entries visible)
    if (direction === "up") {
      // Show older entries — increase offset (but cap at length-2)
      setHistoryOffset((prev) => Math.min(prev + 1, Math.max(0, entries.length - 2)));
    } else {
      // Show newer entries — decrease offset (but not below 0)
      setHistoryOffset((prev) => Math.max(prev - 1, 0));
    }
  }

  // Keyboard support
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Don't interfere with Ctrl+C itself (that's the toggle)
      if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
        onOpenChange(false);
        return;
      }
      e.preventDefault();
      // ↑/↓ arrow keys: navigate history
      if (e.key === "ArrowUp") {
        scrollHistory("up");
        return;
      }
      if (e.key === "ArrowDown") {
        scrollHistory("down");
        return;
      }
      if (e.key >= "0" && e.key <= "9") inputDigit(e.key);
      else if (e.key === ".") inputDecimal();
      else if (e.key === "+") performOperation("+");
      else if (e.key === "-") performOperation("-");
      else if (e.key === "*") performOperation("×");
      else if (e.key === "/") performOperation("÷");
      else if (e.key === "Enter" || e.key === "=") calculate();
      else if (e.key === "Escape") { reset(); onOpenChange(false); }
      else if (e.key === "Backspace") backspace();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, display, pendingOp, runningTotal, entries, historyOffset, waitingForOperand]);

  function inputDigit(d: string) {
    if (waitingForOperand) {
      setDisplay(d);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? d : display + d);
    }
  }

  function inputDecimal() {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes(".")) setDisplay(display + ".");
  }

  function backspace() {
    if (display.length === 1 || (display.length === 2 && display.startsWith("-"))) {
      setDisplay("0");
    } else {
      setDisplay(display.slice(0, -1));
    }
  }

  function compute(a: number, b: number, op: string): number {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function performOperation(nextOp: string) {
    const current = parseFloat(display);
    // If there's a pending op, apply it first
    let newTotal = runningTotal;
    let appliedOp = pendingOp;
    if (pendingOp !== null && !waitingForOperand) {
      newTotal = compute(runningTotal, current, pendingOp);
    } else if (pendingOp === null) {
      // First operation — total becomes the current value
      newTotal = current;
    }

    // Record this entry in history (op + value + resulting total)
    if (pendingOp !== null) {
      // We just applied `pendingOp` to `current`, producing `newTotal`
      const entry: Entry = {
        value: current,
        op: pendingOp,
        result: newTotal,
        timestamp: Date.now(),
      };
      setEntries((prev) => {
        const updated = [...prev, entry];
        // Scroll to show the latest 2 entries
        setHistoryOffset(Math.max(0, updated.length - 2));
        return updated;
      });
    } else {
      // First entry — record the starting value (op = "=", value = current, result = current)
      // Skip recording for the first op press — the entry is created when the next op is pressed
    }

    setRunningTotal(newTotal);
    setPendingOp(nextOp);
    setWaitingForOperand(true);
    // Show the running total in the display so the user sees the intermediate result
    setDisplay(Number.isFinite(newTotal) ? String(newTotal) : "Error");
  }

  function calculate() {
    if (pendingOp === null) return;
    const current = parseFloat(display);
    const result = compute(runningTotal, current, pendingOp);
    // Record the final entry
    const entry: Entry = {
      value: current,
      op: pendingOp,
      result,
      timestamp: Date.now(),
    };
    setEntries((prev) => {
      const updated = [...prev, entry];
      setHistoryOffset(Math.max(0, updated.length - 2));
      return updated;
    });
    setDisplay(Number.isFinite(result) ? String(result) : "Error");
    setRunningTotal(0);
    setPendingOp(null);
    setWaitingForOperand(true);
  }

  // Get the 2 visible history entries based on offset
  const visibleEntries = entries.slice(historyOffset, historyOffset + 2);
  // For display, show entries in chronological order (older at top, newer at bottom)
  const visibleEntriesDisplay = [...visibleEntries].reverse();

  const btnClass = "h-14 text-base font-medium rounded-lg border transition-colors";
  const numClass = "bg-card hover:bg-muted border-border";
  const opClass = "bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700";
  const eqClass = "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700";
  const clearClass = "bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v2.10.83: Calculator dialog — FIXED SIZE, cash-register style.
          - Width: 360px fixed (95vw on small screens)
          - Height: auto (calculated by content, never expands past viewport)
          - overflow-hidden: NOTHING escapes the dialog edges
          - flex flex-col: header + body + buttons stack vertically */}
      <DialogContent className="w-[360px] max-w-[95vw] p-0 overflow-hidden border-2 border-emerald-600 shadow-2xl flex flex-col" style={{ zIndex: 99999 }}>
        {/* Header bar */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <CalculatorIcon className="w-4 h-4" />
            <span className="text-sm font-bold">Calculator</span>
          </div>
          <span className="text-[10px] text-emerald-100">Ctrl+C / Esc</span>
        </div>

        <div className="p-3 space-y-2 flex-1 min-h-0">
          {/* ─── HISTORY WINDOW (top, shows last 2 entries) ───
              - Fixed height (2 lines)
              - Shows 2 entries at a time
              - ↑/↓ arrow keys scroll through history
              - Each entry: "op value = result" */}
          <div className="bg-muted/40 border border-muted rounded p-1.5 space-y-0.5 h-[60px] flex flex-col justify-center">
            <div className="flex items-center justify-between text-[9px] text-muted-foreground px-1">
              <span className="flex items-center gap-1">
                <ArrowUp className="w-2.5 h-2.5" />
                <ArrowDown className="w-2.5 h-2.5" />
                History ({entries.length} entries)
              </span>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => scrollHistory("up")}
                  disabled={entries.length === 0 || historyOffset >= Math.max(0, entries.length - 2)}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                  title="Show older entries (↑)"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollHistory("down")}
                  disabled={entries.length === 0 || historyOffset === 0}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                  title="Show newer entries (↓)"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center text-xs font-mono overflow-hidden">
              {entries.length === 0 ? (
                <div className="text-center text-muted-foreground/60 italic">No history yet</div>
              ) : visibleEntriesDisplay.length === 0 ? (
                <div className="text-center text-muted-foreground/60 italic">Scroll to see entries</div>
              ) : (
                visibleEntriesDisplay.map((e, i) => (
                  <div key={`${e.timestamp}-${i}`} className="flex justify-between items-center px-2">
                    <span className="text-muted-foreground">{e.op}</span>
                    <span className="font-medium">{e.value}</span>
                    <span className="text-muted-foreground text-[10px]">= {e.result}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── CURRENT INPUT DISPLAY (middle, large) ───
              - Fixed height (56px)
              - Shows the number being typed or intermediate result
              - overflow-x-auto for very long numbers (scrolls inside) */}
          <div className="text-right text-2xl font-mono font-bold bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-3 h-14 flex items-center justify-end overflow-x-auto overflow-y-hidden border border-emerald-200 whitespace-nowrap">
            {display}
          </div>

          {/* ─── RUNNING TOTAL (bottom, always visible) ───
              - Fixed height (40px)
              - Shows the running total (sum so far)
              - Always visible so the user sees the cumulative result */}
          <div className="bg-emerald-700 text-white rounded-lg p-2 h-10 flex items-center justify-between px-3">
            <span className="text-[10px] opacity-80 uppercase tracking-wide">Total</span>
            <span className="text-lg font-bold font-mono">
              {(pendingOp !== null ? runningTotal : (entries.length > 0 ? entries[entries.length - 1].result : 0)).toLocaleString()}
            </span>
          </div>

          {/* ─── BUTTONS GRID (4 columns, fixed) ─── */}
          <div className="grid grid-cols-4 gap-2">
            <button className={`${btnClass} ${clearClass}`} onClick={reset}>C</button>
            <button className={`${btnClass} ${opClass}`} onClick={() => backspace()}>⌫</button>
            <button className={`${btnClass} ${opClass}`} onClick={() => performOperation("÷")}>÷</button>
            <button className={`${btnClass} ${opClass}`} onClick={() => performOperation("×")}>×</button>

            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("7")}>7</button>
            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("8")}>8</button>
            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("9")}>9</button>
            <button className={`${btnClass} ${opClass}`} onClick={() => performOperation("-")}>−</button>

            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("4")}>4</button>
            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("5")}>5</button>
            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("6")}>6</button>
            <button className={`${btnClass} ${opClass}`} onClick={() => performOperation("+")}>+</button>

            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("1")}>1</button>
            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("2")}>2</button>
            <button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("3")}>3</button>
            <button className={`${btnClass} ${eqClass} row-span-2`} onClick={calculate}>=</button>

            <button className={`${btnClass} ${numClass} col-span-2`} onClick={() => inputDigit("0")}>0</button>
            <button className={`${btnClass} ${numClass}`} onClick={inputDecimal}>.</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
