"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  LayoutDashboard,
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  Receipt,
  CreditCard,
  BarChart3,
  Boxes,
  CheckCircle2,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatMoney } from "@/lib/pos-utils";
import { useAppStore } from "@/stores/use-pos-store";
import type { Product, Sale, Settings } from "@/types";

interface NotificationItem {
  id?: string;
  productId?: string;
  name: string;
  barcode?: string;
  stock?: number;
  storeStock?: number;
  minStock?: number;
  expiryDate?: string | null;
  unit?: string;
}

interface NotificationsResponse {
  lowStock: NotificationItem[];
  expiringSoon: NotificationItem[];
  expired: NotificationItem[];
  counts: {
    lowStock: number;
    expiringSoon: number;
    expired: number;
    total: number;
  };
}

interface KpiCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  loading: boolean;
  accent?: "emerald" | "amber" | "rose" | "slate";
}

const ACCENT_CLASSES: Record<
  NonNullable<KpiCardProps["accent"]>,
  { wrap: string; iconBg: string; iconColor: string; value: string }
> = {
  emerald: {
    wrap: "border-emerald-200/60 dark:border-emerald-900/40",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-700 dark:text-emerald-300",
  },
  amber: {
    wrap: "border-amber-200/60 dark:border-amber-900/40",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-700 dark:text-amber-300",
    value: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    wrap: "border-rose-200/60 dark:border-rose-900/40",
    iconBg: "bg-rose-100 dark:bg-rose-900/40",
    iconColor: "text-rose-700 dark:text-rose-300",
    value: "text-rose-700 dark:text-rose-300",
  },
  slate: {
    wrap: "border-slate-200/60 dark:border-slate-800/60",
    iconBg: "bg-slate-100 dark:bg-slate-800/60",
    iconColor: "text-slate-700 dark:text-slate-300",
    value: "text-slate-800 dark:text-slate-100",
  },
};

