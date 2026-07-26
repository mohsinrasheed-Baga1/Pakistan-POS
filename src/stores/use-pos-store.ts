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

// Helper: get effective price for a product based on sale type.
// For box items (isBox=true), uses the pack-level prices (packPrice,
// packWholesalePrice, packShopkeeperPrice) so a whole-box sale charges
// the box wholesale/shopkeeper price when in those modes.
export function effectivePrice(product: Product, saleType: SaleType, isBox?: boolean): number {
  if (isBox) {
    // Box sale — use pack-level prices
    if (saleType === "WHOLESALE" && product.packWholesalePrice > 0) {
      return product.packWholesalePrice;
    }
    if (saleType === "SHOPKEEPER" && product.packShopkeeperPrice > 0) {
      return product.packShopkeeperPrice;
    }
    return product.packPrice > 0 ? product.packPrice : product.salePrice;
  }
  // Piece sale — use piece-level prices
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
  addItem: (product: Product, qty?: number, isBox?: boolean) => void;
  removeItem: (productId: string, isBox?: boolean) => void;
  removeLastItem: () => void;
  setQty: (productId: string, qty: number, isBox?: boolean) => void;
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

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: 0,
  customerName: "",
  customerPhone: "",
  paymentMethod: "CASH",
  saleType: "RETAIL",
  addItem: (product, qty = 1, isBox = false) =>
    set((state) => {
      // Box and piece entries tracked separately (different isBox flag)
      const existing = state.items.find(
        (i) => i.product.id === product.id && !!i.isBox === !!isBox
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === product.id && !!i.isBox === !!isBox
              ? { ...i, quantity: i.quantity + qty }
              : i
          ),
        };
      }
      return { items: [...state.items, { product, quantity: qty, isBox }] };
    }),
  removeItem: (productId, isBox) =>
    set((state) => ({
      items: state.items.filter(
        (i) => !(i.product.id === productId && !!i.isBox === !!isBox)
      ),
    })),
  removeLastItem: () =>
    set((state) => ({
      items: state.items.slice(0, -1),
    })),
  setQty: (productId, qty, isBox) =>
    set((state) => ({
      items:
        qty <= 0
          ? state.items.filter(
              (i) => !(i.product.id === productId && !!i.isBox === !!isBox)
            )
          : state.items.map((i) =>
              i.product.id === productId && !!i.isBox === !!isBox
                ? { ...i, quantity: qty }
                : i
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
  totals: (taxEnabled) => {
    const { items, discount, saleType } = get();
    let subtotal = 0;
    let taxTotal = 0;
    items.forEach((i) => {
      const price = effectivePrice(i.product, saleType, i.isBox);
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
