import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { LicenseGate } from "@/components/license/license-gate";

// v2.10.20: Force dynamic rendering on Vercel to prevent prerendering errors
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pakistan POS — Shop Management System",
  description: "Pakistan POS — Point of Sale system with barcode scanner, products and sales management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isVercel = process.env.VERCEL === "1" || process.env.NEXT_PUBLIC_IS_VERCEL === "true";

  return (
    <html lang="en" suppressHydrationWarning dir="ltr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            {/* v2.10.20: Skip LicenseGate on Vercel — web portal doesn't need license check */}
            {isVercel ? (
              children
            ) : (
              <LicenseGate showBanner={false}>
                {children}
              </LicenseGate>
            )}
            <Toaster />
            <SonnerToaster position="top-center" richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
