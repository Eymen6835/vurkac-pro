"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  DEFAULT_FINANCING_PARAMS,
  FinancingParams,
  PropertyDTO,
  calculatePropertyMetrics,
} from "@/lib/calculations";
import { formatEUR, formatPercent, formatNumber } from "@/lib/utils";
import { GermanyDealMap } from "./GermanyDealMap";
import { PropertyDetailDrawer } from "./PropertyDetailDrawer";
import {
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Building2,
  Layers,
  Clock,
  Sparkles,
  Check,
  RotateCcw,
  ArrowUpDown,
  Table2,
  Columns,
  Percent,
  Wallet,
  BadgeEuro,
  ChevronRight,
  Flame,
  Radio,
} from "lucide-react";

interface InvestorDashboardProps {
  initialProperties: PropertyDTO[];
}

interface RealtimeEnrichedDeal {
  portal: string;
  external_id: string;
  url: string;
  title: string;
  zip_code: string;
  city: string;
  state_code: string;
  price: number;
  living_area: number;
  rooms: number;
  construction_year?: number;
  actual_rent_cold?: number | null;
  has_broker_fee: boolean;
  fingerprint: string;
  price_per_sqm: number;
  estimated_market_value: number;
  market_spread_pct: number;
  estimated_rent_cold: number;
  gross_yield_pct: number;
  net_yield_pct: number;
  monthly_cashflow_pre_tax: number;
  monthly_cashflow_after_tax: number;
  is_top_deal: boolean;
}

const STATE_CODE_MAP: Record<string, string> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Mannheim: { lat: 49.4875, lng: 8.466 },
  Ludwigshafen: { lat: 49.4774, lng: 8.4452 },
  Leipzig: { lat: 51.3397, lng: 12.3731 },
  Heidelberg: { lat: 49.3988, lng: 8.6724 },
  Karlsruhe: { lat: 49.0069, lng: 8.4037 },
};

function zipToCoords(zipCode: string, extId: string): { lat: number; lng: number } {
  const p2 = parseInt(zipCode.slice(0, 2), 10);
  let baseLat = 50.11;
  let baseLng = 8.68;
  if (!isNaN(p2)) {
    if (p2 >= 1 && p2 <= 9) { baseLat = 51.15; baseLng = 13.0; }
    else if (p2 >= 10 && p2 <= 16) { baseLat = 52.50; baseLng = 13.35; }
    else if (p2 >= 17 && p2 <= 19) { baseLat = 53.85; baseLng = 12.10; }
    else if (p2 >= 20 && p2 <= 25) { baseLat = 53.65; baseLng = 10.05; }
    else if (p2 >= 26 && p2 <= 31) { baseLat = 52.65; baseLng = 9.40; }
    else if (p2 >= 32 && p2 <= 39) { baseLat = 51.80; baseLng = 10.20; }
    else if (p2 >= 40 && p2 <= 59) { baseLat = 51.25; baseLng = 7.20; }
    else if (p2 >= 60 && p2 <= 67) { baseLat = 49.95; baseLng = 8.35; }
    else if (p2 >= 68 && p2 <= 79) { baseLat = 48.75; baseLng = 9.05; }
    else if (p2 >= 80 && p2 <= 97) { baseLat = 48.45; baseLng = 11.45; }
    else if (p2 >= 98 && p2 <= 99) { baseLat = 50.98; baseLng = 11.03; }
  }
  let hash = 0;
  for (let i = 0; i < extId.length; i++) {
    hash = (hash * 31 + extId.charCodeAt(i)) % 1000;
  }
  const latOff = ((hash % 100) - 50) * 0.004;
  const lngOff = ((Math.floor(hash / 7) % 100) - 50) * 0.005;
  return { lat: baseLat + latOff, lng: baseLng + lngOff };
}

