# Pakistan POS

A complete Point of Sale (POS) desktop application for shops, built with Next.js + Electron.

## Features

- **Product Management** — Add, edit, delete products with categories, stock, cost/sale prices, tax
- **Barcode Scanner** — Scan company barcodes with your camera to instantly find products
- **Auto Barcode Generation** — Loose items (sugar, ghee, etc.) without a company barcode automatically get a generated EAN-13 barcode
- **Barcode Label Printing** — Print 1–100 barcode labels for any product
- **POS / Billing** — Product grid, cart, checkout (Cash/Card/Mobile), change calculation, printable receipt
- **Auto Data Update** — Stock auto-deducts after each sale; dashboard updates in real-time
- **Sales History** — Full invoice record with customer, cashier, payment method
- **Reports & Dashboard** — Total sales, profit, tax, top products, hourly chart, low-stock alerts
- **User Management** — Multi-user with roles (Admin / Manager / Cashier)
- **Sharing** — All users share a single local database
- **Settings** — Shop name, address, currency, tax, invoice prefix, receipt footer

## Demo Accounts

| Role    | Email                | Password    |
|---------|----------------------|-------------|
| Admin   | admin@pos.local      | admin123    |
| Cashier | cashier@pos.local    | cashier123  |

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM (SQLite)
- **Auth**: NextAuth.js
- **Barcode**: @zxing (scanning), JsBarcode (generation)
- **Desktop**: Electron + electron-builder

## Development

```bash
# Install dependencies
bun install

# Run the web app (dev mode)
bun run dev

# Run as Electron desktop app (requires build first)
bun run electron:build
bun run electron:start
```

## Build Desktop App

```bash
# Builds Next.js standalone + packages Electron app (AppImage + deb for Linux)
bun run electron:build
```

Output is in `release/`.

## Database

The app uses a local SQLite database. On first launch (desktop), a fresh database is created in the user data directory with the default admin/cashier accounts and shop settings.
