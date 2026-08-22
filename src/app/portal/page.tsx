"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Store, CreditCard, ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { LICENSE_CONFIG } from "@/lib/license/config";

export default function LandingPage() {
  const isVercel = process.env.NEXT_PUBLIC_IS_VERCEL === "true";

  // On Vercel: show landing page with portal links
  // On desktop: render normal POS (handled by page.tsx)
  if (!isVercel) {
    return null; // Desktop app renders POS via page.tsx
  }

  const waLink = `https://wa.me/${LICENSE_CONFIG.developer.whatsappNumber}?text=${encodeURIComponent("Assalam o Alaikum, mujhe Pakistan POS ke baray mein maloomat chahiye.")}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-sm">Pakistan POS</span>
          </div>
          <a href={waLink} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="text-emerald-600">
              <MessageCircle className="w-4 h-4 mr-1" /> Support
            </Button>
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-8">
          {/* Logo */}
          <div className="text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center mb-4 shadow-lg">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Pakistan POS</h1>
            <p className="text-sm text-gray-500 mt-2">Pakistan's #1 Point of Sale System</p>
          </div>

          {/* Two Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Shopkeeper Login */}
            <Link href="/portal/login">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer border-2 border-emerald-200 hover:border-emerald-400">
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                    <Store className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-bold">Shopkeeper Login</h2>
                  <p className="text-xs text-gray-500">
                    Access your online dashboard. View sales, manage products, check reports.
                  </p>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                    Login <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </Link>

            {/* Customer Portal */}
            <Card className="border-2 border-blue-200">
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-lg font-bold">Customer Card</h2>
                <p className="text-xs text-gray-500">
                  Scan your card's QR code to check your balance and transaction history.
                </p>
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  📱 Use your phone camera to scan the QR code on your shop card
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-400">
              Developed by Mohsin Rasheed Baga · +923000088482
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