function mapLiveDealToPropertyDTO(deal: RealtimeEnrichedDeal): PropertyDTO {
  const nowIso = new Date().toISOString();
  const coords = CITY_COORDS[deal.city] ?? zipToCoords(deal.zip_code, deal.external_id);
  const id = `live-${deal.portal}-${deal.external_id}`;
  const brokerPct = deal.has_broker_fee ? 3.57 : 0;
  const nonAlloc = Math.round(deal.living_area * 1.5);
  const maint = Math.round(deal.estimated_rent_cold * 0.05);

  return {
    id,
    title: deal.title,
    description: `Provisionsfreies Original-Inserat auf ${deal.portal} (PLZ ${deal.zip_code} ${deal.city} · Fingerprint: ${deal.fingerprint})`,
    propertyType: "ETW",
    address: `${deal.zip_code} ${deal.city}`,
    zipCode: deal.zip_code,
    city: deal.city,
    district: "Provisionsfrei",
    federalState: STATE_CODE_MAP[deal.state_code] ?? "Baden-Württemberg",
    latitude: coords.lat,
    longitude: coords.lng,
    livingAreaSqm: deal.living_area,
    rooms: deal.rooms,
    yearBuilt: deal.construction_year ?? 1980,
    floor: 2,
    energyClass: "C",
    condition: "Gepflegt",
    isRented: true,
    purchasePrice: deal.price,
    initialPrice: deal.price,
    estimatedRentCold: deal.estimated_rent_cold,
    currentRentCold: deal.actual_rent_cold ?? deal.estimated_rent_cold,
    estimatedMarketValue: deal.estimated_market_value,
    hoaTotalMonthly: nonAlloc + maint + Math.round(deal.living_area * 2.0),
    nonAllocatableHoa: nonAlloc,
    maintenanceReserve: maint,
    brokerFeePercent: brokerPct,
    firstListedAt: nowIso,
    lastUpdatedAt: nowIso,
    sources: [
      {
        id: `src-${id}`,
        portalName: deal.portal,
        externalId: deal.external_id,
        sourceUrl: deal.url,
        listedPrice: deal.price,
        brokerFeePercent: brokerPct,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        isActive: true,
      },
    ],
    priceHistory: [
      {
        id: `ph-${id}`,
        recordedAt: nowIso,
        price: deal.price,
        changePercent: 0,
        portalName: deal.portal,
        note: "Neu im Echtzeit-Stream erfasst",
      },
    ],
  };
}

type SortKey =
  | "liveNewest"
  | "grossYieldDesc"
  | "cashflowDesc"
  | "belowMarketDesc"
  | "priceDropDesc"
  | "priceAsc"
  | "daysOnlineDesc";

