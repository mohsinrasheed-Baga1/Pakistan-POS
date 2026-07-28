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

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: 0,
  customerName: "",
  customerPhone: "",
  paymentMethod: "CASH",
  saleType: "RETAIL",
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
