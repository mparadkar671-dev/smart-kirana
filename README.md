# 🛒 Smart Kirana POS, Inventory & Khata System

[![CI/CD Pipeline](https://github.com/mparadkar671-dev/smart-kirana/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/mparadkar671-dev/smart-kirana/actions/workflows/ci-cd.yml)
[![Tests](https://img.shields.io/badge/tests-43%20passed-brightgreen.svg)](https://github.com/mparadkar671-dev/smart-kirana)
[![PWA Ready](https://img.shields.io/badge/PWA-offline--first-blue.svg)](https://github.com/mparadkar671-dev/smart-kirana)
[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)

> **Zero-Cost, 100% Offline-First Progressive Web Application (PWA)** tailored for Indian General Stores & Kirana shops. Features Vyapar-grade financial accounting, multi-bill POS, barcode scanning, Khata credit registers, loose-weight calculators, and automated WhatsApp statements.

---

## 🌟 Key Highlights

### ⚡ 1. Rapid POS Billing
* **Pareto 80/20 Fast-Tap Grid**: 1-click add for the top 24 most frequently sold Indian grocery staples.
* **Dual Multi-Cart System**: Instantly switch between Bill 1 and Bill 2 without losing items when a customer steps aside.
* **Reverse Price-to-Weight Engine**: Automatic computation for loose items (e.g., enter ₹10 Sugar @ ₹44/kg $\rightarrow$ auto-calculates $0.227\text{ kg}$).
* **Hardware Barcode Scanner Support**: Instant input with audio confirmation beeps (`F2` to search, `/` shortcut).

### 📖 2. Customer Khata & Udhari Register
* **Aging Buckets (`0–7d`, `8–15d`, `15–30d`, `30+d`)**: Automatically sorted by highest outstanding balance.
* **1-Click WhatsApp Statements**: Formatted payment reminders with UPI QR deep links.
* **Passbook Drawer**: Audit trail of every Jama (credit received) and Udhar (credit issued) transaction.

### 📊 3. Vyapar Accounting & Financial Reports
* **True Net Profit/Loss Statement**: Isolates shopkeeper home grocery consumption at cost from store COGS.
* **Product-Wise Margin Analysis**: Tracks cost price, retail price, gross margins, and units sold.
* **Wholesaler Low-Stock Restock List**: Computes suggested order sizes ($2 \times \text{alert} - \text{current}$) and keeps last wholesale purchase rates so distributors don't overcharge.
* **1-Click Exports**: Download instant CSV / Excel spreadsheets or formatted PDF accounting reports.

### 🔒 4. Enterprise Security & Dual Theme
* **Authentication Gateway**: Supabase Auth with live password strength evaluation, email verification, and self-service reset.
* **100% Offline Counter Mode**: Continue billing seamlessly during internet outages using IndexedDB.
* **High-Contrast Dual Mode**: True Dark Mode (`dark:bg-slate-900`) and Crisp White Light Mode.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite 8 |
| **Styling & Icons** | Tailwind CSS v4, Lucide React |
| **Offline Database** | Dexie.js (IndexedDB wrapper with live queries) |
| **Cloud Authentication** | Supabase Auth (`@supabase/supabase-js`) |
| **PWA & Caching** | Workbox, `vite-plugin-pwa` (precache + background sync) |
| **Deployment & Hosting** | Cloudflare Workers/Pages, Vercel, Docker + Nginx |
| **Testing & CI/CD** | Vitest, Testing Library, GitHub Actions, Docker Buildx |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* **Node.js**: v20 or v22+
* **npm**: v10+

### Installation
```bash
# 1. Clone repository
git clone https://github.com/mparadkar671-dev/smart-kirana.git
cd smart-kirana

# 2. Install dependencies
npm install

# 3. Start local development server (running on port 3005)
npm run dev
```
Open [http://localhost:3005](http://localhost:3005) in your browser.

---

## 🧪 Testing & Verification

Run the full Vitest suite (43 acceptance gates covering phases 1–6):
```bash
# Run unit & integration tests
npm test

# Run production build
npm run build
```

---

## 🐳 Docker Deployment

### Run with Docker Compose
```bash
docker compose up -d --build
```
Your store application will be available at [http://localhost:3005](http://localhost:3005) powered by high-performance Nginx.

### Run with Docker CLI
```bash
docker build -t smart-kirana:latest .
docker run -d -p 3005:80 --name smart-kirana-pos smart-kirana:latest
```

---

## 🌳 Git Branching & CI/CD Workflow

| Branch | Environment | Purpose |
| :--- | :--- | :--- |
| **`main`** | **Production** | Live production store. Deploys to Vercel & Cloudflare Workers. |
| **`develop`** | **Staging / Preview** | Active integration branch. Generates automated Vercel Preview links. |
| **`feature/*`** | **Local Development** | Dedicated branches for new features or bug fixes. |

For detailed branching guidelines, read [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md).

---

## 📄 License
Licensed under the [ISC License](LICENSE).
