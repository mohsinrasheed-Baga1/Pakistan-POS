"use client";

import * as React from "react";
import {
  TrendingUp,
  Wallet,
  Receipt,
  Percent,
  RefreshCw,
  Package,
  Tags,
  AlertTriangle,
  ShoppingBag,
  Trophy,
  BarChart3,
  Boxes,
  Calendar as CalendarIcon,
  CalendarDays,
  X,
  Truck,
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatMoney } from "@/lib/pos-utils";
import type { Product } from "@/types";

type RangeKey = "today" | "week" | "month" | "all" | "custom";

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface HourlyPoint {
  hour: string;
  total: number;
}

interface ReportData {
  range: string;
  totalSales: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalTax: number;
  topProducts: TopProduct[];
  hourly: HourlyPoint[];
  lowStock: (Product & { category?: { name: string } | null })[];
  productCount: number;
  categoryCount: number;
  totalStockValue?: number;
  totalRetailValue?: number;
  totalShopStock?: number;
  totalStoreStock?: number;
}

interface ShopSettings {
  currency: string;
  shopName: string;
}

const RANGE_TABS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today's report",
  week: "Last week's report",
  month: "Last month's report",
  all: "All-time report",
  custom: "Custom range report",
};

// Emerald palette for chart bars
const EMERALD_SHADES = [
  "#059669",
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#a7f3d0",
  "#047857",
  "#0d9488",
  "#5eead4",
];

