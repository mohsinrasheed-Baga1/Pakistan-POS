"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Store, Package, Receipt, CreditCard, BarChart3, Settings, LogOut, ShieldCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LICENSE_CONFIG } from "@/lib/license/config";

type ShopData = {
  licenseKey: string;
  shopName: string;
  shopAddress: string;
  customerName: string;
  supabaseUrl: string;
  supabaseKey: string;
};

const NAV = [
  { id: "/portal/dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "/portal/products", label: "Products", icon: Package },
  { id: "/portal/sales", label: "Sales History", icon: Receipt },
  { id: "/portal/cards", label: "Shop Cards", icon: CreditCard },
  { id: "/portal/reports", label: "Reports", icon: BarChart3 },
  { id: "/portal/settings", label: "Settings", icon: Settings },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [shop, setShop] = useState<ShopData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("pakpos_shop");
    if (!stored) {
      router.push("/portal/login");
      return;
    }
    setShop(JSON.parse(stored));
  }, [router]);

  function handleLogout() {
    sessionStorage.removeItem("pakpos_shop");
    router.push("/portal/login");
  }

  if (!shop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const waLink = `https://wa.me/${LICENSE_CONFIG.developer.whatsappNumber}?text=${encodeURIComponent("Assalam o Alaikum, mujhe Pakistan POS portal ke baray mein maloomat chahiye.")}`;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{shop.shopName}</div>
              <div className="text-xs text-muted-foreground truncate">Pakistan POS Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex font-mono text-[10px]">
              {shop.licenseKey}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-60 flex-col border-r bg-background">
          <nav className="flex-1 p-3 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => router.push(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                    active ? "bg-emerald-600 text-white" : "hover:bg-muted text-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t">
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="w-full border-emerald-300 text-emerald-700">
                <MessageCircle className="w-4 h-4 mr-2" /> Support
              </Button>
            </a>
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              Developed by Mohsin Rasheed Baga
            </p>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="lg:hidden border-b bg-background px-2 py-2 flex gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.id;
            return (
              <button
                key={item.id}
                onClick={() => router.push(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                  active ? "bg-emerald-600 text-white" : "hover:bg-muted text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function useShopSupabase() {
  const [sb, setSb] = useState<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("pakpos_shop");
    if (stored) {
      const shop = JSON.parse(stored);
      setSb(createClient(shop.supabaseUrl, shop.supabaseKey, { auth: { persistSession: false } }));
    }
  }, []);

  return sb;
}
