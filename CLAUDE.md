# VurKac Pro – Projektkontext & Architektur (Handover für Claude)

## 1. Projektübersicht
**VurKac Pro** ist eine Echtzeit-Immobilien-Suchmaschine & Investment-Analyse-Plattform (Meta-Scraper + Deal-Rechner).
- **Zielgebiet:** Mannheim + 50 km Umkreis (Metropolregion Rhein-Neckar: Mannheim, Ludwigshafen, Heidelberg, Weinheim, Schwetzingen, Speyer, Worms, Bensheim etc.)
- **Objekttyp:** Eigentumswohnungen zum Kauf (ETW), keine Mietwohnungen.
- **Integrierte Portale (4):**
  1. **ImmoScout24** (Direkte Mobile-API Abfrage in < 0.4s)
  2. **Immowelt** (Direkter Scraper)
  3. **eBay Kleinanzeigen** (Direkter Scraper inkl. Filter gegen hochgepushte Alt-Anzeigen / `TOP_AD` durch Prüfung von `#viewad-extra-info`)
  4. **Ohne-Makler.net** (Direkter Scraper)

## 2. Tech-Stack & Verzeichnisstruktur
- **Frontend:** Next.js 14 (App Router), React, TypeScript, TailwindCSS, Lucide Icons
  - [`src/components/InvestorDashboard.tsx`](src/components/InvestorDashboard.tsx): Haupt-UI mit 4-Portal-Filterleiste, Live-WebSocket-Anbindung, Audio-/Browser-Push-Alerts, Kalkulations-Drawer und Live-Scan-Trigger.
  - [`src/lib/realProperties.json`](src/lib/realProperties.json): Persistierte Immobiliendatenbank (aktuell ~290 verifizierte Live-Deals).
- **Backend:** Python FastAPI, AsyncIO, Redis, BeautifulSoup4 / HTTPX
  - [`backend/app/main.py`](backend/app/main.py): FastAPI Server, REST-Endpunkte (`/api/deals/recent`, `/api/mannheim/status`, `/api/mannheim/scan-now`) & WebSocket (`/ws/live-deals`).
  - [`backend/app/mannheim_apify_agent.py`](backend/app/mannheim_apify_agent.py): High-Speed Direct Poller für ImmoScout24, Immowelt & Kleinanzeigen (0,00 € Kosten, kein Apify-Limit).
  - [`backend/app/ohne_makler_scraper.py`](backend/app/ohne_makler_scraper.py): Scraper für Ohne-Makler.net.
  - [`backend/app/scraper_worker.py`](backend/app/scraper_worker.py): 15-Sekunden-Hintergrund-Loop, Deduplizierung über Redis (`fingerprint:{zip}_{sqm}_{price}_{rooms}` & `seen_ids:{portal}`).
  - [`backend/app/calculator.py`](backend/app/calculator.py): Rendite-, Cashflow-, AfA-, Hausgeld- und Marktwert-Spread-Berechnung.
  - [`backend/app/notifier.py`](backend/app/notifier.py): Telegram Push-Benachrichtigungen.

## 3. Wichtige Regeln & Ports
- **Frontend Port:** **Immer Port `3005` nutzen** (`npx next dev -p 3005`), da auf Port `3000` ein anderes Projekt des Nutzers läuft!
- **Backend Port:** Port `8000` (`python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` aus dem `backend`-Ordner).
- **Redis:** Lokal auf Port `6379`.
- **Apify vermeiden:** Die direkte Abfrage in `mannheim_apify_agent.py` ist schneller (<0.5s statt >10s) und kostenlos. Apify Free-Credits sind aufgebraucht.
- **Kleinanzeigen Datum:** Niemals ungeprüft "Heute" aus der Suchliste übernehmen, wenn es eine `TOP_AD` / `PRIORITY_AD` ist – immer das echte Erstelldatum aus der Detailseite (`#viewad-extra-info`) oder über die Anzeigen-ID validieren.

## 4. Startbefehle (Lokal unter Windows)
```powershell
# 1. Backend starten
cd C:\Users\Eymen\.gemini\antigravity\scratch\immo-metrica-mvp\backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. Frontend auf Port 3005 starten
cd C:\Users\Eymen\.gemini\antigravity\scratch\immo-metrica-mvp
npx next dev -p 3005
```