export function InvestorDashboard({ initialProperties }: InvestorDashboardProps) {
  const [liveDeals, setLiveDeals] = useState<PropertyDTO[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Echtzeit-Anbindung an FastAPI (/api/deals/recent + WebSocket /ws/live-deals)
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // 1. Initiale letzte Deals aus Redis abrufen
    fetch("http://localhost:8000/api/deals/recent")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RealtimeEnrichedDeal[]) => {
        if (!isMounted || !Array.isArray(data)) return;
        const mapped = data.slice(0, 100).map(mapLiveDealToPropertyDTO);
        setLiveDeals(mapped);
      })
      .catch(() => {});

    // 2. WebSocket-Verbindung zu /ws/live-deals aufbauen
    const connectWs = () => {
      try {
        ws = new WebSocket("ws://localhost:8000/ws/live-deals");
        ws.onopen = () => {
          if (isMounted) setWsConnected(true);
        };
        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const deal: RealtimeEnrichedDeal = JSON.parse(event.data);
            const dto = mapLiveDealToPropertyDTO(deal);
            setLiveDeals((prev) => [
              dto,
              ...prev.filter((item) => item.id !== dto.id),
            ]);
          } catch (err) {
            console.error("Fehler beim Parsen des Live-Deals:", err);
          }
        };
        ws.onclose = () => {
          if (isMounted) {
            setWsConnected(false);
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (isMounted) {
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const allProperties = useMemo(() => {
    const seen = new Set<string>();
    const combined: PropertyDTO[] = [];
    for (const p of [...liveDeals, ...initialProperties]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        combined.push(p);
      }
    }
    return combined;
  }, [liveDeals, initialProperties]);

  // Globale Finanzierungsparameter (wirken in Echtzeit auf alle Objekte)
  const [financingParams, setFinancingParams] = useState<FinancingParams>(
    DEFAULT_FINANCING_PARAMS
  );
  const [showFinancingBar, setShowFinancingBar] = useState<boolean>(false);

  // Filter-States gemäß Spezifikation
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [minYieldPercent, setMinYieldPercent] = useState<number>(0);
  const [maxPurchasePrice, setMaxPurchasePrice] = useState<number>(650000);
  const [onlyCashflowPositive, setOnlyCashflowPositive] = useState<boolean>(false);
  const [minBelowMarketPercent, setMinBelowMarketPercent] = useState<number>(0);
  const [onlyPriceReduced, setOnlyPriceReduced] = useState<boolean>(false);
  const [minDaysOnline, setMinDaysOnline] = useState<number>(0);
  const [selectedState, setSelectedState] = useState<string>("ALLE");
  const [onlyDuplicates, setOnlyDuplicates] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortKey>("liveNewest");

  // Ansichtsmodus: "split" (Split-View mit Karte) oder "table" (Vollbreite-Tabelle)
  const [viewMode, setViewMode] = useState<"split" | "table">("split");

  // Aktuell geöffnetes Objekt im Detail-Drawer
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Alle verfügbaren Bundesländer
  const federalStates = useMemo(() => {
    const set = new Set(allProperties.map((p) => p.federalState));
    return ["ALLE", ...Array.from(set).sort()];
  }, [allProperties]);

  // Dynamische Kalkulation für jedes Inserat
  const enrichedProperties = useMemo(() => {
    return allProperties.map((property) => ({
      property,
      metrics: calculatePropertyMetrics(property, financingParams),
    }));
  }, [allProperties, financingParams]);

  // Filterung & Sortierung
  const filteredProperties = useMemo(() => {
    return enrichedProperties
      .filter(({ property, metrics }) => {
        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          const match =
            property.title.toLowerCase().includes(q) ||
            property.city.toLowerCase().includes(q) ||
            property.district.toLowerCase().includes(q) ||
            property.zipCode.includes(q) ||
            property.federalState.toLowerCase().includes(q);
          if (!match) return false;
        }
        if (selectedState !== "ALLE" && property.federalState !== selectedState) {
          return false;
        }
        if (metrics.grossRentalYieldPercent < minYieldPercent) {
          return false;
        }
        if (maxPurchasePrice < 600000 && property.purchasePrice > maxPurchasePrice) {
          return false;
        }
        if (onlyCashflowPositive && metrics.monthlyCashflowBeforeTax < 0) {
          return false;
        }
        if (metrics.belowMarketValuePercent < minBelowMarketPercent) {
          return false;
        }
        if (onlyPriceReduced && !metrics.priceReduced) {
          return false;
        }
        if (metrics.daysOnline < minDaysOnline) {
          return false;
        }
        if (onlyDuplicates && metrics.duplicateCount < 2) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aIsLive = a.property.id.startsWith("live-");
        const bIsLive = b.property.id.startsWith("live-");
        if (sortBy === "liveNewest") {
          if (aIsLive !== bIsLive) return aIsLive ? -1 : 1;
          return 0;
        }
        switch (sortBy) {
          case "grossYieldDesc":
            return b.metrics.grossRentalYieldPercent - a.metrics.grossRentalYieldPercent;
          case "cashflowDesc":
            return b.metrics.monthlyCashflowBeforeTax - a.metrics.monthlyCashflowBeforeTax;
          case "belowMarketDesc":
            return b.metrics.belowMarketValuePercent - a.metrics.belowMarketValuePercent;
          case "priceDropDesc":
            return b.metrics.totalPriceDropPercent - a.metrics.totalPriceDropPercent;
          case "priceAsc":
            return a.property.purchasePrice - b.property.purchasePrice;
          case "daysOnlineDesc":
            return b.metrics.daysOnline - a.metrics.daysOnline;
          default:
            return 0;
        }
      });
  }, [
    enrichedProperties,
    searchQuery,
    selectedState,
    minYieldPercent,
    maxPurchasePrice,
    onlyCashflowPositive,
    minBelowMarketPercent,
    onlyPriceReduced,
    minDaysOnline,
    onlyDuplicates,
    sortBy,
  ]);

  const resetFilters = () => {
    setSearchQuery("");
    setMinYieldPercent(0);
    setMaxPurchasePrice(650000);
    setOnlyCashflowPositive(false);
    setMinBelowMarketPercent(0);
    setOnlyPriceReduced(false);
    setMinDaysOnline(0);
    setSelectedState("ALLE");
    setOnlyDuplicates(false);
  };

  // Schnell-Presets für Investoren
  const applyTopDealPreset = () => {
    setMinYieldPercent(6.0);
    setMinBelowMarketPercent(15);
    setOnlyPriceReduced(false);
  };

  // Aggregierte KPI-Statistiken über die gefilterten Deals
  const stats = useMemo(() => {
    if (filteredProperties.length === 0) {
      return {
        avgYield: 0,
        avgBelowMarket: 0,
        cashflowPositiveCount: 0,
        highYieldCount: 0,
      };
    }
    const avgYield =
      filteredProperties.reduce((acc, x) => acc + x.metrics.grossRentalYieldPercent, 0) /
      filteredProperties.length;
    const avgBelowMarket =
      filteredProperties.reduce((acc, x) => acc + x.metrics.belowMarketValuePercent, 0) /
      filteredProperties.length;
    const cashflowPositiveCount = filteredProperties.filter(
      (x) => x.metrics.monthlyCashflowBeforeTax >= 0
    ).length;
    const highYieldCount = filteredProperties.filter(
      (x) => x.metrics.grossRentalYieldPercent >= 6.0
    ).length;

    return { avgYield, avgBelowMarket, cashflowPositiveCount, highYieldCount };
  }, [filteredProperties]);

  const selectedProperty = useMemo(
    () => allProperties.find((p) => p.id === selectedPropertyId) ?? null,
    [allProperties, selectedPropertyId]
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-indigo-200 bg-slate-100 shadow-md ring-2 ring-indigo-50">
              <img
                src="vurkac-logo.jpg"
                alt="VurKac Pro Logo"
                className="h-full w-full object-cover object-[50%_28%]"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  VurKac<span className="text-indigo-600"> Pro</span>
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 border border-indigo-200/80">
                  Meta-Search & Deal-Analyzer
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  <Radio className="h-3 w-3 animate-pulse" />
                  {wsConnected
                    ? `LIVE-WS AKTIV (${allProperties.length} Inserate)`
                    : `OHNE-MAKLER LIVE (${allProperties.length} Inserate)`}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Aggregierte Immobilien-Metasuche · Dubletten-Erkennung · Echtzeit-Cashflow-Engine
              </p>
            </div>
          </div>

          {/* Global Financing Assumptions Pill + View Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowFinancingBar((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                showFinancingBar
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
              <span>
                Finanzierungsprofil: {financingParams.equityPercent}% EK ·{" "}
                {formatPercent(financingParams.interestRatePercent, 1)} Zins ·{" "}
                {formatPercent(financingParams.repaymentRatePercent, 1)} Tilgung
              </span>
            </button>

            <button
              onClick={applyTopDealPreset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100/80 transition"
            >
              <Flame className="h-3.5 w-3.5 text-emerald-600" />
              Top-Deals (&gt;6% &amp; &gt;15% u. MW)
            </button>

            {/* View Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1">
              <button
                onClick={() => setViewMode("split")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  viewMode === "split"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Columns className="h-3.5 w-3.5" />
                Split-View
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  viewMode === "table"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                Tabellenansicht
              </button>
            </div>
          </div>
        </div>

        {/* Ausklappbare globale Finanzierungsparameter-Leiste */}
        {showFinancingBar && (
          <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-3.5 sm:px-6">
            <div className="mx-auto max-w-[1600px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-center">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Eigenkapital (% Kaufpreis)</span>
                  <span className="font-semibold text-slate-900">
                    {financingParams.equityPercent} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={financingParams.equityPercent}
                  onChange={(e) =>
                    setFinancingParams({
                      ...financingParams,
                      equityPercent: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Sollzins p.a.</span>
                  <span className="font-semibold text-slate-900">
                    {formatPercent(financingParams.interestRatePercent, 2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1.5}
                  max={6.0}
                  step={0.1}
                  value={financingParams.interestRatePercent}
                  onChange={(e) =>
                    setFinancingParams({
                      ...financingParams,
                      interestRatePercent: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Tilgung p.a.</span>
                  <span className="font-semibold text-slate-900">
                    {formatPercent(financingParams.repaymentRatePercent, 2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={5.0}
                  step={0.25}
                  value={financingParams.repaymentRatePercent}
                  onChange={(e) =>
                    setFinancingParams({
                      ...financingParams,
                      repaymentRatePercent: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Eigene Instandhaltung (€/m²/J.)</span>
                  <span className="font-semibold text-slate-900">
                    {financingParams.additionalMaintenancePerSqmYear} €/m²
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={financingParams.additionalMaintenancePerSqmYear}
                  onChange={(e) =>
                    setFinancingParams({
                      ...financingParams,
                      additionalMaintenancePerSqmYear: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Pers. Grenzsteuersatz</span>
                  <span className="font-semibold text-slate-900">
                    {financingParams.marginalTaxRatePercent} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={45}
                  step={1}
                  value={financingParams.marginalTaxRatePercent}
                  onChange={(e) =>
                    setFinancingParams({
                      ...financingParams,
                      marginalTaxRatePercent: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 space-y-6">
        {/* KPI Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Gefilterte Deals</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {filteredProperties.length}{" "}
                <span className="text-xs font-normal text-slate-400">
                  von {allProperties.length} Inseraten
                </span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Ø Bruttomietrendite</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">
                {formatPercent(stats.avgYield, 2)}
              </div>
              <div className="text-[11px] text-slate-500">
                {stats.highYieldCount} Objekte mit &gt; 6,0 % Rendite
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Percent className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Ø Rabatt zum Marktwert</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">
                {formatPercent(stats.avgBelowMarket, 1)}
              </div>
              <div className="text-[11px] text-slate-500">
                Direkter Equity-Gewinn beim Einkauf
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <BadgeEuro className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-medium text-slate-500">Cashflow-positiv (vor St.)</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {stats.cashflowPositiveCount}{" "}
                <span className="text-xs font-medium text-emerald-600">
                  Sofortiger Überschuss
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Mit aktuellem Zins ({formatPercent(financingParams.interestRatePercent, 1)})
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* INVESTOR-FILTERLEISTE */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* 1. Mindestrendite (%) */}
            <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Mindestrendite (%)</span>
                <span className="font-bold text-emerald-600">
                  ab {formatPercent(minYieldPercent, 1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                step={0.5}
                value={minYieldPercent}
                onChange={(e) => setMinYieldPercent(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Alle</span>
                <span>4%</span>
                <span>6% Top</span>
                <span>8%</span>
              </div>
            </div>

            {/* 2. Max. Kaufpreis */}
            <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Max. Kaufpreis</span>
                <span className="font-bold text-slate-800">
                  {maxPurchasePrice >= 600000 ? "Unbegrenzt" : formatEUR(maxPurchasePrice)}
                </span>
              </div>
              <input
                type="range"
                min={80000}
                max={600000}
                step={10000}
                value={maxPurchasePrice}
                onChange={(e) => setMaxPurchasePrice(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>80k €</span>
                <span>250k €</span>
                <span>600k+ €</span>
              </div>
            </div>

            {/* 3. Unter Marktwert (%) */}
            <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Unter Marktwert (%)</span>
                <span className="font-bold text-amber-600">
                  mind. {formatPercent(minBelowMarketPercent, 0)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={22}
                step={1}
                value={minBelowMarketPercent}
                onChange={(e) => setMinBelowMarketPercent(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0%</span>
                <span>10%</span>
                <span>15% Deal</span>
                <span>22%</span>
              </div>
            </div>

            {/* 4. Vermarktungsdauer (Tage online) */}
            <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Vermarktungsdauer</span>
                <span className="font-bold text-indigo-600">
                  {minDaysOnline === 0 ? "Alle" : `≥ ${minDaysOnline} Tage`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={minDaysOnline}
                onChange={(e) => setMinDaysOnline(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Neu</span>
                <span>30+ Tg.</span>
                <span>60+ Tg. (Ladenhüter)</span>
              </div>
            </div>

            {/* 5. Cashflow-positiv (Ja/Nein) & 6. Preis gesenkt (Ja/Nein) */}
            <div className="flex flex-col justify-between gap-2 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70">
              <button
                type="button"
                onClick={() => setOnlyCashflowPositive((v) => !v)}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  onlyCashflowPositive
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Cashflow-positiv</span>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded ${
                    onlyCashflowPositive
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300"
                  }`}
                >
                  {onlyCashflowPositive && <Check className="h-3 w-3 stroke-[3]" />}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyPriceReduced((v) => !v)}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  onlyPriceReduced
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                    : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Preis gesenkt</span>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded ${
                    onlyPriceReduced
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-300"
                  }`}
                >
                  {onlyPriceReduced && <Check className="h-3 w-3 stroke-[3]" />}
                </span>
              </button>
            </div>

            {/* Suche & Dubletten-Filter */}
            <div className="flex flex-col justify-between gap-2 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/70">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Stadt, PLZ, Titel..."
                  className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlyDuplicates((v) => !v)}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  onlyDuplicates
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Nur Portal-Dubletten</span>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded ${
                    onlyDuplicates
                      ? "bg-amber-500 text-white"
                      : "border border-slate-300"
                  }`}
                >
                  {onlyDuplicates && <Check className="h-3 w-3 stroke-[3]" />}
                </span>
              </button>
            </div>
          </div>

          {/* Sub-Filterleiste: Bundesland, Sortierung & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-medium">Bundesland:</span>
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                {federalStates.map((st) => (
                  <option key={st} value={st}>
                    {st === "ALLE" ? "Alle Bundesländer" : st}
                  </option>
                ))}
              </select>

              <span className="ml-2 text-slate-500 font-medium flex items-center gap-1">
                <ArrowUpDown className="h-3.5 w-3.5 text-indigo-600" />
                Sortierung:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="liveNewest">Neueste Live-Deals oben (Echtzeit)</option>
                <option value="grossYieldDesc">Höchste Bruttomietrendite (%)</option>
                <option value="cashflowDesc">Höchster Cashflow vor Steuern (€)</option>
                <option value="belowMarketDesc">Größter Rabatt unter Marktwert (%)</option>
                <option value="priceDropDesc">Größte Preissenkung (%)</option>
                <option value="daysOnlineDesc">Längste Vermarktungsdauer (Tage)</option>
                <option value="priceAsc">Niedrigster Kaufpreis (€)</option>
              </select>
            </div>

            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Alle Filter zurücksetzen
            </button>
          </div>
        </section>

        {/* HAUPTBEREICH: SPLIT-VIEW ODER TABELLENANSICHT */}
        <div
          className={
            viewMode === "split"
              ? "grid grid-cols-1 xl:grid-cols-12 gap-5 items-start"
              : "block"
          }
        >
          {/* Linke/Haupt-Spalte: Objekt-Tabelle */}
          <div
            className={
              viewMode === "split" ? "xl:col-span-8 overflow-hidden" : "w-full"
            }
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 pl-4 pr-3">Objekt &amp; Portale</th>
                      <th className="px-3 py-3.5 text-right">Kaufpreis &amp; m²</th>
                      <th className="px-3 py-3.5 text-right">Rendite (Brutto/Netto)</th>
                      <th className="px-3 py-3.5 text-right">Marktwert-Diff.</th>
                      <th className="px-3 py-3.5 text-right">Cashflow (v. / n. St.)</th>
                      <th className="px-3 py-3.5 text-right">Historie &amp; Dauer</th>
                      <th className="py-3.5 pl-2 pr-4 text-right">Analyse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredProperties.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-12 text-center text-sm text-slate-500"
                        >
                          Keine Immobilien entsprechen den aktuellen Filterkriterien. Klicke
                          auf &ldquo;Alle Filter zurücksetzen&rdquo;.
                        </td>
                      </tr>
                    ) : (
                      filteredProperties.map(({ property, metrics }) => {
                        const isHighYield = metrics.grossRentalYieldPercent >= 6.0;
                        const isDeepBelowMarket =
                          metrics.belowMarketValuePercent >= 15.0;
                        const isLiveDeal = property.id.startsWith("live-");

                        return (
                          <tr
                            key={property.id}
                            onClick={() => setSelectedPropertyId(property.id)}
                            className={`group cursor-pointer transition hover:bg-slate-50/90 ${
                              selectedPropertyId === property.id
                                ? "bg-indigo-50/60"
                                : ""
                            }`}
                          >
                            {/* 1. Objekt & Portale */}
                            <td className="py-4 pl-4 pr-3 max-w-[310px]">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                {isLiveDeal && (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    LIVE
                                  </span>
                                )}
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                  {property.city} · {property.district}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {property.livingAreaSqm} m² · {property.rooms} Zi. · Bj.{" "}
                                  {property.yearBuilt}
                                </span>
                              </div>
                              <div className="font-semibold text-slate-800 group-hover:text-indigo-600 transition line-clamp-1">
                                {property.title}
                              </div>

                              {/* Portal-Badges & Dubletten-Hinweis */}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                {property.sources.map((src) => (
                                  <span
                                    key={src.id}
                                    className="inline-flex items-center rounded bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-600"
                                  >
                                    {src.portalName}
                                  </span>
                                ))}
                                {metrics.maxPortalSpreadEUR > 0 && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                    <Sparkles className="h-2.5 w-2.5" />-
                                    {formatEUR(metrics.maxPortalSpreadEUR)} Dublette
                                  </span>
                                )}
                                {property.brokerFeePercent === 0 && (
                                  <span className="inline-flex items-center rounded bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                    0% Provision
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Kaufpreis & m² */}
                            <td className="px-3 py-4 text-right whitespace-nowrap">
                              <div className="font-bold text-slate-900 text-sm">
                                {formatEUR(property.purchasePrice)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatEUR(metrics.pricePerSqm)}/m²
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Miete: {formatEUR(property.estimatedRentCold)} (
                                {formatEUR(metrics.rentPerSqm, 1)}/m²)
                              </div>
                            </td>

                            {/* 3. Brutto & Nettomietrendite */}
                            <td className="px-3 py-4 text-right whitespace-nowrap">
                              <div className="inline-flex flex-col items-end">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                                    isHighYield
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : metrics.grossRentalYieldPercent >= 5.0
                                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {isHighYield && <TrendingUp className="h-3 w-3" />}
                                  {formatPercent(metrics.grossRentalYieldPercent, 2)}
                                </span>
                                <span className="mt-1 text-[11px] text-slate-500">
                                  Netto: {formatPercent(metrics.netRentalYieldPercent, 2)}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  Faktor {formatNumber(metrics.factor, 1)}x
                                </span>
                              </div>
                            </td>

                            {/* 4. Marktwert-Abweichung */}
                            <td className="px-3 py-4 text-right whitespace-nowrap">
                              <div className="inline-flex flex-col items-end">
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                                    isDeepBelowMarket
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : metrics.belowMarketValuePercent >= 10
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  -{formatPercent(metrics.belowMarketValuePercent, 1)} u. MW
                                </span>
                                <span className="mt-1 text-[11px] text-slate-500">
                                  MW: {formatEUR(property.estimatedMarketValue)}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-medium">
                                  +{formatEUR(metrics.belowMarketValueEUR)} Equity
                                </span>
                              </div>
                            </td>

                            {/* 5. Monatlicher Cashflow vor / nach Steuern */}
                            <td className="px-3 py-4 text-right whitespace-nowrap">
                              <div
                                className={`font-bold text-sm ${
                                  metrics.monthlyCashflowBeforeTax >= 0
                                    ? "text-emerald-600"
                                    : "text-rose-600"
                                }`}
                              >
                                {metrics.monthlyCashflowBeforeTax >= 0 ? "+" : ""}
                                {formatEUR(metrics.monthlyCashflowBeforeTax)} / Mo.
                              </div>
                              <div className="text-[11px] text-slate-500">
                                n. St.:{" "}
                                <span
                                  className={
                                    metrics.monthlyCashflowAfterTax >= 0
                                      ? "text-emerald-700 font-semibold"
                                      : "text-rose-600 font-medium"
                                  }
                                >
                                  {metrics.monthlyCashflowAfterTax >= 0 ? "+" : ""}
                                  {formatEUR(metrics.monthlyCashflowAfterTax)}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                EK-Rendite: {formatPercent(metrics.returnOnEquityPercent, 1)}
                              </div>
                            </td>

                            {/* 6. Preishistorie & Vermarktungsdauer */}
                            <td className="px-3 py-4 text-right whitespace-nowrap">
                              {metrics.priceReduced ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                  <TrendingDown className="h-3 w-3 text-emerald-600" />-
                                  {formatPercent(metrics.totalPriceDropPercent, 1)} (
                                  -{Math.round(metrics.totalPriceDropEUR / 1000)}k €)
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  Unverändert
                                </span>
                              )}
                              <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-500">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {metrics.daysOnline} Tage online
                              </div>
                            </td>

                            {/* 7. Detail-Drawer öffnen */}
                            <td className="py-4 pl-2 pr-4 text-right whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPropertyId(property.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 group-hover:border-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition"
                              >
                                Rechner
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Rechte Spalte im Split-View: Interaktive Deutschland-Karte */}
          {viewMode === "split" && (
            <div className="xl:col-span-4 xl:sticky xl:top-20">
              <GermanyDealMap
                items={filteredProperties}
                selectedId={selectedPropertyId}
                onSelect={(id) => setSelectedPropertyId(id)}
              />
            </div>
          )}
        </div>
      </main>

      {/* Detail-Drawer mit Echtzeit-Finanzierungsrechner & Preishistorie */}
      <PropertyDetailDrawer
        property={selectedProperty}
        globalParams={financingParams}
        onClose={() => setSelectedPropertyId(null)}
        onUpdateGlobalParams={(next) => setFinancingParams(next)}
      />
    </div>
  );
}
