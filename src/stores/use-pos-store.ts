"use client";

import { create } from "zustand";
import type { Product, CartItem } from "@/types";

export type View =
  | "dashboard"
  | "pos"
  | "products"
  | "scanner"
  | "sales"
  | "reports"
  | "users"
  | "cards"
  | "store"
  | "vendors"
  | "expenses"
  | "loadbill"
  | "settings";

interface AppState {
  view: View;
  setView: (v: View) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "dashboard",
  setView: (view) => set({ view }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));

export type SaleType = "RETAIL" | "WHOLESALE" | "SHOPKEEPER";

// Helper: get effective price for a product based on sale type
export function effectivePrice(product: Product, saleType: SaleType): number {
  if (saleType === "WHOLESALE" && product.wholesalePrice > 0) {
    return product.wholesalePrice;
  }
  if (saleType === "SHOPKEEPER" && product.shopkeeperPrice > 0) {
    return product.shopkeeperPrice;
  }
  return product.salePrice;
}

interface CartState {
  items: CartItem[];
  discount: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: "CASH" | "CARD" | "MOBILE";
  saleType: SaleType;
  addItem: (product: Product, qty?: number) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  setDiscount: (v: number) => void;
  setCustomer: (name: string, phone: string) => void;
  setPaymentMethod: (m: "CASH" | "CARD" | "MOBILE") => void;
  setSaleType: (s: SaleType) => void;
  clear: () => void;
  totals: (taxEnabled: boolean) => {
    subtotal: number;
    taxTotal: number;
    discount: number;
    total: number;
    itemCount: number;
  };
}

// ─── Multi-Cart System (v2.9.25) ─────────────────────────────────────────────
// Allows holding a cart (parking a customer's sale) and opening a new cart
// for the next customer. Like browser tabs but for POS carts.
// Usage: Hold current cart → serve next customer → return to held cart later.

interface CartSnapshot {
  items: CartItem[];
  discount: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: "CASH" | "CARD" | "MOBILE";
  saleType: SaleType;
  label: string; // e.g. "Cart 1", "Cart 2"
  heldAt: number; // timestamp
}

interface MultiCartState extends CartState {
  heldCarts: CartSnapshot[];
  activeCartLabel: string;
  // Hold current cart and start a fresh one
  holdCart: () => void;
  // Restore a held cart (swap current with held)
  restoreCart: (index: number) => void;
  // Delete a held cart
  deleteHeldCart: (index: number) => void;
}

export const useCartStore = create<MultiCartState>((set, get) => ({
  items: [],
  discount: 0,
  customerName: "",
  customerPhone: "",
  paymentMethod: "CASH",
  saleType: "RETAIL",
  heldCarts: [],
  activeCartLabel: "Cart 1",
  addItem: (product, qty = 1) =>
    set((state) => {
      const existing = state.items.find((i) => i.product.id === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + qty }
              : i
          ),
        };
      }
      return { items: [...state.items, { product, quantity: qty }] };
    }),
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.product.id !== productId),
    })),
  setQty: (productId, qty) =>
    set((state) => ({
      items:
        qty <= 0
          ? state.items.filter((i) => i.product.id !== productId)
          : state.items.map((i) =>
              i.product.id === productId ? { ...i, quantity: qty } : i
            ),
    })),
  setDiscount: (discount) => set({ discount }),
  setCustomer: (customerName, customerPhone) =>
    set({ customerName, customerPhone }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setSaleType: (saleType) => set({ saleType }),
  clear: () =>
    set({
      items: [],
      discount: 0,
      customerName: "",
      customerPhone: "",
      paymentMethod: "CASH",
      saleType: "RETAIL",
    }),
  holdCart: () => {
    const state = get();
    if (state.items.length === 0) return; // Don't hold empty cart
    const snapshot: CartSnapshot = {
      items: state.items,
      discount: state.discount,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      paymentMethod: state.paymentMethod,
      saleType: state.saleType,
      label: `Cart ${state.heldCarts.length + 2}`,
      heldAt: Date.now(),
    };
    set({
      heldCarts: [...state.heldCarts, snapshot],
      items: [],
      discount: 0,
      customerName: "",
      customerPhone: "",
      paymentMethod: "CASH",
      saleType: "RETAIL",
      activeCartLabel: `Cart ${state.heldCarts.length + 3}`,
    });
  },
  restoreCart: (index: number) => {
    const state = get();
    const held = state.heldCarts[index];
    if (!held) return;
    // If current cart has items, hold it first (swap)
    const currentSnapshot: CartSnapshot | null = state.items.length > 0 ? {
      items: state.items,
      discount: state.discount,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      paymentMethod: state.paymentMethod,
      saleType: state.saleType,
      label: state.activeCartLabel,
      heldAt: Date.now(),
    } : null;

    const newHeldCarts = state.heldCarts.filter((_, i) => i !== index);
    if (currentSnapshot) {
      newHeldCarts.push(currentSnapshot);
    }
    set({
      items: held.items,
      discount: held.discount,
      customerName: held.customerName,
      customerPhone: held.customerPhone,
      paymentMethod: held.paymentMethod,
      saleType: held.saleType,
      heldCarts: newHeldCarts,
      activeCartLabel: held.label,
    });
  },
  deleteHeldCart: (index: number) => {
    const state = get();
    set({
      heldCarts: state.heldCarts.filter((_, i) => i !== index),
    });
  },
  totals: (taxEnabled) => {
    const { items, discount, saleType } = get();
    let subtotal = 0;
    let taxTotal = 0;
    items.forEach((i) => {
      const price = effectivePrice(i.product, saleType);
      const line = price * i.quantity;
      subtotal += line;
      if (taxEnabled) {
        taxTotal += line * (i.product.taxRate / 100);
      }
    });
    const total = Math.max(0, subtotal + taxTotal - discount);
    return {
      subtotal,
      taxTotal,
      discount,
      total,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
    };
  },
}));
