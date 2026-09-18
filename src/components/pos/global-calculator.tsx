"use client";

/**
 * Global Calculator Dialog
 * ─────────────────────────────────────────────────────────────────────────────
 * A simple calculator that opens with Ctrl+C on ANY page.
 * Supports: +, -, ×, ÷, history display, keyboard input.
 *
 * This is separate from the POS-specific calculator to avoid circular imports.
 */

import * as React from "react";
import { Calculator as CalculatorIcon } from "lucide-react";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";

interface GlobalCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalCalculator({ open, onOpenChange }: GlobalCalculatorProps) {
  const [display, setDisplay] = React.useState("0");
  const [previousValue, setPreviousValue] = React.useState<number | null>(null);
  const [operation, setOperation] = React.useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = React.useState(false);
  const [history, setHistory] = React.useState<string>("");

  function reset() {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
    setHistory("");
  }

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

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
  }, [open, display, previousValue, operation, waitingForOperand, history]);

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
    if (history === "") {
      setHistory(`${current} ${nextOp}`);
    } else {
      setHistory(`${history} ${current} ${nextOp}`);
    }
    if (previousValue === null) {
      setPreviousValue(current);
    } else if (operation && !waitingForOperand) {
      const result = compute(previousValue, current, operation);
      setDisplay(Number.isFinite(result) ? String(result) : "Error");
      setPreviousValue(Number.isFinite(result) ? result : null);
    }
    setWaitingForOperand(true);
    setOperation(nextOp);
  }

  function calculate() {
    if (operation === null || previousValue === null) return;
    const current = parseFloat(display);
    const result = compute(previousValue, current, operation);
    setHistory(`${history} ${current} =`);
    setDisplay(Number.isFinite(result) ? String(result) : "Error");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  }

  // v2.10.80: Slightly taller buttons (h-14 instead of h-12) for better
  // touch targets. Also using text-base instead of text-lg so button labels
  // don't get squeezed on narrower viewports.
  const btnClass = "h-14 text-base font-medium rounded-lg border transition-colors";
  const numClass = "bg-card hover:bg-muted border-border";
  const opClass = "bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700";
  const eqClass = "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700";
  const clearClass = "bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v2.10.80: Calculator dialog — wider (max-w-sm instead of max-w-xs)
          to prevent buttons being cut off on the right edge.
          Also: removed `overflow-hidden` so any overflow is visible
          instead of being silently clipped (which was making the
          operator column *, -, +, = look broken). */}
      <DialogContent className="w-[360px] max-w-[92vw] p-0 overflow-visible border-2 border-emerald-600 shadow-2xl" style={{ zIndex: 99999 }}>
        {/* Header bar — emerald gradient */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-3 flex items-center justify-between rounded-t-lg">
          <div className="flex items-center gap-2 text-white">
            <CalculatorIcon className="w-4 h-4" />
            <span className="text-sm font-bold">Calculator</span>
          </div>
          <span className="text-[10px] text-emerald-100">Ctrl+C / Esc to close</span>
        </div>

        <div className="p-3 space-y-2">
          {/* History line — allow wrapping instead of truncate so long
              expressions don't push the layout */}
          <div className="text-right text-xs text-muted-foreground min-h-[16px] font-mono px-1 break-words">
            {history || "\u00A0"}
          </div>
          {/* Display — large, prominent */}
          <div className="text-right text-2xl font-mono font-bold bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-3 min-h-[56px] flex items-center justify-end overflow-hidden border border-emerald-200 break-all">
            {display}
          </div>
          {/* Buttons — professional grid (4 columns)
              v2.10.80: Wider buttons (h-14 instead of h-12) and gap-2
              instead of gap-1.5 for better touch targets and spacing. */}
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