export function ReportsView() {
  const [range, setRange] = React.useState<RangeKey>("today");
  const [data, setData] = React.useState<ReportData | null>(null);
  const [settings, setSettings] = React.useState<ShopSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [settingsLoading, setSettingsLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  // Custom date range state
  const [customFrom, setCustomFrom] = React.useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = React.useState<Date | undefined>(undefined);
  const [appliedFrom, setAppliedFrom] = React.useState<Date | undefined>(undefined);
  const [appliedTo, setAppliedTo] = React.useState<Date | undefined>(undefined);

  const currency = settings?.currency || "Rs";

  const fetchSettings = React.useCallback(async () => {
    try {
      setSettingsLoading(true);
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("settings");
      const json = await res.json();
      setSettings(json.settings as ShopSettings);
    } catch {
      // silent fallback to "Rs"
      setSettings((s) => s || { currency: "Rs", shopName: "POS" });
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const fetchReports = React.useCallback(
    async (
      r: RangeKey,
      opts?: { from?: Date; to?: Date; isRefresh?: boolean }
    ) => {
      const from = opts?.from;
      const to = opts?.to;
      const isRefresh = opts?.isRefresh ?? false;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        let url = `/api/reports?range=${r}`;
        if (r === "custom") {
          if (!from || !to) {
            setData(null);
            return;
          }
          url += `&from=${format(from, "yyyy-MM-dd")}&to=${format(to, "yyyy-MM-dd")}`;
        }
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("reports");
        const json = (await res.json()) as ReportData;
        setData(json);
      } catch {
        toast.error("Failed to load reports. Please try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  React.useEffect(() => {
    fetchReports(range, {
      from: appliedFrom,
      to: appliedTo,
    });
  }, [range, appliedFrom, appliedTo, fetchReports]);

  function handleRefresh() {
    fetchReports(range, {
      from: appliedFrom,
      to: appliedTo,
      isRefresh: true,
    });
    toast.success("Reports refreshed");
  }

  function handleRangeChange(value: string) {
    setRange(value as RangeKey);
  }

  function handleApplyCustom() {
    if (!customFrom || !customTo) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (customFrom > customTo) {
      toast.error("Start date must be before end date");
      return;
    }
    setAppliedFrom(customFrom);
    setAppliedTo(customTo);
    toast.success(
      `Custom range applied: ${format(customFrom, "MMM d, yyyy")} — ${format(customTo, "MMM d, yyyy")}`
    );
  }

  function handleClearCustom() {
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setAppliedFrom(undefined);
    setAppliedTo(undefined);
  }

  const isLoading = loading || settingsLoading;

  return (
    <div className="space-y-5" dir="ltr">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Reports &amp; Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading
              ? "Loading..."
              : range === "custom" && appliedFrom && appliedTo
              ? `${format(appliedFrom, "MMM d, yyyy")} — ${format(appliedTo, "MMM d, yyyy")}`
              : range === "custom"
              ? "Pick a custom date range and apply"
              : RANGE_LABELS[range]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={range} onValueChange={handleRangeChange}>
            <TabsList>
              {RANGE_TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="shrink-0"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Custom date range picker */}
      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">From date</Label>
            <DateField
              placeholder="Start date"
              value={customFrom}
              onSelect={setCustomFrom}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">To date</Label>
            <DateField
              placeholder="End date"
              value={customTo}
              onSelect={setCustomTo}
            />
          </div>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleApplyCustom}
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            Apply
          </Button>
          {(customFrom || customTo || appliedFrom || appliedTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearCustom}
              className="text-muted-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
          {appliedFrom && appliedTo && (
            <span className="text-xs text-muted-foreground ml-auto">
              Showing: {format(appliedFrom, "MMM d, yyyy")} —{" "}
              {format(appliedTo, "MMM d, yyyy")}
            </span>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              title="Total Sales"
              value={formatMoney(data?.totalRevenue ?? 0, currency)}
              icon={<Wallet className="w-5 h-5" />}
              accent="bg-emerald-600"
              accentSoft="bg-emerald-50 text-emerald-700"
              subtitle={`Cost: ${formatMoney(data?.totalCost ?? 0, currency)}`}
            />
            <KpiCard
              title="Profit"
              value={formatMoney(data?.totalProfit ?? 0, currency)}
              icon={<TrendingUp className="w-5 h-5" />}
              accent="bg-teal-600"
              accentSoft="bg-teal-50 text-teal-700"
              subtitle={
                (data?.totalRevenue ?? 0) > 0
                  ? `Margin: ${(
                      ((data?.totalProfit ?? 0) / (data?.totalRevenue ?? 1)) *
                      100
                    ).toFixed(1)}%`
                  : "Margin: —"
              }
            />
            <KpiCard
              title="Sales Count"
              value={`${data?.totalSales ?? 0}`}
              icon={<Receipt className="w-5 h-5" />}
              accent="bg-emerald-700"
              accentSoft="bg-emerald-50 text-emerald-700"
              subtitle="Number of invoices"
            />
            <KpiCard
              title="Tax"
              value={formatMoney(data?.totalTax ?? 0, currency)}
              icon={<Percent className="w-5 h-5" />}
              accent="bg-teal-700"
              accentSoft="bg-teal-50 text-teal-700"
              subtitle="Tax collected"
            />
          </>
        )}
      </div>

      {/* Secondary stat row: counts */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat
            label="Products"
            value={data?.productCount ?? 0}
            icon={<Boxes className="w-4 h-4" />}
          />
          <MiniStat
            label="Categories"
            value={data?.categoryCount ?? 0}
            icon={<Tags className="w-4 h-4" />}
          />
          <MiniStat
            label="Top Items"
            value={data?.topProducts?.length ?? 0}
            icon={<Trophy className="w-4 h-4" />}
          />
          <MiniStat
            label="Low Stock"
            value={data?.lowStock?.length ?? 0}
            icon={<AlertTriangle className="w-4 h-4" />}
            danger={(data?.lowStock?.length ?? 0) > 0}
          />
        </div>
      )}

      {/* Inventory Value card */}
      {!isLoading && (
        <Card className="border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-sm">Inventory Value (Stock Worth)</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <div className="text-xs text-muted-foreground">Shop Stock (pcs)</div>
                <div className="text-lg font-bold text-emerald-700">
                  {data?.totalShopStock ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <div className="text-xs text-muted-foreground">Store Stock (pcs)</div>
                <div className="text-lg font-bold text-amber-700">
                  {data?.totalStoreStock ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <div className="text-xs text-muted-foreground">Cost Value</div>
                <div className="text-lg font-bold text-blue-700">
                  {settings?.currency || "Rs"} {(data?.totalStockValue ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <div className="text-xs text-muted-foreground">Retail Value</div>
                <div className="text-lg font-bold text-emerald-700">
                  {settings?.currency || "Rs"} {(data?.totalRetailValue ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Hourly chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              Today&apos;s Hourly Sales
            </CardTitle>
            <CardDescription>
              Sales trend by hour for today
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full rounded-md" />
            ) : (data?.hourly?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<BarChart3 className="w-10 h-10" />}
                title="No sales yet today"
                desc="Chart will appear once sales come in"
              />
            ) : (
              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.hourly}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="emeraldBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(16,185,129,0.08)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [
                        formatMoney(value, currency),
                        "Sales",
                      ]}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Bar
                      dataKey="total"
                      fill="url(#emeraldBar)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={42}
                    >
                      {data?.hourly?.map((_, idx) => (
                        <Cell key={idx} fill={EMERALD_SHADES[idx % EMERALD_SHADES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top products */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="w-5 h-5 text-emerald-600" />
              Top Products
            </CardTitle>
            <CardDescription>Best-selling items</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : (data?.topProducts?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="w-10 h-10" />}
                title="No sales recorded"
                desc="No top items found in this period"
              />
            ) : (
              <div className="max-h-80 overflow-y-auto pr-1 -mr-1 custom-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">#</TableHead>
                      <TableHead className="text-left">Name</TableHead>
                      <TableHead className="text-left">Qty</TableHead>
                      <TableHead className="text-left">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.topProducts?.map((p, idx) => (
                      <TableRow key={`${p.name}-${idx}`}>
                        <TableCell className="text-left">
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            {idx + 1}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-left font-medium max-w-[140px] truncate">
                          {p.name}
                        </TableCell>
                        <TableCell className="text-left">
                          <Badge variant="secondary">{p.qty}</Badge>
                        </TableCell>
                        <TableCell className="text-left font-semibold text-emerald-700">
                          {formatMoney(p.revenue, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low stock + Quick info */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Low Stock Items
            </CardTitle>
            <CardDescription>
              Items with low or depleted stock
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : (data?.lowStock?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Package className="w-10 h-10" />}
                title="Stock is sufficient"
                desc="No items are running low"
              />
            ) : (
              <div className="max-h-96 overflow-y-auto pr-1 -mr-1 custom-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Name</TableHead>
                      <TableHead className="text-left">Category</TableHead>
                      <TableHead className="text-left">Current Stock</TableHead>
                      <TableHead className="text-left">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.lowStock?.map((p) => {
                      const isZero = (p.stock ?? 0) <= 0;
                      const isLow = !isZero && (p.stock ?? 0) <= (p.minStock || 5);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-left font-medium max-w-[160px] truncate">
                            {p.name}
                          </TableCell>
                          <TableCell className="text-left text-muted-foreground">
                            {p.category?.name || "—"}
                          </TableCell>
                          <TableCell className="text-left">
                            <span
                              className={
                                isZero
                                  ? "font-bold text-red-600"
                                  : isLow
                                  ? "font-semibold text-amber-600"
                                  : "text-foreground"
                              }
                            >
                              {p.stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-left">
                            {isZero ? (
                              <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                                Out of Stock
                              </Badge>
                            ) : isLow ? (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                                Low
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Sufficient</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick summary / profit breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Sales Summary
            </CardTitle>
            <CardDescription>Financial summary for this period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))
            ) : (
              <>
                <SummaryRow
                  label="Revenue"
                  value={formatMoney(data?.totalRevenue ?? 0, currency)}
                />
                <SummaryRow
                  label="Cost"
                  value={formatMoney(data?.totalCost ?? 0, currency)}
                  valueClass="text-amber-600"
                />
                <SummaryRow
                  label="Tax"
                  value={formatMoney(data?.totalTax ?? 0, currency)}
                  valueClass="text-muted-foreground"
                />
                <div className="border-t pt-3">
                  <SummaryRow
                    label="Net Profit"
                    value={formatMoney(data?.totalProfit ?? 0, currency)}
                    valueClass="text-emerald-700 font-bold text-lg"
                    labelClass="font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-lg bg-emerald-50 p-3 text-center">
                    <div className="text-xs text-emerald-700">Invoices</div>
                    <div className="text-lg font-bold text-emerald-700">
                      {data?.totalSales ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg bg-teal-50 p-3 text-center">
                    <div className="text-xs text-teal-700">Avg per Invoice</div>
                    <div className="text-lg font-bold text-teal-700">
                      {formatMoney(
                        (data?.totalRevenue ?? 0) / Math.max(data?.totalSales ?? 1, 1),
                        currency
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendor Balances Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-emerald-600" />
            Vendor Balances
          </CardTitle>
          <CardDescription>Total outstanding balances across all vendors</CardDescription>
        </CardHeader>
        <VendorBalanceSection currency={currency} />
      </Card>

      {/* Custom scrollbar styling */}
      <style jsx global>{`
        .custom-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 9999px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground));
        }
      `}</style>
    </div>
  );
}

/* ---------- Sub components ---------- */

function KpiCard({
  title,
  value,
  icon,
  accent,
  accentSoft,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  accentSoft: string;
  subtitle?: string;
}) {
  return (
    <Card className="overflow-hidden border-border/60 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight mt-1 truncate">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
            )}
          </div>
          <div
            className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${accentSoft}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
      <div className={`h-1 ${accent}`} />
    </Card>
  );
}

function MiniStat({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-3 flex items-center gap-3 ${
        danger ? "border-amber-200 bg-amber-50/50" : ""
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          danger
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-base font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  valueClass,
  labelClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
  labelClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-sm text-muted-foreground ${labelClass || ""}`}>
        {label}
      </span>
      <span className={`text-sm font-medium ${valueClass || ""}`}>{value}</span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
        {icon}
      </div>
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}

function VendorBalanceSection({ currency }: { currency: string }) {
  const [vendors, setVendors] = React.useState<Array<{
    id: string;
    name: string;
    totalPurchased: number;
    totalPaid: number;
    balance: number;
    active: boolean;
  }>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/vendors", { cache: "no-store" });
        const data = await res.json();
        setVendors(data.vendors || []);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalBalance = vendors.reduce((s, v) => s + (v.balance || 0), 0);
  const vendorsWithBalance = vendors.filter((v) => v.balance > 0);

  if (loading) {
    return (
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    );
  }

  return (
    <CardContent className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {vendors.length} vendors total • {vendorsWithBalance.length} with balance
        </span>
        <span className="text-lg font-bold text-red-700">
          Total Due: {formatMoney(totalBalance, currency)}
        </span>
      </div>
      {vendorsWithBalance.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No outstanding vendor balances
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Purchased</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorsWithBalance
                .sort((a, b) => b.balance - a.balance)
                .map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMoney(v.totalPurchased, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMoney(v.totalPaid, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-sm text-red-600">
                      {formatMoney(v.balance, currency)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  );
}

function DateField({
  placeholder,
  value,
  onSelect,
}: {
  placeholder: string;
  value: Date | undefined;
  onSelect: (d: Date | undefined) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-start text-left font-normal h-9 min-w-[150px]"
        >
          <CalendarIcon className="w-4 h-4 mr-2 text-emerald-600" />
          {value ? (
            format(value, "MMM d, yyyy")
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="single"
          selected={value}
          onSelect={(d) => {
            onSelect(d || undefined);
            if (d) setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export default ReportsView;
