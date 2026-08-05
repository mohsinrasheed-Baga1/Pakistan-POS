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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

  const btnClass = "h-12 text-lg font-medium rounded-lg border transition-colors";
  const numClass = "bg-card hover:bg-muted border-border";
  const opClass = "bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700";
  const eqClass = "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700";
  const clearClass = "bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center">Calculator — کنٹرول + سی</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {/* History line */}
          <div className="text-right text-xs text-muted-foreground min-h-[16px] font-mono truncate">
            {history || "\u00A0"}
          </div>
          {/* Display */}
          <div className="text-right text-3xl font-mono font-bold bg-muted rounded-lg p-3 min-h-[56px] flex items-center justify-end overflow-hidden">
            {display}
          </div>
          {/* Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            <Button className={`${btnClass} ${clearClass}`} onClick={reset}>C</Button>
            <Button className={`${btnClass} ${opClass}`} onClick={() => backspace()}>⌫</Button>
            <Button className={`${btnClass} ${opClass}`} onClick={() => performOperation("÷")}>÷</Button>
            <Button className={`${btnClass} ${opClass}`} onClick={() => performOperation("×")}>×</Button>

            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("7")}>7</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("8")}>8</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("9")}>9</Button>
            <Button className={`${btnClass} ${opClass}`} onClick={() => performOperation("-")}>−</Button>

            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("4")}>4</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("5")}>5</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("6")}>6</Button>
            <Button className={`${btnClass} ${opClass}`} onClick={() => performOperation("+")}>+</Button>

            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("1")}>1</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("2")}>2</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={() => inputDigit("3")}>3</Button>
            <Button className={`${btnClass} ${eqClass} row-span-2`} onClick={calculate}>=</Button>

            <Button className={`${btnClass} ${numClass} col-span-2`} onClick={() => inputDigit("0")}>0</Button>
            <Button className={`${btnClass} ${numClass}`} onClick={inputDecimal}>.</Button>
          </div>
          <div className="text-[10px] text-center text-muted-foreground">
            Ctrl+C again or Esc to close • Enter = calculate
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
