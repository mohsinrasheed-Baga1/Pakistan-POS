"use client";

import * as React from "react";
import { Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GlobalCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global calculator dialog — can be opened from anywhere via F4.
 * Supports keyboard input (digits, +, -, *, /, Enter/=, Escape, Backspace).
 */
export function GlobalCalculator({ open, onOpenChange }: GlobalCalculatorProps) {
  const [display, setDisplay] = React.useState("0");
  const [previousValue, setPreviousValue] = React.useState<number | null>(null);
  const [operation, setOperation] = React.useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = React.useState(false);

  function reset() {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  }

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

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
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  }

  function clearAll() {
    reset();
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
      case "*": return a * b;
      case "/": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function performOperation(nextOp: string) {
    const current = parseFloat(display);
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
    setDisplay(Number.isFinite(result) ? String(result) : "Error");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  }

  // Keyboard support
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      const k = e.key;
      if (/^[0-9]$/.test(k)) { e.preventDefault(); inputDigit(k); return; }
      if (k === "." || k === ",") { e.preventDefault(); inputDecimal(); return; }
      if (k === "+" || k === "-") { e.preventDefault(); performOperation(k); return; }
      if (k === "*" || k === "x" || k === "X") { e.preventDefault(); performOperation("*"); return; }
      if (k === "/") { e.preventDefault(); performOperation("/"); return; }
      if (k === "Enter" || k === "=") { e.preventDefault(); calculate(); return; }
      if (k === "Escape") { e.preventDefault(); onOpenChange(false); return; }
      if (k === "Backspace") { e.preventDefault(); backspace(); return; }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, display, previousValue, operation, waitingForOperand]);

  const btnBase = "h-12 text-xl font-medium";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            Calculator
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted rounded-lg p-4 text-right">
            <div className="text-xs text-muted-foreground h-4 truncate">
              {previousValue !== null && operation ? `${previousValue} ${operation}` : ""}
            </div>
            <div className="text-3xl font-mono font-bold tracking-tight truncate">
              {display}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" className={btnBase} onClick={clearAll}>C</Button>
            <Button variant="outline" className={btnBase} onClick={backspace}>⌫</Button>
            <Button variant="outline" className={btnBase} onClick={() => performOperation("/")}>/</Button>
            <Button variant="outline" className={btnBase} onClick={() => performOperation("*")}>*</Button>

            <Button variant="outline" className={btnBase} onClick={() => inputDigit("7")}>7</Button>
            <Button variant="outline" className={btnBase} onClick={() => inputDigit("8")}>8</Button>
            <Button variant="outline" className={btnBase} onClick={() => inputDigit("9")}>9</Button>
            <Button variant="outline" className={btnBase} onClick={() => performOperation("-")}>-</Button>

            <Button variant="outline" className={btnBase} onClick={() => inputDigit("4")}>4</Button>
            <Button variant="outline" className={btnBase} onClick={() => inputDigit("5")}>5</Button>
            <Button variant="outline" className={btnBase} onClick={() => inputDigit("6")}>6</Button>
            <Button variant="outline" className={btnBase} onClick={() => performOperation("+")}>+</Button>

            <Button variant="outline" className={btnBase} onClick={() => inputDigit("1")}>1</Button>
            <Button variant="outline" className={btnBase} onClick={() => inputDigit("2")}>2</Button>
            <Button variant="outline" className={btnBase} onClick={() => inputDigit("3")}>3</Button>
            <Button className={`${btnBase} row-span-2 bg-emerald-600 hover:bg-emerald-700 text-white`} onClick={calculate}>=</Button>

            <Button variant="outline" className={`${btnBase} col-span-2`} onClick={() => inputDigit("0")}>0</Button>
            <Button variant="outline" className={btnBase} onClick={inputDecimal}>.</Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Keyboard: 0-9, +, -, *, /, Enter (=), Esc (close), Backspace
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