function KpiCard({
  title,
  value,
  hint,
  icon,
  loading,
  accent = "emerald",
}: KpiCardProps) {
  const a = ACCENT_CLASSES[accent];
  return (
    <Card className={`relative overflow-hidden ${a.wrap}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p className={`mt-2 text-2xl font-bold sm:text-3xl ${a.value}`}>
                {value}
              </p>
            )}
            {hint && (
              <p className="mt-1 text-xs text-muted-foreground truncate">
                {hint}
              </p>
            )}
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.iconBg} ${a.iconColor}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QuickActionProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function QuickAction({ label, icon, onClick }: QuickActionProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="h-auto flex-col items-start gap-2 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        {icon}
      </span>
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </span>
    </Button>
  );
}

export function DashboardView() {
  const { setView } = useAppStore();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [todaySales, setTodaySales] = React.useState<Sale[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [notifications, setNotifications] = React.useState<NotificationsResponse | null>(
    null
  );
  const [topCustomers, setTopCustomers] = React.useState<Array<{ name: string; cardNumber: string; totalPurchases: number; type: string }>>([]);
  const [cardsLoading, setCardsLoading] = React.useState(false);

  const loadAll = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    try {
      const [salesRes, productsRes, settingsRes, notifRes, cardsRes] = await Promise.all([
        fetch("/api/sales?today=true&limit=200", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/notifications", { cache: "no-store" }),
        fetch("/api/cards", { cache: "no-store" }),
      ]);
      const [salesData, productsData, settingsData, notifData] =
        await Promise.all([
          salesRes.json(),
          productsRes.json(),
          settingsRes.json(),
          notifRes.json().catch(() => ({
            lowStock: [],
            expiringSoon: [],
            expired: [],
            counts: { lowStock: 0, expiringSoon: 0, expired: 0, total: 0 },
          })),
        ]);
      setTodaySales(salesData.sales || []);
      setProducts(productsData.products || []);
      setSettings(settingsData.settings || null);
      setNotifications(notifData as NotificationsResponse);
      const cardsData = await cardsRes.json();
      const allCards = cardsData.cards || [];
      const top5 = [...allCards].sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0)).slice(0, 5);
      setTopCustomers(top5);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const currency = settings?.currency || "Rs";
  const shopName = settings?.shopName || "POS System";
  const today = new Date();

  const totalSales = todaySales.reduce((s, x) => s + (x.total || 0), 0);
  const transactions = todaySales.length;
  const lowStockCount = notifications?.counts?.lowStock ?? 0;
  const totalProducts = products.length;
  const lowStockItems = (notifications?.lowStock || []).slice(0, 5);
  const expiringItems = (notifications?.expiringSoon || []).slice(0, 5);
  const recentSales = todaySales.slice(0, 5);

  const paymentBadgeClass = (method: string) => {
    switch (method) {
      case "CASH":
        return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300";
      case "CARD":
        return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300";
      case "MOBILE":
        return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-300";
      case "SHOP_CARD":
        return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300";
      default:
        return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300";
    }
  };

  const quickActions: QuickActionProps[] = [
    {
      label: "Sell (POS)",
      icon: <ShoppingCart className="h-5 w-5" />,
      onClick: () => setView("pos"),
    },
    {
      label: "Products",
      icon: <Package className="h-5 w-5" />,
      onClick: () => setView("products"),
    },
    {
      label: "Shop Cards",
      icon: <CreditCard className="h-5 w-5" />,
      onClick: () => setView("cards"),
    },
    {
      label: "Reports",
      icon: <BarChart3 className="h-5 w-5" />,
      onClick: () => setView("reports"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {format(today, "EEEE, MMMM d, yyyy")} •{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {shopName}
              </span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAll(true)}
          disabled={refreshing}
          className="self-start sm:self-auto"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Today's Sales"
          value={formatMoney(totalSales, currency)}
          hint={`${transactions} transactions`}
          icon={<TrendingUp className="h-5 w-5" />}
          loading={loading}
          accent="emerald"
        />
        <KpiCard
          title="Today's Transactions"
          value={transactions.toString()}
          hint={transactions === 0 ? "No sales yet" : "Sales completed"}
          icon={<Receipt className="h-5 w-5" />}
          loading={loading}
          accent="slate"
        />
        <KpiCard
          title="Low Stock Items"
          value={lowStockCount.toString()}
          hint={lowStockCount === 0 ? "All stocked" : "Needs restocking"}
          icon={<AlertTriangle className="h-5 w-5" />}
          loading={loading}
          accent={lowStockCount === 0 ? "emerald" : "amber"}
        />
        <KpiCard
          title="Total Products"
          value={totalProducts.toString()}
          hint="In catalog"
          icon={<Boxes className="h-5 w-5" />}
          loading={loading}
          accent="slate"
        />
      </div>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((a) => (
            <QuickAction key={a.label} {...a} />
          ))}
        </div>
      </section>

      {/* Three-panel grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Low Stock */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Low Stock</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setView("products")}
              >
                Restock
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Top 5 items needing attention
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : lowStockItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  All products are well stocked
                </p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {lowStockItems.map((item, idx) => (
                  <li
                    key={item.id || item.productId || idx}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Stock:{" "}
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {item.stock ?? 0}
                        </span>{" "}
                        / min {item.minStock ?? 0}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setView("products")}
                    >
                      Restock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  <Clock className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Expiring Soon</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setView("products")}
              >
                View
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Items expiring within 30 days
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : expiringItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  No items expiring soon
                </p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {expiringItems.map((item, idx) => {
                  const exp = item.expiryDate
                    ? new Date(item.expiryDate)
                    : null;
                  const daysLeft = exp
                    ? Math.ceil(
                        (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      )
                    : null;
                  return (
                    <li
                      key={item.id || item.productId || idx}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exp ? format(exp, "MMM d, yyyy") : "—"}
                          {daysLeft !== null && daysLeft >= 0 && (
                            <span className="ml-1 text-rose-600 dark:text-rose-400">
                              • {daysLeft}d left
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          (daysLeft ?? 0) <= 7
                            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300"
                        }
                      >
                        {daysLeft !== null && daysLeft >= 0
                          ? `${daysLeft}d`
                          : "—"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Receipt className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Recent Sales</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setView("sales")}
              >
                All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Last 5 transactions today
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : recentSales.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No sales yet today
                </p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {sale.invoiceNo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sale.createdAt), "h:mm a")}
                        {sale.customerName ? ` • ${sale.customerName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatMoney(sale.total, currency)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${paymentBadgeClass(
                          sale.paymentMethod
                        )}`}
                      >
                        {sale.paymentMethod}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 5 Spending Customers (Shop Cards) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                <Users className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Top 5 Spending Customers</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setView("cards")}
            >
              All Cards
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <CardDescription className="text-xs">
            Customers with highest purchase amounts on Shop Cards
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : topCustomers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No shop card transactions yet
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((c, idx) => (
                <div
                  key={c.cardNumber}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.type === "WHOLESALE" ? "Wholesale" : c.type === "SHOP_KEEPER" ? "Shop Keeper" : "Regular"} • {c.cardNumber}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-violet-700 dark:text-violet-300 shrink-0">
                    {formatMoney(c.totalPurchases, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="hidden" />
    </div>
  );
}
