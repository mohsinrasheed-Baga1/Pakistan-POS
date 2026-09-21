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
  // v2.10.86: Now showing ONE entry at a time (was 2).
  // - "up" = show OLDER entry → increase offset (towards length-1)
  // - "down" = show NEWER entry → decrease offset (towards 0)
  // Wait — we want newest to be the default. So offset=length-1 = newest.
  // "up" arrow should go to OLDER = decrease offset.
  // "down" arrow should go to NEWER = increase offset.
  // Let me re-check the keyboard mapping in the keyboard handler:
  //   if (e.key === "ArrowUp") scrollHistory("up");
  //   if (e.key === "ArrowDown") scrollHistory("down");
  // In a calculator tape, ↑ means "go up to see older entries".
  // So "up" → older → decrease offset.
  // "down" → newer → increase offset.
  function scrollHistory(direction: "up" | "down") {
    if (entries.length === 0) return;
    if (direction === "up") {
      // Show older entries — decrease offset (but not below 0)
      setHistoryOffset((prev) => Math.max(prev - 1, 0));
    } else {
      // Show newer entries — increase offset (but not above length-1)
      setHistoryOffset((prev) => Math.min(prev + 1, entries.length - 1));
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
        // v2.10.86: Show the LATEST entry (offset = length-1)
        setHistoryOffset(Math.max(0, updated.length - 1));
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
      // v2.10.86: Show the LATEST entry (offset = length-1)
      setHistoryOffset(Math.max(0, updated.length - 1));
      return updated;
    });
    setDisplay(Number.isFinite(result) ? String(result) : "Error");
    setRunningTotal(0);
    setPendingOp(null);
    setWaitingForOperand(true);
  }

  // v2.10.86: No longer needed — we show ONE entry at a time
  // (using entries[historyOffset] directly in the JSX)

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
          {/* ─── HISTORY DISPLAY (top, shows ONE entry at a time, BIG) ───
              v2.10.86: REDESIGNED per user spec — show only ONE entry at
              a time (big), use ↑/↓ arrow keys to navigate through history.
              Like a normal calculator's history check feature.
              - Shows the entry: "op value = result" (e.g., "+ 524 = 51928")
              - ↑ arrow: show previous (older) entry
              - ↓ arrow: show next (newer) entry
              - Navigation wraps around if at end of history
              - Empty state: "No history yet" */}
          <div className="bg-muted/40 border border-muted rounded p-2 space-y-1 h-[80px] flex flex-col justify-center">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span className="flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                <ArrowDown className="w-3 h-3" />
                History ({entries.length} {entries.length === 1 ? "entry" : "entries"})
              </span>
              <span className="text-[10px]">
                {entries.length > 0
                  ? `Showing ${historyOffset + 1} of ${entries.length}`
                  : ""}
              </span>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => scrollHistory("up")}
                  disabled={entries.length === 0}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30"
                  title="Previous entry (↑)"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollHistory("down")}
                  disabled={entries.length === 0}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30"
                  title="Next entry (↓)"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Show ONE entry BIG (centered) */}
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              {entries.length === 0 ? (
                <span className="text-sm text-muted-foreground/60 italic">
                  No history yet — start calculating
                </span>
              ) : (() => {
                // Get the entry at the current offset
                // We store entries oldest→newest. historyOffset=0 means
                // we're showing the OLDEST entry. To show the LATEST by
                // default, we set offset = length-1 initially.
                // But scrollHistory("up") increases offset (showing older),
                // and scrollHistory("down") decreases offset (showing newer).
                // So if offset = length-1, we're showing the newest.
                // If offset = 0, we're showing the oldest.
                const entry = entries[historyOffset];
                if (!entry) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                  <div className="text-center w-full">
                    {/* BIG entry display */}
                    <div className="text-xl font-bold font-mono text-foreground">
                      <span className="text-muted-foreground mr-1">{entry.op}</span>
                      <span>{entry.value}</span>
                    </div>
                    {/* Running result after this entry */}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      = <span className="font-bold text-emerald-700">{entry.result.toLocaleString()}</span>
                    </div>
                    {/* Timestamp */}
                    <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                      {new Date(entry.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ─── CURRENT INPUT DISPLAY (middle, large) ─── */}
          <div className="text-right text-2xl font-mono font-bold bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-3 h-14 flex items-center justify-end overflow-x-auto overflow-y-hidden border border-emerald-200 whitespace-nowrap">
            {display}
          </div>

          {/* ─── RUNNING TOTAL (bottom, always visible) ─── */}
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
