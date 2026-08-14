"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Clock, Crown, Gift } from "lucide-react";
import type { StoredLicense } from "@/lib/license/storage";
import { getDaysRemaining } from "@/lib/license/storage";

type Props = {
  license: StoredLicense;
};

export function LicenseBanner({ license }: Props) {
  const daysRemaining = getDaysRemaining(license);
  const isTrial = license.licenseType === "trial";
  const isPermanent = license.licenseType === "permanent" && !license.expiresAt;
  const isExpiringSoon = !isPermanent && daysRemaining <= 3;

  const icon = isTrial ? (
    <Gift className="w-4 h-4 text-emerald-600" />
  ) : isPermanent ? (
    <Crown className="w-4 h-4 text-amber-600" />
  ) : (
    <ShieldCheck className="w-4 h-4 text-blue-600" />
  );

  const label = isTrial
    ? "Trial Active"
    : isPermanent
      ? "Permanent License"
      : "Subscription Active";

  return (
    <Card className={isExpiringSoon ? "border-amber-300 bg-amber-50/50" : ""}>
      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <div className="font-medium text-sm">{license.shopName}</div>
            <div className="text-xs text-muted-foreground">
              {license.customerName} · {label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPermanent && (
            <Badge variant={isExpiringSoon ? "destructive" : "secondary"} className="font-mono">
              <Clock className="w-3 h-3 mr-1" />
              {daysRemaining}d left
            </Badge>
          )}
          {isPermanent && (
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              Lifetime
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
