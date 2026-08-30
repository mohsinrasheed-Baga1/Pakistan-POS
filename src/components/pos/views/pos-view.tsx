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
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useBarcodeSettings } from "@/hooks/use-barcode-settings";
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
  const [cardLastTxn, setCardLastTxn] = React.useState<any>(null);
  const [cardSearch, setCardSearch] = React.useState("");
  const [cardSearchResults, setCardSearchResults] = React.useState<any[]>([]);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [calcOpen, setCalcOpen] = React.useState(false);
  // -1 means NO product is highlighted. Only after the user starts typing
  // in the search box do we auto-highlight the first match (index 0).
  // This prevents the first product from being accidentally added to cart
  // when the user scans a different barcode.
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [qtyOpen, setQtyOpen] = React.useState(false);
  const [qtyProduct, setQtyProduct] = React.useState<Product | null>(null);
  const [qtyValue, setQtyValue] = React.useState("");

  const searchRef = React.useRef<HTMLInputElement>(null);
  const productGridRef = React.useRef<HTMLDivElement>(null);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);

  const cart = useCartStore();
  const { setView } = useAppStore();
  const { settings: barcodeSettings } = useBarcodeSettings();
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

  // Search shop cards when user types in checkout card search
  React.useEffect(() => {
    if (!cardSearch.trim()) {
      setCardSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards?q=${encodeURIComponent(cardSearch)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setCardSearchResults((data.cards || []).slice(0, 8));
        }
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [cardSearch]);

  function addToCart(product: Product, qty: number = 1) {
    if (!product.active) {
      toast.error("This product is inactive");
      return;
    }
    const existingItem = cart.items.find((i) => i.product.id === product.id);
    const currentInCart = existingItem ? existingItem.quantity : 0;

    // ─── If product already in cart, just increment quantity ──────────
    // This allows scanning the same barcode multiple times to add more.
    if (existingItem) {
      cart.setQty(product.id, currentInCart + qty);
      toast.success(`${product.name}: ${currentInCart + qty} in cart`);
      setQ("");
      setHighlightedIndex(-1);
      setTimeout(() => searchRef.current?.focus(), 50);
      return;
    }

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
    // After adding, clear search and reset highlight so the first product
    // is NOT auto-selected for the next scan/search.
    setQ("");
    setHighlightedIndex(-1);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  // Open quantity prompt dialog before adding product to cart.
  // Allows decimal quantities like 0.25, 0.50, 1.5, etc.
  function promptQuantity(product: Product) {
    if (barcodeSettings.posScanBehavior === "DIRECT_ADD") {
      addToCart(product, 1);
      return;
    }
    setQtyProduct(product);
    setQtyValue("1");
    setQtyOpen(true);
    setTimeout(() => qtyInputRef.current?.select(), 100);
  }

  // Confirm quantity and add to cart — allows decimals (0.25, 0.5, 1.75, etc.)
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
    // ─── DEDICATED BARCODE SCANNING (v2.9.11) ────────────────────────────
    // This function is called by the useBarcodeScanner hook whenever a
    // barcode scanner fires. It does an EXACT barcode lookup against the
    // database via /api/barcode.
    //
    // IMPORTANT: This is the ONLY way barcodes are processed. The visible
    // search bar is NOT used for barcode scanning. If the barcode is not
    // found, we show "Unknown Barcode" and DO NOT add any product.
    //
    // The code is treated as a STRING (preserving leading zeros).
    // EAN-13 barcodes remain exactly 13 digits.

    // Normalize: trim whitespace (scanner suffix Enter/CR already removed by hook)
    const normalizedCode = String(code).trim();
    if (!normalizedCode) return; // Empty input — ignore safely

    // Clear search bar so scanner text doesn't linger
    setQ("");
    setHighlightedIndex(-1);

    try {
      const res = await fetch(`/api/barcode?code=${encodeURIComponent(normalizedCode)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (data.found && data.kind === "product" && data.product) {
        // ─── EXACT MATCH FOUND ───
        // Immediately identify and add the correct product
        const product = data.product as Product;
        promptQuantity(product);
      } else if (data.found && data.kind === "card" && data.card) {
        // ─── SHOP CARD SCANNED ───
        toast.success(`Shop Card: ${data.card.name} — ${data.card.type === "SHOP_KEEPER" ? "Shopkeeper" : data.card.type === "WHOLESALE" ? "Wholesale" : "Regular"} mode`);
        const cardType = data.card.type;
        if (cardType === "SHOP_KEEPER") {
          cart.setSaleType("SHOPKEEPER");
        } else if (cardType === "WHOLESALE") {
          cart.setSaleType("WHOLESALE");
        } else {
          cart.setSaleType("RETAIL");
        }
        setScannedCard(data.card);
        if (data.card.name) {
          cart.setCustomer(data.card.name, data.card.phone || cart.customerPhone);
        }
        try {
          const txnRes = await fetch(`/api/cards/${data.card.id}/transactions?limit=1`, { cache: "no-store" });
          if (txnRes.ok) {
            const txnData = await txnRes.json();
            const txns = txnData.transactions || [];
            setCardLastTxn(txns.length > 0 ? txns[0] : null);
          } else {
            setCardLastTxn(null);
          }
        } catch {
          setCardLastTxn(null);
        }
      } else {
        // ─── UNKNOWN BARCODE ───
        // Exact barcode does NOT exist in database.
        // DO NOT add any product. DO NOT select first product.
        // DO NOT select similar product. Show clear error.
        toast.error(`Unknown Barcode`, {
          description: `No product found for barcode: ${normalizedCode}`,
          duration: 4000,
        });
      }
    } catch {
      toast.error("Scan lookup failed — check network connection");
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

  // ─── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────
  // Alt              = Checkout (when cart has items)
  // Ctrl+C           = Open calculator anywhere in app
  // Ctrl+Z           = Cycle sale mode (Regular → Wholesale → Shopkeeper → Regular)
  // Ctrl+Backspace   = Reverse/undo last cart action (remove last item)
  // Enter            = Add highlighted product to cart (when search focused)
  //                  = Complete sale (when checkout dialog open)
  // Space            = In search: acts as normal space (multi-word queries)
  //                    After checkout: acts as Tab (move to next field)
  // Arrow keys       = Navigate products
  // F2/F3/F4/F12     = Checkout / Return / Calculator / Clear cart
  React.useEffect(() => {
    async function handlePosKey(e: KeyboardEvent) {
      if (returnOpen || calcOpen || receiptOpen) return;

      // ─── Ctrl+Z = Cycle sale mode ─────────────────────────────────────
      // Note: Ctrl+C calculator is now handled globally by AppShell
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        const modes = ["RETAIL", "WHOLESALE", "SHOPKEEPER"] as const;
        const currentIdx = modes.indexOf(cart.saleType as any);
        const nextIdx = (currentIdx + 1) % modes.length;
        const nextMode = modes[nextIdx];
        cart.setSaleType(nextMode);
        const labels = { RETAIL: "Regular", WHOLESALE: "Wholesale", SHOPKEEPER: "Shopkeeper" };
        toast.success(`Sale mode: ${labels[nextMode]}`);
        return;
      }

      // ─── Ctrl+Backspace = Reverse (remove last item from cart) ─────────
      // Changed from Ctrl+R to avoid conflict with browser refresh.
      // Ctrl+Backspace is a natural "undo last" gesture and doesn't
      // conflict with any browser shortcut.
      if (e.ctrlKey && e.key === "Backspace") {
        e.preventDefault();
        if (cart.items.length > 0) {
          const lastItem = cart.items[cart.items.length - 1];
          cart.removeItem(lastItem.product.id);
          toast.success(`Removed: ${lastItem.product.name}`);
        } else {
          toast.warning("Cart is empty");
        }
        return;
      }

      // ─── After checkout: Space acts as Tab + Enter completes sale ─────
      if (checkoutOpen) {
        if (e.key === " " || e.code === "Space") {
          // In checkout dialog, Space moves to next focusable element
          // (acts like Tab). This lets the cashier navigate the checkout
          // form with just the spacebar after pressing Alt to open it.
          e.preventDefault();
          const focusable = document.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const filtered = Array.from(focusable).filter(
            (el) => el.offsetParent !== null && !el.hasAttribute("disabled")
          );
          const active = document.activeElement;
          const currentIdx = filtered.indexOf(active as HTMLElement);
          const nextIdx = (currentIdx + 1) % filtered.length;
          if (filtered[nextIdx]) {
            filtered[nextIdx].focus();
          }
          return;
        }
        // ─── Enter in checkout dialog = complete sale ───────────────────
        // Enter should ALWAYS complete the sale when the checkout dialog
        // is open, regardless of whether a shop card is linked or not.
        // - If card is linked: card payment (auto-deduct from balance)
        // - If no card: cash payment (uses paidAmount entered by cashier)
        // The cashier can also press the "Complete Sale" button directly.
        if (e.key === "Enter") {
          e.preventDefault();
          // Don't trigger if the active element is a SELECT dropdown that's
          // open (Enter should select the dropdown option instead)
          const active = document.activeElement;
          if (active && active.tagName === "SELECT") {
            return; // Let the SELECT handle Enter normally
          }
          handleCheckout();
          return;
        }
        return; // Don't process other keys when checkout is open
      }

      if (qtyOpen) return;
      const active = document.activeElement;
      const isSearchFocused = active === searchRef.current;

      // ─── + / - keys: increment/decrement last scanned product ────────
      // Works on the LAST item in cart (latest scan, shown at top)
      // Can be pressed multiple times — each press adds/subtracts 1
      // e.repeat=true allows continuous press (holding down the key)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === "+" || e.key === "=") {
          if (cart.items.length > 0) {
            e.preventDefault();
            const lastItem = cart.items[cart.items.length - 1];
            const step = isLooseUnit(lastItem.product.unit) ? 0.5 : 1;
            // v2.10.16: Stock check on keyboard + as well
            const stock = lastItem.product.stock || 0;
            if (lastItem.quantity + step > stock) {
              if (!e.repeat) {
                toast.error(`Stock limit: only ${stock} ${unitLabel(lastItem.product.unit)} available`);
              }
              return;
            }
            cart.incrementLastItem(step);
            if (!e.repeat) {
              const updatedQty = lastItem.quantity + step;
              toast.success(`${lastItem.product.name}: ${updatedQty}`);
            }
            return;
          }
        }
        if (e.key === "-" || e.key === "_") {
          if (cart.items.length > 0) {
            e.preventDefault();
            const lastItem = cart.items[cart.items.length - 1];
            const step = isLooseUnit(lastItem.product.unit) ? 0.5 : 1;
            const newQty = Math.max(1, lastItem.quantity - step);
            // Don't remove on minus — just decrement (min 1)
            // User can use Delete key or X button to actually remove the item
            cart.decrementLastItem(step);
            if (!e.repeat) toast.success(`${lastItem.product.name}: ${newQty}`);
            return;
          }
        }
        // ─── Delete key: remove last cart item ──────────────────────────
        if (e.key === "Delete") {
          if (cart.items.length > 0 && !isSearchFocused) {
            e.preventDefault();
            const lastItem = cart.items[cart.items.length - 1];
            cart.removeLastItem();
            if (!e.repeat) toast.info(`${lastItem.product.name} removed`);
            return;
          }
        }
      }

      // ─── Alt = Checkout shortcut ─────────────────────────────────────
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (cart.items.length > 0) {
          setCheckoutOpen(true);
        }
        return;
      }

      // Arrow key navigation through products
      // Only active when user is searching (q is non-empty) or has already
      // started navigating. Prevents accidental selection of first product.
      if ((isSearchFocused && q.trim()) || (!active || active.tagName !== "INPUT")) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((p) => p < 0 ? 0 : Math.min(p + 1, products.length - 1));
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((p) => p < 0 ? products.length - 1 : Math.max(p - 1, 0));
          return;
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setHighlightedIndex((p) => p < 0 ? 0 : Math.min(p + 4, products.length - 1));
          return;
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setHighlightedIndex((p) => p < 0 ? 0 : Math.max(p - 4, 0));
          return;
        } else if (e.key === "Enter" && isSearchFocused) {
          // ─── ENTER IN SEARCH: manual name search ONLY ───
          // The scanner hook (useBarcodeScanner) handles ALL barcode scans
          // and prevents them from reaching this handler. So if we get here,
          // it's because the user typed a product NAME manually and pressed
          // Enter to select the highlighted product.
          //
          // If the user typed something that looks like a barcode (digits),
          // we still do an exact barcode lookup as a safety net. If it's not
          // found, we show "Unknown Barcode" and DO NOT add the highlighted
          // product (prevents wrong product = financial loss).
          e.preventDefault();
          const searchText = q.trim();
          if (searchText) {
            // If it looks like a barcode (8+ digits), do exact lookup
            const isLikelyBarcode = searchText.length >= 8 && /^\d+$/.test(searchText);
            if (isLikelyBarcode) {
              try {
                const res = await fetch(`/api/barcode?code=${encodeURIComponent(searchText)}`, { cache: "no-store" });
                const data = await res.json();
                if (data.found && data.kind === "product" && data.product) {
                  setQ("");
                  setHighlightedIndex(-1);
                  promptQuantity(data.product as Product);
                  return;
                }
                // Barcode not found — DO NOT add highlighted product
                toast.error(`Unknown Barcode`, {
                  description: `No product found for barcode: ${searchText}`,
                  duration: 4000,
                });
                setQ("");
                setHighlightedIndex(-1);
                return;
              } catch {
                toast.error("Barcode lookup failed");
                return;
              }
            }
            // Manual name search — use highlighted product
            if (products.length > 0) {
              const idx = highlightedIndex >= 0 && highlightedIndex < products.length
                ? highlightedIndex
                : 0;
              setQ("");
              setHighlightedIndex(0);
              promptQuantity(products[idx]);
              return;
            }
            toast.warning(`No product found for: ${searchText}`);
            setQ("");
            setHighlightedIndex(-1);
          }
          return;
        }
      }

      // ─── Space key: in search = normal space; empty cart search = checkout ─
      // User requested: Space in search input should allow multi-word queries
      // (e.g. "lemon biscuit"). Only trigger checkout via Space when the
      // search is empty AND cart has items. Alt is the primary checkout key.
      if (e.key === " " || e.code === "Space") {
        if (isSearchFocused) {
          // Let the space character be typed into the search input
          // (don't preventDefault — allows "lemon biscuit" searches)
          // But if search is empty and cart has items, trigger checkout
          if (q.trim() === "" && cart.items.length > 0) {
            e.preventDefault();
            if (scannedCard) {
              handleCheckout();
            } else {
              setCheckoutOpen(true);
            }
          }
          // Otherwise, let Space be typed normally
          return;
        }
        // Space when NOT in search input (e.g. body focused) = checkout
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
      else if (e.key === "Escape") { setQ(""); setHighlightedIndex(-1); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", handlePosKey);
    return () => window.removeEventListener("keydown", handlePosKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.saleType, returnOpen, calcOpen, checkoutOpen, receiptOpen, products, highlightedIndex, q, cart.items.length, scannedCard]);

  // v2.10.35: Edit Sale — load sale items back into cart for editing.
  // Flow: return all items from the original sale → load items into cart →
  // close receipt → user can edit the cart → checkout creates a NEW sale.
  // The original sale remains in history with status=RETURNED.
  async function handleEditSale(sale: any) {
    if (!sale?.id) {
      toast.error("Cannot edit this sale (missing sale ID)");
      return;
    }
    try {
      toast.info("Returning original sale and loading items into cart...");

      // 1. Return all items from the original sale
      const returnRes = await fetch(`/api/sales/${sale.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Editing sale — returned for re-checkout", itemIds: [] }),
      });
      const returnData = await returnRes.json();
      if (!returnRes.ok) {
        toast.error(returnData.error || "Failed to return original sale");
        return;
      }

      // 2. Clear current cart
      cart.clear();
      if (cart.setCustomerName) cart.setCustomerName("");
      if (cart.setCustomerPhone) cart.setCustomerPhone("");

      // 3. Fetch the sale with full item details (need productId + price)
      // We use sale.items directly if present, otherwise fetch from API
      let items = sale.items || [];
      if (items.length === 0) {
        const res = await fetch(`/api/sales?limit=1`);
        const data = await res.json();
        const found = (data.sales || []).find((s: any) => s.id === sale.id);
        if (found) items = found.items || [];
      }

      // 4. Load each item into the cart
      // We need the full Product object — fetch by ID if we only have SaleItem
      let loaded = 0;
      for (const it of items) {
        try {
          // Try fetching product by ID (gets full Product with stock, barcode, etc.)
          const pRes = await fetch(`/api/products?barcode=${encodeURIComponent(it.barcode || it.name || "")}`, { cache: "no-store" });
          if (pRes.ok) {
            const pData = await pRes.json();
            const product = (pData.products || [])[0];
            if (product) {
              cart.addItem(product, it.quantity);
              loaded++;
              continue;
            }
          }
          // Fallback: if we can't find the product, build a minimal one from the sale item
          cart.addItem({
            id: it.productId || it.id,
            name: it.name || "Unknown",
            barcode: it.barcode || "",
            salePrice: it.price || 0,
            stock: 9999,  // don't block checkout
            unit: it.unit || "piece",
            costPrice: 0,
            wholesalePrice: 0,
            shopkeeperPrice: 0,
            taxRate: 0,
            active: true,
            hasBarcode: false,
            barcodeType: "CODE128",
            minStock: 0,
            categoryId: null,
            vendorId: null,
            storeStock: 0,
            image: null,
            expiryDate: null,
            manufacturingDate: null,
            packBarcode: null,
            packQuantity: 0,
            packPrice: 0,
            productCode: null,
            barcodeSvg: null,
            barcodePng: null,
            barcodeVerified: false,
            stickerSize: "50x30",
            packingDate: null,
            inventorySource: "SHOP",
            linkedStoreProductId: null,
          } as any, it.quantity);
          loaded++;
        } catch (e) {
          console.warn("Failed to load sale item into cart:", it, e);
        }
      }

      // 5. Set customer info if present
      if (sale.customerName && cart.setCustomerName) cart.setCustomerName(sale.customerName);
      if (sale.customerPhone && cart.setCustomerPhone) cart.setCustomerPhone(sale.customerPhone);

      // 6. Close the receipt
      setReceiptOpen(false);
      setLastSale(null);

      toast.success(`Loaded ${loaded} item(s) into cart. Original sale marked as RETURNED.`);
    } catch (e: any) {
      toast.error("Failed to edit sale: " + (e?.message || "Unknown error"));
    }
  }

  async function handleCheckout() {
    if (cart.items.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    // ─── STOCK VALIDATION — Prevent selling more than available ──────
    // v2.10.15: Each product's quantity in cart must not exceed its stock
    // Negative stock is NOT allowed — sale is blocked if any item exceeds stock
    for (const item of cart.items) {
      const stock = item.product.stock || 0;
      if (item.quantity > stock) {
        toast.error(
          `Stock limit: "${item.product.name}" — only ${stock} ${unitLabel(item.product.unit)} available, but ${item.quantity} in cart`,
          { duration: 6000 }
        );
        return; // Block the sale
      }
    }

    // ─── TRIAL DAILY LIMIT CHECK ─────────────────────────────────────
    // If using trial license, check if daily sale limit (30) is reached
    try {
      const { getStoredLicense, isTrialLicense, isTrialDailyLimitReached, getTrialSalesRemaining } =
        await import("@/lib/license/storage");
      const license = getStoredLicense();
      if (isTrialLicense(license)) {
        if (isTrialDailyLimitReached()) {
          // Show limit reached toast and offer WhatsApp contact
          toast.error(
            "⚠️ Daily Limit Reached — You've made 30 sales today (trial limit).\nPurchase a license to continue selling unlimited.",
            { duration: 8000 }
          );
          return; // Block the sale
        }
        const remaining = getTrialSalesRemaining();
        if (remaining <= 5) {
          // Warning when 5 or fewer sales left
          toast.info(
            `Trial limit: ${remaining} sales remaining today. Purchase a license to continue unlimited.`,
            { duration: 5000 }
          );
        }
      }
    } catch {
      // If license check fails, allow the sale (best-effort)
    }

    // ─── SHOP CARD PAYMENT LOGIC ────────────────────────────────────────
    // If a shop card is linked, the sale is paid via the card's balance:
    //   - If card has ADVANCE balance (balance > 0): deduct from balance,
    //     allow discount (the user can give a discount because the
    //     customer has already paid in advance)
    //   - If card has ZERO balance (balance === 0): no discount allowed,
    //     sale goes through but customer's balance goes negative (they owe)
    //   - If card has DUE balance (balance < 0): no discount allowed,
    //     sale adds to their existing debt
    //
    // No paidAmount prompt — the total is auto-deducted from the card.
    // Enter key in checkout dialog completes the sale directly.
    const isCardPayment = !!scannedCard;
    const hasAdvanceBalance = scannedCard && (scannedCard.balance || 0) > 0;

    // For card payments, paidAmount = total (no change to give back)
    // For cash payments, use the entered paidAmount
    const effectivePaidAmount = isCardPayment
      ? totals.total  // card: exact amount, no change
      : (Number(paidAmount) || totals.total);

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
        paidAmount: effectivePaidAmount,
        paymentMethod: isCardPayment ? "SHOP_CARD" : cart.paymentMethod,
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
      // v2.10.20: Sync sale to shop's Supabase (for online portal)
      try {
        const { syncSale } = await import("@/lib/supabase-sync");
        await syncSale({
          invoiceNo: data.sale.invoiceNo,
          cardId: scannedCard?.id || null,
          cardNumber: scannedCard?.cardNumber || null,
          customerName: cart.customerName || null,
          subtotal: data.sale.subtotal,
          discount: data.sale.discount,
          taxTotal: data.sale.taxTotal,
          total: data.sale.total,
          paidAmount: data.sale.paidAmount,
          change: data.sale.change,
          balanceDue: data.sale.balanceDue,
          paymentMethod: data.sale.paymentMethod,
          saleType: cart.saleType,
          items: data.sale.items,
        });
      } catch {
        // Silent — sync is best-effort
      }
      // ─── Increment trial daily sale counter ─────────────────────────
      // Only increments if license is trial type. Auto-resets each day.
      try {
        const { getStoredLicense, isTrialLicense, incrementTrialDailySales } =
          await import("@/lib/license/storage");
        const license = getStoredLicense();
        if (isTrialLicense(license)) {
          const newCount = incrementTrialDailySales();
          if (newCount >= 25) {
            // Warn as user approaches limit
            toast.info(`Trial: ${30 - newCount} sales remaining today`, { duration: 3000 });
          }
        }
      } catch {
        // Silent — don't interrupt sale flow
      }
      // Trigger Google Drive auto-backup after each sale (silent, non-blocking)
      // This ensures backups are taken frequently throughout the day as sales happen
      try {
        if (typeof window !== "undefined" && window.posElectron?.googleDrive?.triggerBackup) {
          window.posElectron.googleDrive.triggerBackup("after_sale").catch(() => {
            // Silent failure — don't interrupt the user with backup errors
          });
        }
      } catch {
        // Silently ignore — backup is best-effort
      }
    } catch (e: any) {
      // True network error (server unreachable, DNS failure, etc.)
      toast.error(`Network error: ${e.message || "Could not reach server"}`);
    } finally {
      setSubmitting(false);
    }
  }

  // v2.10.25: Show negative balance if customer paid less than total
  const paidNum = Number(paidAmount) || 0;
  const change = paidNum - totals.total; // Can be negative (customer owes money)
  const balanceDue = change < 0 ? Math.abs(change) : 0;

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
              placeholder="Search by name... (↑↓ navigate, Enter add, Alt checkout) — Barcode scanning is automatic"
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                // Only highlight first match when user is actively searching.
                // When search is cleared, remove highlight entirely.
                setHighlightedIndex(v.trim() ? 0 : -1);
              }}
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

        {/* Cart section — DARK background + thick dark border for clear separation */}
        <div className="lg:sticky lg:top-4 h-fit">
          <Card className="border-2 border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 shadow-lg">
            <CardContent className="p-4 space-y-3">
              {/* v2.10.16: Cart header with proper layout — no overflow */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                    <ShoppingCart className="w-5 h-5 text-emerald-700" />
                    {cart.activeCartLabel || "Cart"}
                    {totals.itemCount > 0 && (
                      <Badge className="bg-emerald-700 text-white">{totals.itemCount}</Badge>
                    )}
                  </h2>
                </div>
                {/* Cart action buttons — wrap properly on small screens */}
                {cart.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:bg-blue-50 h-8"
                      onClick={() => {
                        cart.holdCart();
                        setScannedCard(null);
                        toast.success("Cart held — new cart opened");
                        setTimeout(() => searchRef.current?.focus(), 50);
                      }}
                      title="Hold this cart and start a new one (F8)"
                    >
                      <Pause className="w-3.5 h-3.5 mr-1" /> Hold
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-orange-600 hover:bg-orange-50 h-8"
                      onClick={() => {
                        const lastItem = cart.items[cart.items.length - 1];
                        const itemName = lastItem?.product?.name || "Item";
                        cart.removeLastItem();
                        toast.info(`Removed: ${itemName}`);
                        setTimeout(() => searchRef.current?.focus(), 50);
                      }}
                      title="Delete the last product added to cart (Delete key)"
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Delete Last
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 h-8"
                      onClick={() => cart.clear()}
                      title="Clear entire cart (F12)"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Held carts bar — shows parked carts that can be restored */}
              {cart.heldCarts.length > 0 && (
                <div className="flex gap-1 flex-wrap bg-blue-50 dark:bg-blue-950/30 rounded-md p-1.5 border border-blue-200">
                  {cart.heldCarts.map((held, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        cart.restoreCart(idx);
                        toast.success(`Restored ${held.label}`);
                        setTimeout(() => searchRef.current?.focus(), 50);
                      }}
                      className="px-2 py-1 rounded text-xs bg-white border border-blue-300 hover:bg-blue-100 flex items-center gap-1"
                    >
                      <Pause className="w-3 h-3 text-blue-600" />
                      {held.label} ({held.items.length})
                      <span
                        className="ml-1 text-red-500 hover:text-red-700"
                        onClick={(e) => { e.stopPropagation(); cart.deleteHeldCart(idx); }}
                      >
                        ✕
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {cart.items.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Cart is empty
                </div>
              ) : (
                <>
                  <ScrollArea className="h-[40vh] pr-2">
                    <div className="space-y-2">
                      {[...cart.items].reverse().map((item) => {
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
                                  onClick={() => {
                                    const step = isLooseUnit(item.product.unit) ? 0.5 : 1;
                                    // No stock limit on decrement — user can always reduce
                                    cart.decrementItem(item.product.id, step);
                                  }}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <CartItemQtyInput
                                  quantity={item.quantity}
                                  onSetQty={(qty) => cart.setQty(item.product.id, qty)}
                                  onEnter={() => {
                                    setQ("");
                                    setHighlightedIndex(-1);
                                    setTimeout(() => searchRef.current?.focus(), 50);
                                  }}
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const step = isLooseUnit(item.product.unit) ? 0.5 : 1;
                                    // v2.10.16: Stock check — don't allow incrementing beyond stock
                                    const stock = item.product.stock || 0;
                                    if (item.quantity + step > stock) {
                                      toast.error(`Stock limit: only ${stock} ${unitLabel(item.product.unit)} available`);
                                      return;
                                    }
                                    cart.incrementItem(item.product.id, step);
                                  }}
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

                  {/* linked shop card — shows customer name, ID, balance, last txn */}
                  {scannedCard && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-emerald-600" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{scannedCard.name}</div>
                            <div className="text-xs text-muted-foreground">
                              ID: {scannedCard.customerId || scannedCard.cardNumber} • {scannedCard.type === "SHOP_KEEPER" ? "Shopkeeper" : scannedCard.type === "WHOLESALE" ? "Wholesale" : "Regular"}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setScannedCard(null);
                            setCardLastTxn(null);
                            cart.setSaleType("RETAIL");
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      {/* Balance display — green for advance, red for due, gray for zero */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className={`font-bold ${
                          (scannedCard.balance || 0) > 0
                            ? "text-emerald-700"
                            : (scannedCard.balance || 0) < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}>
                          {(scannedCard.balance || 0) > 0
                            ? `Advance: Rs ${(scannedCard.balance || 0).toLocaleString()}`
                            : (scannedCard.balance || 0) < 0
                            ? `Due: Rs ${Math.abs(scannedCard.balance || 0).toLocaleString()}`
                            : "Rs 0 (no advance)"}
                        </span>
                      </div>
                      {/* Last transaction */}
                      {cardLastTxn && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Last txn:</span>
                          <span className="font-medium">
                            {cardLastTxn.type} Rs {(cardLastTxn.amount || 0).toLocaleString()}
                            {cardLastTxn.createdAt && (
                              <span className="text-muted-foreground ml-1">
                                · {new Date(cardLastTxn.createdAt).toLocaleDateString("en-PK")}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {/* Discount hint — only if advance balance exists */}
                      {(scannedCard.balance || 0) > 0 ? (
                        <div className="text-[10px] text-emerald-700">
                          ✓ Discount allowed (customer has advance balance)
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-700">
                          ⚠ No discount (no advance balance — sale will add to customer's debt)
                        </div>
                      )}
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
              step="0.01"
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

            {/* ─── Shop Card selector with search ─── */}
            {/* User can search for a customer's shop card and link it to the sale */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                Shop Card (optional)
              </Label>
              {scannedCard ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="text-sm font-medium">{scannedCard.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {scannedCard.cardNumber} • Balance: Rs {(scannedCard.balance || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => { setScannedCard(null); setCardLastTxn(null); cart.setSaleType("RETAIL"); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    placeholder="Search customer card by name or number..."
                    value={cardSearch}
                    onChange={(e) => setCardSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                  {cardSearch && cardSearchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border bg-white shadow-lg">
                      {cardSearchResults.map((c: any) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b last:border-0"
                          onClick={() => {
                            setScannedCard(c);
                            setCardSearch("");
                            // Auto-select sale mode based on card type
                            if (c.type === "SHOP_KEEPER") cart.setSaleType("SHOPKEEPER");
                            else if (c.type === "WHOLESALE") cart.setSaleType("WHOLESALE");
                            else cart.setSaleType("RETAIL");
                            // Fetch last transaction
                            fetch(`/api/cards/${c.id}/transactions?limit=1`, { cache: "no-store" })
                              .then(r => r.json())
                              .then(d => setCardLastTxn(d.transactions?.[0] || null))
                              .catch(() => {});
                          }}
                        >
                          <div className="text-sm font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.cardNumber} • {c.type === "SHOP_KEEPER" ? "Shopkeeper" : c.type === "WHOLESALE" ? "Wholesale" : "Regular"}
                            {" • Bal: Rs "}{(c.balance || 0).toLocaleString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

            {Number(paidAmount) > 0 && change >= 0 && (
              <div className="flex justify-between items-center bg-emerald-50 rounded-lg p-3">
                <span className="text-sm font-medium">Change</span>
                <span className="text-xl font-bold text-emerald-700">
                  {formatMoney(change, currency)}
                </span>
              </div>
            )}
            {Number(paidAmount) > 0 && change < 0 && (
              <div className="flex justify-between items-center bg-red-50 rounded-lg p-3 border border-red-200">
                <span className="text-sm font-medium text-red-700">Balance Due (Customer owes)</span>
                <span className="text-xl font-bold text-red-700">
                  {formatMoney(balanceDue, currency)}
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
        onEdit={handleEditSale}
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

// ─── v2.10.13: CartItemQtyInput ──────────────────────────────────────────
// Separate component to handle decimal quantity input properly.
// Uses local string state so the user can type "0." then "3" → "0.3"
// without React resetting the field to "0" on each keystroke.
function CartItemQtyInput({
  quantity,
  onSetQty,
  onEnter,
}: {
  quantity: number;
  onSetQty: (qty: number) => void;
  onEnter?: () => void;
}) {
  // Local string state mirrors the input so user can type decimals freely
  const [inputValue, setInputValue] = React.useState<string>(String(quantity));

  // Sync from external changes (e.g. +/- buttons, programmatic updates)
  React.useEffect(() => {
    const currentNum = Number(inputValue);
    // Only update if external value is significantly different
    if (!isNaN(currentNum) && Math.abs(currentNum - quantity) > 0.001) {
      setInputValue(String(quantity));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

  return (
    <Input
      className="h-6 w-14 text-center px-1 text-xs"
      value={inputValue}
      inputMode="decimal"
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow: empty, "0", "0.", "0.3", "1.25", "12.5", etc.
        if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
          setInputValue(raw);
          const v = Number(raw);
          if (!isNaN(v) && v >= 0) {
            onSetQty(v);
          }
        }
      }}
      onBlur={() => {
        // On blur, normalize the value (remove trailing dot, etc.)
        const v = Number(inputValue);
        if (isNaN(v) || v <= 0) {
          onSetQty(1);
          setInputValue("1");
        } else {
          setInputValue(String(v));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Commit value and trigger Enter callback
          const v = Number(inputValue);
          if (!isNaN(v) && v > 0) {
            onSetQty(v);
            setInputValue(String(v));
          }
          onEnter?.();
        }
      }}
    />
  );
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
  // Track which item IDs are selected for return
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);

  function reset() {
    setInvoiceNo("");
    setSale(null);
    setNotFound(false);
    setSearching(false);
    setReturning(false);
    setSelectedItemIds([]);
  }

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // When sale is loaded, select ALL items by default (user can deselect)
  React.useEffect(() => {
    if (sale?.items) {
      setSelectedItemIds(sale.items.map((it: any) => it.id));
    } else {
      setSelectedItemIds([]);
    }
  }, [sale]);

  function toggleItem(itemId: string) {
    setSelectedItemIds(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  }

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

  async function returnSelected() {
    if (!sale) return;
    if (selectedItemIds.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    setReturning(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: selectedItemIds.length === sale.items.length ? "Full return" : "Partial return",
          itemIds: selectedItemIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.error || "").toLowerCase();
        if (msg.includes("already")) {
          toast.error("This sale has already been returned");
          setSale({ ...sale, status: "RETURNED" });
        } else {
          toast.error(data.error || "Return failed");
        }
        setReturning(false);
        return;
      }
      const msg = data.isFullReturn
        ? "Sale returned successfully. All items restocked."
        : `Partial return done. ${data.itemsReturned} of ${data.itemsTotal} items returned. Refund: Rs ${data.refundAmount?.toLocaleString()}`;
      toast.success(msg);
      onReturned?.();
      onOpenChange(false);
    } catch {
      toast.error("Network error");
    } finally {
      setReturning(false);
    }
  }

  const alreadyReturned = sale?.status === "RETURNED";
  const selectedRefundAmount = sale?.items
    ? sale.items
        .filter((it: any) => selectedItemIds.includes(it.id))
        .reduce((sum: number, it: any) => sum + (it.lineTotal || 0), 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Return / Refund Sale</DialogTitle>
          <DialogDescription>
            Scan the receipt barcode OR enter the invoice number. Select items to return.
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
                // v2.10.46: Removed data-barcode-input="true" — it was
                // preventing manual typing into this field. The barcode
                // scanner hook uses this attribute to decide "always capture
                // scanner input here", which calls preventDefault on every
                // character → user can't type.
                // Scanner input still works because the hook detects fast
                // input sequences automatically (see use-barcode-scanner.ts
                // — when 4+ chars arrive within 400ms, it triggers a scan).
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
                {/* ─── Items with checkboxes for selection ─── */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    Select items to return ({selectedItemIds.length}/{sale.items?.length || 0})
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setSelectedItemIds(sale.items?.map((it: any) => it.id) || [])}
                      disabled={alreadyReturned}
                    >
                      Select All
                    </button>
                    <span className="text-xs text-muted-foreground">|</span>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setSelectedItemIds([])}
                      disabled={alreadyReturned}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {(sale.items || []).map((it: any) => {
                    const checked = selectedItemIds.includes(it.id);
                    return (
                      <label
                        key={it.id}
                        className={`flex items-center gap-2 text-sm rounded-md p-1.5 cursor-pointer transition-colors ${
                          checked ? "bg-rose-50 border border-rose-200" : "hover:bg-muted/50"
                        } ${alreadyReturned ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(it.id)}
                          className="w-4 h-4 accent-rose-600"
                          disabled={alreadyReturned}
                        />
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
                      </label>
                    );
                  })}
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Refund Amount</span>
                  <span className="text-rose-700">
                    {formatMoney(selectedRefundAmount, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sale Total</span>
                  <span>{formatMoney(sale.total, currency)}</span>
                </div>
              </div>
              <Button
                className="w-full bg-rose-600 hover:bg-rose-700"
                onClick={returnSelected}
                disabled={returning || alreadyReturned || selectedItemIds.length === 0}
              >
                {returning ? "Processing..." : `Return ${selectedItemIds.length} Item${selectedItemIds.length !== 1 ? "s" : ""} — ${formatMoney(selectedRefundAmount, currency)}`}
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
  // History of all entered numbers and operations — e.g. "345 + 35 + 345 + 454 + 64"
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
    // Append to history: "345 + 35 + ..."
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
    // Final history: "345 + 35 + 345 + 454 + 64 = 1243"
    setHistory(`${history} ${current} =`);
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
          {/* Display area — shows history (all entered numbers) + current total */}
          <div className="bg-muted rounded-lg p-4 text-right space-y-1">
            {/* History line: shows all entered numbers and operations */}
            {history && (
              <div className="text-xs text-muted-foreground truncate font-mono">
                {history}
              </div>
            )}
            {/* Current value / total */}
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
