"use client";

import * as React from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  X,
  Printer,
  CheckCircle2,
  Package,
  ScanBarcode,
  Banknote,
  CreditCard,
  Smartphone,
  RotateCcw,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useCartStore, useAppStore } from "@/stores/use-pos-store";
import { formatMoney, unitLabel, isLooseUnit } from "@/lib/pos-utils";
import type { Product, Category } from "@/types";
import { Receipt } from "@/components/pos/receipt";

interface PosViewProps {
  settings: any;
}

export function PosView({ settings }: PosViewProps) {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [q, setQ] = React.useState("");
  const [activeCat, setActiveCat] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [paidAmount, setPaidAmount] = React.useState("");
  const [lastSale, setLastSale] = React.useState<any>(null);
  const [scannedCard, setScannedCard] = React.useState<any>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [calcOpen, setCalcOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [qtyOpen, setQtyOpen] = React.useState(false);
  const [qtyProduct, setQtyProduct] = React.useState<Product | null>(null);
  const [qtyValue, setQtyValue] = React.useState("");

  const searchRef = React.useRef<HTMLInputElement>(null);
  const productGridRef = React.useRef<HTMLDivElement>(null);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);

  const cart = useCartStore();
  const { setView } = useAppStore();
  const currency = settings?.currency || "Rs";
  const taxEnabled = !!settings?.taxEnabled;
  const totals = cart.totals(taxEnabled);

  const loadProducts = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (activeCat) params.set("categoryId", activeCat);
      const res = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [q, activeCat]);

  const loadCategories = React.useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      const data = await res.json();
      setCategories(data.categories || []);
    } catch {}
  }, []);

  React.useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  React.useEffect(() => {
    const t = setTimeout(loadProducts, 200);
    return () => clearTimeout(t);
  }, [loadProducts]);

  function addToCart(product: Product, qty: number = 1) {
    if (!product.active) {
      toast.error("This product is inactive");
      return;
    }
    const existingItem = cart.items.find((i) => i.product.id === product.id);
    const currentInCart = existingItem ? existingItem.quantity : 0;

    // ─── Stock check ──────────────────────────────────────────────────────
    // A BOX product (has packBarcode set) has its stock counted in BOXES,
    // not pieces. So if box stock = 2, we can sell up to 2 boxes — even
    // though those 2 boxes contain 120 pieces.
    //
    // A PIECE product has its stock counted in PIECES. The check is a
    // straightforward "qty requested <= stock available".
    //
    // For loose items (kg, gram, litre, etc.) we skip the check entirely
    // — the shopkeeper can sell fractional amounts from a bulk bin.
    const isBoxProduct = !!product.packBarcode && product.packQuantity > 0;
    if (!isLooseUnit(product.unit)) {
      if (isBoxProduct) {
        // Box product: stock is in boxes. Check box count directly.
        if (currentInCart + qty > product.stock) {
          toast.error(`Low stock! Only ${product.stock} boxes available`);
          return;
        }
      } else {
        // Piece product: stock is in pieces. Check piece count.
        if (currentInCart + qty > product.stock) {
          toast.error(`Low stock! Only ${product.stock} ${unitLabel(product.unit)} available`);
          return;
        }
      }
    }
    cart.addItem(product, qty);
    // After adding, clear search and refocus for next product
    setQ("");
    setHighlightedIndex(0);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  // Open quantity prompt dialog before adding product to cart
  function promptQuantity(product: Product) {
    setQtyProduct(product);
    setQtyValue("1");
    setQtyOpen(true);
    setTimeout(() => qtyInputRef.current?.select(), 100);
  }

  // Confirm quantity and add to cart
  function confirmQuantity() {
    if (!qtyProduct) return;
    const qty = parseFloat(qtyValue);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    addToCart(qtyProduct, qty);
    setQtyOpen(false);
    setQtyProduct(null);
    setQtyValue("");
    setTimeout(() => searchRef.current?.focus(), 100);
  }

  // Handle scanned barcode — look up product/card and take action
  // Guard: prevent concurrent execution (scanner may fire twice before first completes)
  const scanningRef = React.useRef(false);
  const lastScanResultRef = React.useRef<string | null>(null);

  async function handleScannedCode(code: string) {
    // Prevent double execution
    if (scanningRef.current) return;
    scanningRef.current = true;
    lastScanResultRef.current = code; // Mark that a scan is in progress

    try {
      const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.found && data.kind === "product" && data.product) {
        const product = data.product as Product;
        if (data.isPack && product.packQuantity > 0) {
          // ─── BOX SCAN ────────────────────────────────────────────────────
          // The scanned barcode matched a BOX product (a product whose
          // packBarcode is set). We add the BOX product to the cart.
          //
          // The box product's own salePrice IS the box price (set when the
          // product was created via the wizard). We do NOT override it with
          // packPrice here — packPrice and salePrice should already be the
          // same value, but using salePrice directly is more correct.
          //
          // Stock check: the box product's stock is counted in BOXES, so
          // adding 1 box to cart requires box stock >= 1.
          const existingItem = cart.items.find((i) => i.product.id === product.id);
          const currentInCart = existingItem ? existingItem.quantity : 0;
          if (!isLooseUnit(product.unit) && currentInCart + 1 > product.stock) {
            toast.error(`Low stock! Only ${product.stock} boxes available`);
          } else {
            cart.addItem(product, 1);
            toast.success(`Box: ${product.name} (${product.packQuantity} pcs)`);
          }
        } else {
          // ─── PIECE SCAN — show quantity prompt ───────────────────────────
          setQtyProduct(product);
          setQtyValue("1");
          setQtyOpen(true);
          setTimeout(() => qtyInputRef.current?.select(), 100);
        }
      } else if (data.found && data.kind === "card" && data.card) {
        toast.success(`Shop Card: ${data.card.name} — ${data.card.type === "SHOP_KEEPER" ? "Shopkeeper" : data.card.type === "WHOLESALE" ? "Wholesale" : "Regular"} mode`);
        const cardType = data.card.type;
        if (cardType === "SHOP_KEEPER") {
          cart.setSaleType("SHOPKEEPER");
        } else {
          cart.setSaleType(cardType === "WHOLESALE" ? "WHOLESALE" : "RETAIL");
        }
        setScannedCard(data.card);
      } else {
        toast.warning(`Unknown barcode: ${code}`);
      }
    } catch {
      toast.error("Scan lookup failed");
    } finally {
      // Release locks after 800ms to allow next scan
      setTimeout(() => {
        scanningRef.current = false;
        lastScanResultRef.current = null;
      }, 800);
    }
  }

  useBarcodeScanner(handleScannedCode);

  // Auto-focus search bar on mount
  React.useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Auto-focus search bar after dialogs close
  React.useEffect(() => {
    if (!checkoutOpen && !receiptOpen && !returnOpen && !calcOpen && !qtyOpen) {
      const t = setTimeout(() => searchRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [checkoutOpen, receiptOpen, returnOpen, calcOpen, qtyOpen]);

  // Scroll highlighted product into view
  React.useEffect(() => {
    const el = document.querySelector(`[data-product-idx="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedIndex]);

  // Keyboard shortcuts: arrow keys + Enter + F-keys
  React.useEffect(() => {
    function handlePosKey(e: KeyboardEvent) {
      if (returnOpen || calcOpen || receiptOpen) return;
      if (qtyOpen) return;
      const active = document.activeElement;
      const isSearchFocused = active === searchRef.current;

      // Arrow key navigation through products
      if (isSearchFocused || (!active || active.tagName !== "INPUT")) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((p) => Math.min(p + 1, products.length - 1));
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((p) => Math.max(p - 1, 0));
          return;
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setHighlightedIndex((p) => Math.min(p + 4, products.length - 1));
          return;
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setHighlightedIndex((p) => Math.max(p - 4, 0));
          return;
        } else if (e.key === "Enter" && products.length > 0 && isSearchFocused) {
          // CRITICAL: Don't add highlighted product if a scan is in progress
          // (scanner's Enter also triggers this — causes double-add)
          if (scanningRef.current || lastScanResultRef.current) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          const product = products[highlightedIndex];
          if (product) promptQuantity(product);
          return;
        }
      }

      // Space key triggers checkout (when search input is empty and cart has items)
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (cart.items.length > 0) {
          if (scannedCard) {
            handleCheckout();
          } else {
            setCheckoutOpen(true);
          }
        }
        return;
      }

      // Function keys
      if (e.key === "F2") { e.preventDefault(); setCheckoutOpen(true); }
      else if (e.key === "F3") { e.preventDefault(); setReturnOpen(true); }
      else if (e.key === "F4") { e.preventDefault(); setCalcOpen(true); }
      else if (e.key === "F9") { e.preventDefault(); cart.setSaleType(cart.saleType === "RETAIL" ? "WHOLESALE" : cart.saleType === "WHOLESALE" ? "SHOPKEEPER" : "RETAIL"); }
      else if (e.key === "F12") { e.preventDefault(); cart.clear(); setScannedCard(null); toast.success("Cart cleared"); setTimeout(() => searchRef.current?.focus(), 50); }
      else if (e.key === "Escape") { setQ(""); setHighlightedIndex(0); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", handlePosKey);
    return () => window.removeEventListener("keydown", handlePosKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.saleType, returnOpen, calcOpen, checkoutOpen, receiptOpen, products, highlightedIndex]);

  async function handleCheckout() {
    if (cart.items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        items: cart.items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          price: cart.saleType === "WHOLESALE" && i.product.wholesalePrice > 0
            ? i.product.wholesalePrice
            : cart.saleType === "SHOPKEEPER" && i.product.shopkeeperPrice > 0
            ? i.product.shopkeeperPrice
            : i.product.salePrice,
        })),
        discount: cart.discount,
        paidAmount: Number(paidAmount) || totals.total,
        paymentMethod: cart.paymentMethod,
        saleType: cart.saleType,
        cardId: scannedCard?.id || null,
        customerName: cart.customerName,
        customerPhone: cart.customerPhone,
        invoicePrefix: settings?.invoicePrefix || "INV",
      };
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Try to parse JSON even if the response is not ok — the new sales
      // API returns the actual error message in { error, code, meta }.
      let data: any;
      try {
        data = await res.json();
      } catch {
        // Response was not JSON (rare — server crash). Show a helpful
        // message telling the user to check the DB diagnose endpoint.
        toast.error(`Server returned status ${res.status}. Try restarting the app, or run DB Diagnose from Settings.`);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        // Build a user-friendly error message from the server response.
        // The sales API now returns { error, code, detail } for schema
        // errors and other failures.
        let errMsg = data.error || "Sale failed";
        // If this looks like a database schema error, suggest running the
        // DB repair endpoint.
        if (
          typeof errMsg === "string" &&
          (errMsg.toLowerCase().includes("does not exist") ||
            errMsg.toLowerCase().includes("no such column") ||
            errMsg.toLowerCase().includes("no such table") ||
            errMsg.toLowerCase().includes("schema"))
        ) {
          errMsg = `${errMsg}\n\nPlease go to Settings → DB Repair, or visit /api/db-diagnose to fix the database.`;
        }
        toast.error(errMsg, { duration: 8000 });
        setSubmitting(false);
        return;
      }
      setLastSale(data.sale);
      setReceiptOpen(true);
      setCheckoutOpen(false);
      cart.clear();
      setScannedCard(null);
      setPaidAmount("");
      toast.success("Sale completed!");
      loadProducts();
    } catch (e: any) {
      // True network error (server unreachable, DNS failure, etc.)
      toast.error(`Network error: ${e.message || "Could not reach server"}`);
    } finally {
      setSubmitting(false);
    }
  }

  const change = Math.max(
    0,
    (Number(paidAmount) || 0) - totals.total
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            Sell (POS)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select products or scan a barcode
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 3-way price toggle: Retail / Wholesale / Shopkeeper */}
          <div className="flex rounded-lg border-2 overflow-hidden shadow-sm">
            <button
              onClick={() => cart.setSaleType("RETAIL")}
              className={`px-4 py-2 text-sm font-bold transition-all ${
                cart.saleType === "RETAIL"
                  ? "bg-emerald-600 text-white shadow-inner"
                  : "bg-background hover:bg-emerald-50 text-emerald-700"
              }`}
            >
              Regular
            </button>
            <button
              onClick={() => cart.setSaleType("WHOLESALE")}
              className={`px-4 py-2 text-sm font-bold transition-all border-l-2 ${
                cart.saleType === "WHOLESALE"
                  ? "bg-amber-500 text-white shadow-inner"
                  : "bg-background hover:bg-amber-50 text-amber-700"
              }`}
            >
              Wholesale
            </button>
            <button
              onClick={() => cart.setSaleType("SHOPKEEPER")}
              className={`px-4 py-2 text-sm font-bold transition-all border-l-2 ${
                cart.saleType === "SHOPKEEPER"
                  ? "bg-purple-600 text-white shadow-inner"
                  : "bg-background hover:bg-purple-50 text-purple-700"
              }`}
            >
              Shopkeeper
            </button>
          </div>
          <Button
            variant="outline"
            onClick={() => setView("scanner")}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <ScanBarcode className="w-4 h-4 mr-2" /> Scanner
          </Button>
          <Button
            variant="outline"
            onClick={() => setReturnOpen(true)}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <RotateCcw className="w-4 h-4 mr-2" /> Return
          </Button>
          <Button
            variant="outline"
            onClick={() => setCalcOpen(true)}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <Calculator className="w-4 h-4 mr-2" /> Calculator
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Products section */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search by name or barcode... (↑↓ navigate, Enter add, Space checkout)"
              value={q}
              onChange={(e) => { setQ(e.target.value); setHighlightedIndex(0); }}
              className="pl-10 h-11"
            />
          </div>

          {/* category chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCat("")}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                activeCat === ""
                  ? "bg-emerald-600 text-white"
                  : "bg-muted hover:bg-muted/70"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeCat === c.id
                    ? "bg-emerald-600 text-white"
                    : "bg-muted hover:bg-muted/70"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {loading ? (
            <ScrollArea className="h-[calc(100vh-280px)] pr-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-32 rounded-xl bg-muted animate-pulse"
                  />
                ))}
              </div>
            </ScrollArea>
          ) : products.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                No products found
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)] pr-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {products.map((p, idx) => (
                <button
                  key={p.id}
                  data-product-idx={idx}
                  onClick={() => promptQuantity(p)}
                  disabled={!p.active}
                  className={`group text-left bg-card rounded-xl border p-2 transition-all disabled:opacity-50 ${
                    idx === highlightedIndex
                      ? "border-emerald-500 ring-2 ring-emerald-400 shadow-md"
                      : "hover:border-emerald-400 hover:shadow-md"
                  }`}
                >
                  <div className="aspect-square rounded-lg bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center mb-1.5 overflow-hidden">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-6 h-6 text-emerald-600/50" />
                    )}
                  </div>
                  <div className="font-medium text-xs line-clamp-2 min-h-[2rem] leading-tight">
                    {p.name}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-emerald-700 font-bold text-sm">
                      {formatMoney(
                        cart.saleType === "WHOLESALE" && p.wholesalePrice > 0
                          ? p.wholesalePrice
                          : cart.saleType === "SHOPKEEPER" && p.shopkeeperPrice > 0
                          ? p.shopkeeperPrice
                          : p.salePrice,
                        currency
                      )}
                      {cart.saleType === "WHOLESALE" && p.wholesalePrice > 0 && (
                        <span className="ml-1 text-[10px] text-amber-600">W</span>
                      )}
                      {cart.saleType === "SHOPKEEPER" && p.shopkeeperPrice > 0 && (
                        <span className="ml-1 text-[10px] text-purple-600">S</span>
                      )}
                    </span>
                    <span
                      className={`text-xs ${
                        p.stock <= 0
                          ? "text-red-500"
                          : p.stock <= p.minStock
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {p.stock} {unitLabel(p.unit)}
                    </span>
                  </div>
                </button>
              ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Cart section */}
        <div className="lg:sticky lg:top-4 h-fit">
          <Card className="border-emerald-100">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-emerald-600" />
                  Cart
                  {totals.itemCount > 0 && (
                    <Badge className="bg-emerald-600">{totals.itemCount}</Badge>
                  )}
                </h2>
                {cart.items.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => cart.clear()}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Clear
                  </Button>
                )}
              </div>

              {cart.items.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Cart is empty
                </div>
              ) : (
                <>
                  <ScrollArea className="h-[40vh] pr-2">
                    <div className="space-y-2">
                      {cart.items.map((item) => {
                        // Per-unit price based on sale type
                        const unitPrice =
                          cart.saleType === "WHOLESALE" && item.product.wholesalePrice > 0
                            ? item.product.wholesalePrice
                            : cart.saleType === "SHOPKEEPER" && item.product.shopkeeperPrice > 0
                            ? item.product.shopkeeperPrice
                            : item.product.salePrice;
                        const lineTotal = unitPrice * item.quantity;
                        return (
                          <div
                            key={item.product.id}
                            className="rounded-lg border p-2 bg-background space-y-1"
                          >
                            {/* Top row: product name (left, truncate) + remove button (right) */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-medium leading-tight line-clamp-2 min-w-0 flex-1" title={item.product.name}>
                                {item.product.name}
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-600 hover:bg-red-50 flex-shrink-0"
                                onClick={() => cart.removeItem(item.product.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            {/* Bottom row: unit price (always visible, left) + qty controls (middle) + line total (right, always visible) */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {formatMoney(unitPrice, currency)} / {unitLabel(item.product.unit)}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    cart.setQty(
                                      item.product.id,
                                      item.quantity - (isLooseUnit(item.product.unit) ? 0.5 : 1)
                                    )
                                  }
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <Input
                                  className="h-6 w-12 text-center px-1 text-xs"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (!isNaN(v))
                                      cart.setQty(item.product.id, v);
                                  }}
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    cart.setQty(
                                      item.product.id,
                                      item.quantity + (isLooseUnit(item.product.unit) ? 0.5 : 1)
                                    )
                                  }
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                              <div className="text-sm font-bold text-emerald-700 whitespace-nowrap flex-shrink-0 text-right">
                                {formatMoney(lineTotal, currency)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <Separator />

                  {/* linked shop card */}
                  {scannedCard && (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-600" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{scannedCard.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {scannedCard.cardNumber} • {scannedCard.type === "SHOP_KEEPER" ? "Shopkeeper" : scannedCard.type === "WHOLESALE" ? "Wholesale" : "Regular"}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setScannedCard(null);
                          cart.setSaleType("RETAIL");
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {/* customer */}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Customer name"
                      value={cart.customerName}
                      onChange={(e) =>
                        cart.setCustomer(e.target.value, cart.customerPhone)
                      }
                      className="h-9 text-sm"
                    />
                    <Input
                      placeholder="Phone"
                      value={cart.customerPhone}
                      onChange={(e) =>
                        cart.setCustomer(cart.customerName, e.target.value)
                      }
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* discount */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Discount</Label>
                    <Input
                      type="number"
                      value={cart.discount || ""}
                      onChange={(e) =>
                        cart.setDiscount(Number(e.target.value) || 0)
                      }
                      className="h-9"
                    />
                  </div>

                  {/* totals */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatMoney(totals.subtotal, currency)}</span>
                    </div>
                    {taxEnabled && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax</span>
                        <span>{formatMoney(totals.taxTotal, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span>-{formatMoney(totals.discount, currency)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span className="text-emerald-700">
                        {formatMoney(totals.total, currency)}
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 h-11"
                    onClick={() => {
                      // If card linked, direct checkout (no payment dialog)
                      if (scannedCard) {
                        handleCheckout();
                      } else {
                        setCheckoutOpen(true);
                      }
                    }}
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Checkout
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quantity Prompt Dialog */}
      <Dialog open={qtyOpen} onOpenChange={(v) => { if (!v) { setQtyOpen(false); setQtyProduct(null); setTimeout(() => searchRef.current?.focus(), 100); } }}>
        <DialogContent className="max-w-xs" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-lg">Enter Quantity</DialogTitle>
            <DialogDescription className="text-sm">
              {qtyProduct?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-sm text-muted-foreground">Price per {qtyProduct ? unitLabel(qtyProduct.unit) : "unit"}</div>
              <div className="text-2xl font-bold text-emerald-700">
                {formatMoney(
                  qtyProduct
                    ? (cart.saleType === "WHOLESALE" && qtyProduct.wholesalePrice > 0
                      ? qtyProduct.wholesalePrice
                      : cart.saleType === "SHOPKEEPER" && qtyProduct.shopkeeperPrice > 0
                      ? qtyProduct.shopkeeperPrice
                      : qtyProduct.salePrice)
                    : 0,
                  currency
                )}
              </div>
            </div>
            <Input
              ref={qtyInputRef}
              type="number"
              min="0"
              step={qtyProduct && isLooseUnit(qtyProduct.unit) ? "0.5" : "1"}
              value={qtyValue}
              onChange={(e) => setQtyValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmQuantity();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setQtyOpen(false);
                  setQtyProduct(null);
                  setTimeout(() => searchRef.current?.focus(), 100);
                }
              }}
              autoFocus
              className="h-14 text-2xl text-center font-mono"
            />
            <div className="text-xs text-center text-muted-foreground">
              Press Enter to add • Escape to cancel
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-emerald-50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground">Total Bill</div>
              <div className="text-3xl font-bold text-emerald-700">
                {formatMoney(totals.total, currency)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "CASH", label: "Cash", icon: Banknote },
                { v: "CARD", label: "Card", icon: CreditCard },
                { v: "MOBILE", label: "Mobile", icon: Smartphone },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.v}
                    onClick={() => cart.setPaymentMethod(m.v as any)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-lg border-2 transition-colors ${
                      cart.paymentMethod === m.v
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Amount Received</Label>
              <Input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={totals.total.toString()}
                className="h-12 text-lg text-left"
                autoFocus
              />
            </div>

            {Number(paidAmount) > 0 && (
              <div className="flex justify-between items-center bg-amber-50 rounded-lg p-3">
                <span className="text-sm font-medium">Change</span>
                <span className="text-xl font-bold text-amber-700">
                  {formatMoney(change, currency)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 2000, 5000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setPaidAmount(amt.toString())}
                >
                  {amt}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCheckout}
              disabled={submitting}
            >
              {submitting ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Receipt
        sale={lastSale}
        settings={settings}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />

      {/* Return / Refund dialog */}
      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        currency={currency}
        onReturned={() => loadProducts()}
      />

      {/* Calculator dialog */}
      <CalculatorDialog open={calcOpen} onOpenChange={setCalcOpen} />
    </div>
  );
}

/* ----------------------------- Return Dialog ----------------------------- */

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onReturned?: () => void;
}

function ReturnDialog({
  open,
  onOpenChange,
  currency,
  onReturned,
}: ReturnDialogProps) {
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [sale, setSale] = React.useState<any>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [returning, setReturning] = React.useState(false);

  function reset() {
    setInvoiceNo("");
    setSale(null);
    setNotFound(false);
    setSearching(false);
    setReturning(false);
  }

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function findSale() {
    const q = invoiceNo.trim();
    if (!q) {
      toast.error("Enter an invoice number");
      return;
    }
    setSearching(true);
    setSale(null);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/sales?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const list: any[] = data.sales || [];
      const needle = q.toLowerCase();
      const match =
        list.find((s) => s.invoiceNo === q) ||
        list.find((s) => s.invoiceNo?.toLowerCase() === needle) ||
        list.find((s) => s.invoiceNo?.toLowerCase().includes(needle));
      if (match) {
        setSale(match);
      } else {
        setNotFound(true);
      }
    } catch {
      toast.error("Failed to search sales");
    } finally {
      setSearching(false);
    }
  }

  async function returnAll() {
    if (!sale) return;
    setReturning(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "POS return" }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.error || "").toLowerCase();
        if (msg.includes("already")) {
          toast.error("This sale has already been returned");
          // refresh sale state to reflect RETURNED
          setSale({ ...sale, status: "RETURNED" });
        } else {
          toast.error(data.error || "Return failed");
        }
        setReturning(false);
        return;
      }
      toast.success("Sale returned successfully. Items restocked.");
      onReturned?.();
      onOpenChange(false);
    } catch {
      toast.error("Network error");
    } finally {
      setReturning(false);
    }
  }

  const alreadyReturned = sale?.status === "RETURNED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Return / Refund Sale</DialogTitle>
          <DialogDescription>
            Scan the receipt barcode OR enter the invoice number
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="return-invoice">
              Invoice Number or Scan Receipt Barcode
            </Label>
            <div className="flex gap-2">
              <Input
                id="return-invoice"
                data-barcode-input="true"
                placeholder="e.g. INV-20250115-0001"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") findSale();
                }}
                autoFocus
              />
              <Button
                onClick={findSale}
                disabled={searching}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {searching ? "Searching..." : "Find Sale"}
              </Button>
            </div>
          </div>

          {notFound && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No sale found with this invoice number
            </div>
          )}

          {sale && (
            <div className="space-y-3">
              {alreadyReturned && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  This sale has already been returned
                </div>
              )}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Invoice</div>
                    <div className="font-semibold">{sale.invoiceNo}</div>
                  </div>
                  <Badge variant={alreadyReturned ? "destructive" : "secondary"}>
                    {sale.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(sale.createdAt).toLocaleString()}
                </div>
                {sale.customerName && (
                  <div className="text-sm">
                    Customer: {sale.customerName}
                  </div>
                )}
                {sale.paymentMethod && (
                  <div className="text-xs text-muted-foreground">
                    Payment: {sale.paymentMethod}
                  </div>
                )}
                <Separator />
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {(sale.items || []).map((it: any) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between text-sm gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{it.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.quantity} {unitLabel(it.unit)} ×{" "}
                          {formatMoney(it.price, currency)}
                        </div>
                      </div>
                      <div className="font-medium whitespace-nowrap">
                        {formatMoney(it.lineTotal, currency)}
                      </div>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-emerald-700">
                    {formatMoney(sale.total, currency)}
                  </span>
                </div>
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={returnAll}
                disabled={returning || alreadyReturned}
              >
                {returning ? "Processing..." : "Return All Items"}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={returning || searching}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Calculator Dialog --------------------------- */

interface CalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CalculatorDialog({ open, onOpenChange }: CalculatorDialogProps) {
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

  // Keyboard support for calculator
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key >= "0" && e.key <= "9") inputDigit(e.key);
      else if (e.key === ".") inputDecimal();
      else if (e.key === "+") performOperation("+");
      else if (e.key === "-") performOperation("-");
      else if (e.key === "*") performOperation("*");
      else if (e.key === "/") performOperation("/");
      else if (e.key === "Enter" || e.key === "=") calculate();
      else if (e.key === "Escape") clearAll();
      else if (e.key === "Backspace") backspace();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, display, previousValue, operation, waitingForOperand]);

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
    if (
      display.length === 1 ||
      (display.length === 2 && display.startsWith("-"))
    ) {
      setDisplay("0");
    } else {
      setDisplay(display.slice(0, -1));
    }
  }

  function compute(a: number, b: number, op: string): number {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return b === 0 ? NaN : a / b;
      default:
        return b;
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

  const btnBase = "h-12 text-xl font-medium";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Calculator</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted rounded-lg p-4 text-right">
            <div className="text-xs text-muted-foreground h-4 truncate">
              {previousValue !== null && operation
                ? `${previousValue} ${operation}`
                : ""}
            </div>
            <div className="text-3xl font-mono font-bold tracking-tight truncate">
              {display}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Button
              variant="outline"
              className={btnBase}
              onClick={clearAll}
            >
              C
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={backspace}
            >
              ⌫
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => performOperation("/")}
            >
              /
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => performOperation("*")}
            >
              *
            </Button>

            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("7")}
            >
              7
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("8")}
            >
              8
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("9")}
            >
              9
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => performOperation("-")}
            >
              -
            </Button>

            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("4")}
            >
              4
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("5")}
            >
              5
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("6")}
            >
              6
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => performOperation("+")}
            >
              +
            </Button>

            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("1")}
            >
              1
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("2")}
            >
              2
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={() => inputDigit("3")}
            >
              3
            </Button>
            <Button
              className={`${btnBase} row-span-2 bg-emerald-600 hover:bg-emerald-700 text-white`}
              onClick={calculate}
            >
              =
            </Button>

            <Button
              variant="outline"
              className={`${btnBase} col-span-2`}
              onClick={() => inputDigit("0")}
            >
              0
            </Button>
            <Button
              variant="outline"
              className={btnBase}
              onClick={inputDecimal}
            >
              .
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
