"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  Users,
  Settings as SettingsIcon,
  Store,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  CreditCard,
  LayoutDashboard,
  Warehouse,
  Truck,
  TrendingDown,
  Smartphone,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore, type View } from "@/stores/use-pos-store";
import { PosView } from "@/components/pos/views/pos-view";
import { ProductsView } from "@/components/pos/views/products-view";
import { ScannerView } from "@/components/pos/views/scanner-view";
import { SalesView } from "@/components/pos/views/sales-view";
import { ReportsView } from "@/components/pos/views/reports-view";
import { UsersView } from "@/components/pos/views/users-view";
import { SettingsView } from "@/components/pos/views/settings-view";
import { CardsView } from "@/components/pos/views/cards-view";
import { DashboardView } from "@/components/pos/views/dashboard-view";
import { StoreView } from "@/components/pos/views/store-view";
import { VendorsView } from "@/components/pos/views/vendors-view";
import { ExpensesView } from "@/components/pos/views/expenses-view";
import { LoadBillView } from "@/components/pos/views/loadbill-view";
import { NotificationsBell } from "@/components/pos/notifications-bell";
import { toast } from "sonner";
import { GlobalCalculator } from "@/components/pos/global-calculator";
import { LicenseStatusBadge } from "@/components/license/license-status-badge";

interface AppShellProps {
  user: { id: string; name?: string | null; email?: string | null; role: string };
  settings: any;
}

const NAV: { id: View; label: string; icon: any; minRole?: string; permission?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "canViewDashboard" },
  { id: "pos", label: "Sell (POS)", icon: ShoppingCart, permission: "canSell" },
  { id: "loadbill", label: "Load & Bill", icon: Smartphone, permission: "canAccessLoadBill" },
  { id: "products", label: "Products", icon: Package, permission: "canViewSalesHistory" },
  { id: "store", label: "Main Store", icon: Warehouse, permission: "canAccessMainStore" },
  { id: "vendors", label: "Vendors", icon: Truck, permission: "canAccessVendors" },
  { id: "expenses", label: "Expenses", icon: TrendingDown, permission: "canAccessExpenses" },
  { id: "cards", label: "Shop Cards", icon: CreditCard, permission: "canAccessShopCards" },
  { id: "sales", label: "Sales History", icon: Receipt, permission: "canViewSalesHistory" },
  { id: "reports", label: "Reports", icon: BarChart3, permission: "canViewReports" },
  { id: "users", label: "User Management", icon: Users, minRole: "ADMIN" },
  { id: "settings", label: "Settings", icon: SettingsIcon, minRole: "ADMIN" },
];

export function AppShell({ user, settings }: AppShellProps) {
  const { view, setView, sidebarOpen, setSidebarOpen } = useAppStore();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const roleOrder = { CASHIER: 1, MANAGER: 2, ADMIN: 3 };
  const navItems = NAV.filter((n) => {
    // Check role
    if (n.minRole && roleOrder[user.role as keyof typeof roleOrder] < roleOrder[n.minRole as keyof typeof roleOrder]) {
      return false;
    }
    // Admins see all
    if (user.role === "ADMIN") return true;
    // Check permission (will be undefined for items that only require minRole)
    if (n.permission) {
      // permissions object comes from the user prop (we'll need to add it)
      // For now, fall back to role-based check
      const userPerms = (user as any).permissions;
      if (userPerms && userPerms[n.permission] === false) {
        return false;
      }
    }
    return true;
  });

  // Global calculator state — opens with Ctrl+C on ANY page
  const [calcOpen, setCalcOpen] = React.useState(false);

  // Global shortcuts: Ctrl+Shift+P → POS, Ctrl+C → Calculator (any page)
  React.useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      // Ctrl+Shift+P → jump to POS
      if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        setView("pos");
        toast.success("→ POS");
        return;
      }
      // Ctrl+C → toggle calculator (only if no text is selected, so copy still works)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return; // let copy work
        e.preventDefault();
        setCalcOpen(prev => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [setView]);

  async function handleSignOut() {
    await signOut({ redirect: false });
    toast.success("Logged out");
    router.refresh();
  }

  function renderView() {
    switch (view) {
      case "pos":
        return <PosView settings={settings} />;
      case "scanner":
        return <ScannerView />;
      case "products":
        return <ProductsView userRole={user.role} />;
      case "cards":
        return <CardsView userRole={user.role} />;
      case "sales":
        return <SalesView />;
      case "reports":
        return <ReportsView />;
      case "dashboard":
        return <DashboardView />;
      case "store":
        return <StoreView />;
      case "vendors":
        return <VendorsView userRole={user.role} />;
      case "expenses":
        return <ExpensesView />;
      case "loadbill":
        return <LoadBillView userRole={user.role} />;
      case "users":
        return user.role === "ADMIN" ? <UsersView /> : <PosView settings={settings} />;
      case "settings":
        return user.role === "ADMIN" ? <SettingsView /> : <PosView settings={settings} />;
      default:
        return <DashboardView />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Top bar (mobile) */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-background border-b px-4 h-14">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 font-bold">
          <Store className="w-5 h-5 text-emerald-600" />
          {settings?.shopName || "POS"}
        </div>
        <div className="flex items-center gap-1">
          <LicenseStatusBadge compact />
          <NotificationsBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="theme"
          >
            {mounted && theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar (left for LTR) */}
        <aside
          className={cn(
            "fixed lg:sticky top-0 left-0 z-50 h-screen w-72 bg-background border-r flex flex-col transition-transform lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex items-center justify-between p-4 border-b h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="font-bold text-sm">
                  {settings?.shopName || "POS"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Shop System
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="hidden lg:block">
                <NotificationsBell />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {/* Prominent Sell button */}
            <button
              onClick={() => {
                setView("pos");
                setSidebarOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-md mb-3"
            >
              <ShoppingCart className="w-5 h-5" />
              SELL (POS)
            </button>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t space-y-2">
            {/* License status badge — shows trial days left or permanent status */}
            <div className="flex justify-center">
              <LicenseStatusBadge />
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700">
                {user.name?.[0] || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground">
                  {user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Manager" : "Cashier"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {mounted && theme === "dark" ? (
                  <>
                    <Sun className="w-4 h-4 mr-1" /> Light
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 mr-1" /> Dark
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4 mr-1" /> Logout
              </Button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 min-h-screen flex flex-col">
          <div className="flex-1 p-4 lg:p-6">{renderView()}</div>
          <footer className="mt-auto border-t bg-background py-3 px-4 text-center text-xs text-muted-foreground">
            {settings?.shopName || "POS System"} • Built with Z.ai • All rights reserved
          </footer>
        </main>
      </div>

      {/* Global Calculator — opens with Ctrl+C on ANY page */}
      <GlobalCalculator open={calcOpen} onOpenChange={setCalcOpen} />
    </div>
  );
}
