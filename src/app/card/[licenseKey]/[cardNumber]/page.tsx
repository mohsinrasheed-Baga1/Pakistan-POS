"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, CreditCard, Phone, MessageCircle, AlertCircle, Wallet } from "lucide-react";
import { LICENSE_CONFIG } from "@/lib/license/config";

export default function CustomerCardPage() {
  const params = useParams();
  const licenseKey = params.licenseKey as string;
  const cardNumber = params.cardNumber as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!licenseKey || !cardNumber) return;
    loadData();
  }, [licenseKey, cardNumber]);

  async function loadData() {
    try {
      const res = await fetch(`/api/portal/card?licenseKey=${licenseKey}&cardNumber=${cardNumber}`);
      const result = await res.json();
      if (result.ok) {
        setData(result);
      } else {
        setError(result.error || "Failed to load card data");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const waLink = `https://wa.me/${LICENSE_CONFIG.developer.whatsappNumber}?text=${encodeURIComponent("Assalam o Alaikum, mujhe apne card ke baray mein maloomat chahiye.")}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50">
        <Card className="w-full max-w-md mx-4 shadow-lg">
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-8 w-32 mx-auto" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-amber-50 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="text-lg font-bold text-red-700">Card Not Found</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">Please contact the shopkeeper for assistance.</p>
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              <button className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 mx-auto">
                <MessageCircle className="w-4 h-4" /> WhatsApp Support
              </button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { card, shop, transactions } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Shop Header */}
        <div className="text-center pt-6 pb-2">
          <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center mx-auto mb-2">
            <Store className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{shop.shopName}</h1>
          {shop.shopAddress && (
            <p className="text-xs text-gray-500">{shop.shopAddress}</p>
          )}
        </div>

        {/* Card Info */}
        <Card className="shadow-lg border-2 border-emerald-200">
          <CardContent className="p-5 space-y-4">
            {/* Customer Name */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium">{card.customerName}</span>
              </div>
              <Badge className="bg-emerald-600 text-xs">{card.cardType}</Badge>
            </div>

            {/* Card Number */}
            <div className="text-xs text-gray-500 font-mono">
              Card: {card.cardNumber}
            </div>

            {/* Balance — big and prominent */}
            <div className="bg-emerald-50 rounded-lg p-4 text-center border border-emerald-200">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Wallet className="w-5 h-5 text-emerald-600" />
                <span className="text-xs text-gray-600 uppercase font-medium">Current Balance</span>
              </div>
              <div className={`text-3xl font-bold ${card.balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                Rs {Math.abs(card.balance).toLocaleString()}
              </div>
              {card.balance < 0 && (
                <p className="text-xs text-red-500 mt-1">(You owe this amount)</p>
              )}
            </div>

            {/* Phone */}
            {card.customerPhone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-3.5 h-3.5" />
                <span>{card.customerPhone}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                Recent Transactions
              </h3>
              <div className="space-y-2">
                {transactions.map((tx: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b text-sm last:border-0">
                    <div>
                      <div className="font-medium">{tx.description || tx.type}</div>
                      {/* v2.10.39: Show invoice number if available */}
                      {tx.invoice_no && (
                        <div className="text-xs text-emerald-700 font-medium font-mono">
                          Invoice: {tx.invoice_no}
                        </div>
                      )}
                      <div className="text-xs text-gray-400">
                        {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className={`font-bold ${tx.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {tx.amount >= 0 ? "+" : ""}Rs {tx.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact */}
        {shop.shopPhone && (
          <a href={`tel:${shop.shopPhone}`} className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Call: {shop.shopPhone}</span>
              </CardContent>
            </Card>
          </a>
        )}

        {/* Footer */}
        <div className="text-center pb-6">
          <p className="text-xs text-gray-400">
            Pakistan POS · Developed by Mohsin Rasheed Baga
          </p>
        </div>
      </div>
    </div>
  );
}
