# VurKac Pro – Immobilien-Metasuchmaschine & Investment-Analyse MVP

Ein vollständig interaktives MVP für eine Immobilien-Metasuchmaschine und Kapitalanlage-Analyseplattform (inspiriert von ImmoMetrica).

## Tech-Stack & Architektur
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons
- **Backend & ORM:** Next.js Server Components & API Routes (`/api/properties`) + Prisma ORM
- **Datenbank:**
  - **Sofort-Start (Zero-Config):** Lokale SQLite-Datenbank (`prisma/schema.prisma` -> `dev.db`), bereits mit 25 realistischen deutschen Immobilien-Inseraten geseedet.
  - **PostgreSQL (Docker / Produktion):** Identisches PostgreSQL-Schema unter `prisma/schema.postgres.prisma` sowie `docker-compose.yml` für PostgreSQL 16.

## Kern-Features (Phase 1 MVP)
1. **Datenmodell (`properties`, `property_sources`, `price_history`):**
   - Master-Inserate mit Geodaten (`latitude`, `longitude`), Wohnfläche, Baujahr, Kaufpreis, geschätzter Kaltmiete, geschätztem Marktwert und Hausgeld-Struktur.
   - Multi-Portal-Quellen (`ImmoScout24`, `Kleinanzeigen`, `Immowelt`, `Ohne-Makler`) inkl. Dubletten-Erkennung (zeigt Preis- und Provisionsunterschiede desselben Objekts auf verschiedenen Portalen).
   - Chronologische Preishistorie (`price_history`) zur Analyse von Preissenkungen und Verkäufer-Verhandlungsbereitschaft.
2. **Dynamische Kalkulations-Engine (`src/lib/calculations.ts`):**
   - Quadratmeterpreis (Kaufpreis/m², Kaltmiete/m², Marktwert/m²)
   - Bruttomietrendite, Kaufpreisfaktor & Nettomietrendite (inkl. bundeslandspezifischer Grunderwerbsteuer, Notar/Grundbuch und Maklerprovision)
   - Marktwert-Abweichung in % und € (Equity-Gewinn beim Einkauf)
   - Monatlicher Cashflow **vor Steuern** und **nach Steuern** (inkl. Gebäude-AfA nach § 7 Abs. 4 EStG – 2,0 % bzw. 2,5 % für Altbau vor 1925)
3. **Interaktives Investor-Dashboard (`src/components/InvestorDashboard.tsx`):**
   - Filter für Mindestrendite (%), Max. Kaufpreis (€), Unter Marktwert (%), Vermarktungsdauer (Tage online), Cashflow-positiv (Ja/Nein), Preis gesenkt (Ja/Nein), Nur Portal-Dubletten & Bundesland.
   - **Split-View** (Tabellenansicht + interaktive Deutschland-Geokarte) oder **Vollbreite-Tabellenansicht**.
   - **Detail-Drawer (`src/components/PropertyDetailDrawer.tsx`)** mit Echtzeit-Finanzierungs-Slidern (Kaufpreis-Verhandlung, Kaltmiete, Eigenkapital %, Sollzins %, Tilgung %, nicht-umlegbares Hausgeld) und interaktivem SVG-Preishistorie-Chart.

## Schnellstart

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Datenbank initialisieren & 25 Mock-Inserate seeden
npm run db:setup

# 3. Entwicklungsserver starten
npm run dev
```

Öffne anschließend `http://localhost:3000` im Browser.
