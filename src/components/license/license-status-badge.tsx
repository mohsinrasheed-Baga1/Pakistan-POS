"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Gift,
  Crown,
  ShieldCheck,
  Clock,
  AlertCircle,
  MessageCircle,
  ShoppingCart,
} from "lucide-react";
import type { StoredLicense } from "@/lib/license/storage";
import {
  getStoredLicense,
  getDaysRemaining,
  isTrialLicense,
  getTrialSalesRemaining,
} from "@/lib/license/storage";
import { LICENSE_CONFIG } from "@/lib/license/config";

/**
 * Compact license status banner shown at top of POS app.
 * Updates every 30 seconds so days-remaining countdown stays fresh.
 */
export function LicenseStatusBadge({ compact = false }: { compact?: boolean }) {
  const [license, setLicense] = useState<StoredLicense | null>(null);
  const [trialSalesRemaining, setTrialSalesRemaining] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const l = getStoredLicense();
    setLicense(l);
    if (isTrialLicense(l)) {
      setTrialSalesRemaining(getTrialSalesRemaining());
    }

    // Refresh every 30 seconds (so days-remaining + trial sales count updates)
    const t = setInterval(() => {
      const l2 = getStoredLicense();
      setLicense(l2);
      if (isTrialLicense(l2)) {
        setTrialSalesRemaining(getTrialSalesRemaining());
      } else {
        setTrialSalesRemaining(null);
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  if (!mounted || !license) return null;

  const daysRemaining = getDaysRemaining(license);
  const isTrial = license.licenseType === "trial";
  const isPermanent = license.licenseType === "permanent" && !license.expiresAt;
  const isExpiringSoon = !isPermanent && daysRemaining <= 3;

  const icon = isTrial ? (
    <Gift className="w-3 h-3 text-emerald-600" />
  ) : isPermanent ? (
    <Crown className="w-3 h-3 text-amber-600" />
  ) : (
    <ShieldCheck className="w-3 h-3 text-blue-600" />
  );

  const label = isTrial ? "Trial" : isPermanent ? "Lifetime" : "Subscription";

  if (compact) {
    return (
      <Badge
        variant={isExpiringSoon ? "destructive" : "secondary"}
        className="text-[10px] font-mono gap-1"
        title={`License: ${label} • ${isPermanent ? "Lifetime" : `${daysRemaining}d left`}${
          isTrial && trialSalesRemaining !== null ? ` • ${trialSalesRemaining} sales left today` : ""
        }`}
      >
        {icon}
        {isPermanent ? "LIFE" : `${daysRemaining}d`}
        {isTrial && trialSalesRemaining !== null && (
          <span className="ml-1 opacity-70">·{trialSalesRemaining}sale</span>
        )}
      </Badge>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs ${
        isExpiringSoon
          ? "bg-amber-50 border border-amber-200 text-amber-900"
          : isTrial
            ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
            : "bg-blue-50 border border-blue-200 text-blue-900"
      }`}
    >
      {icon}
      <span className="font-semibold">{label}</span>
      {!isPermanent && (
        <>
          <span className="opacity-50">•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
          </span>
        </>
      )}
      {isTrial && trialSalesRemaining !== null && (
        <>
          <span className="opacity-50">•</span>
          <span className="flex items-center gap-1">
            <ShoppingCart className="w-3 h-3" />
            {trialSalesRemaining} sales today
          </span>
        </>
      )}
      {isExpiringSoon && (
        <a
          href={`https://wa.me/${LICENSE_CONFIG.developer.whatsappNumber}?text=${encodeURIComponent(
            "Mera license/trial expire hone wala hai. Renewal chahiye.",
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-emerald-700 hover:underline font-medium"
        >
          <MessageCircle className="w-3 h-3" />
          Renew
        </a>
      )}
    </div>
  );
}
