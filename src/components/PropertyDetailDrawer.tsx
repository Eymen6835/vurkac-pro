"use client";

import React, { useState, useEffect } from "react";
import {
  FinancingParams,
  PropertyDTO,
  calculatePropertyMetrics,
} from "@/lib/calculations";
import { formatEUR, formatPercent, formatNumber } from "@/lib/utils";
import { PriceHistoryChart } from "./PriceHistoryChart";
import {
  X,
  Sliders,
  Layers,
  ExternalLink,
  CheckCircle2,
  Building2,
  MapPin,
  Calculator,
  RotateCcw,
  TrendingDown,
  ShieldCheck,
  Coins,
} from "lucide-react";

interface PropertyDetailDrawerProps {
  property: PropertyDTO | null;
  globalParams: FinancingParams;
  onClose: () => void;
  onUpdateGlobalParams: (next: FinancingParams) => void;
}

export function PropertyDetailDrawer({
  property,
  globalParams,
  onClose,
  onUpdateGlobalParams,
}: PropertyDetailDrawerProps) {
  const [localParams, setLocalParams] = useState<FinancingParams>(globalParams);
  const [simulatedPrice, setSimulatedPrice] = useState<number>(0);
  const [simulatedRent, setSimulatedRent] = useState<number>(0);
  const [simulatedNonAllocHoa, setSimulatedNonAllocHoa] = useState<number>(0);

  useEffect(() => {
    setLocalParams(globalParams);
  }, [globalParams]);

  useEffect(() => {
    if (property) {
      setSimulatedPrice(property.purchasePrice);
      setSimulatedRent(property.estimatedRentCold);
      setSimulatedNonAllocHoa(property.nonAllocatableHoa);
    }
  }, [property]);

  if (!property) return null;

  const metrics = calculatePropertyMetrics(
    property,
    localParams,
    simulatedPrice,
    simulatedRent,
    simulatedNonAllocHoa
  );

  const handleParamChange = <K extends keyof FinancingParams>(
    key: K,
    val: FinancingParams[K]
  ) => {
    const updated = { ...localParams, [key]: val };
    setLocalParams(updated);
  };

  const resetSimulation = () => {
    setLocalParams(globalParams);
    setSimulatedPrice(property.purchasePrice);
    setSimulatedRent(property.estimatedRentCold);
    setSimulatedNonAllocHoa(property.nonAllocatableHoa);
  };

  const applyToAllProperties = () => {
    onUpdateGlobalParams(localParams);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-label="Hintergrund schließen"
      />
      <div className="relative z-10 flex h-full w-full max-w-3xl flex-col overflow-hidden border-l border-slate-200 bg-white text-slate-800 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200/80">
                {property.propertyType} · {property.livingAreaSqm} m² · {property.rooms} Zi.
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 border border-slate-200/70">
                Baujahr {property.yearBuilt} (AfA {formatPercent(metrics.afaRatePercent, 1)})
              </span>
              {metrics.grossRentalYieldPercent >= 6.0 && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  Top-Rendite {formatPercent(metrics.grossRentalYieldPercent, 1)}
                </span>
              )}
              {metrics.belowMarketValuePercent >= 15.0 && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                  {formatPercent(metrics.belowMarketValuePercent, 1)} unter Marktwert
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">
              {property.title}
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-indigo-600" />
              {property.address}, {property.zipCode} {property.city} ({property.district},{" "}
              {property.federalState})
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-[11px] text-slate-500">Kaufpreis & m²</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatEUR(simulatedPrice)}
              </div>
              <div className="text-xs text-slate-500">
                {formatEUR(metrics.pricePerSqm)} / m²
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-[11px] text-slate-500">Brutto / Nettorendite</div>
              <div
                className={`mt-1 text-lg font-bold ${
                  metrics.grossRentalYieldPercent >= 6
                    ? "text-emerald-600"
                    : "text-indigo-600"
                }`}
              >
                {formatPercent(metrics.grossRentalYieldPercent, 2)}
              </div>
              <div className="text-xs text-slate-500">
                Netto: {formatPercent(metrics.netRentalYieldPercent, 2)} · Faktor{" "}
                {formatNumber(metrics.factor, 1)}x
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-[11px] text-slate-500">Cashflow (vor Steuern)</div>
              <div
                className={`mt-1 text-lg font-bold ${
                  metrics.monthlyCashflowBeforeTax >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {metrics.monthlyCashflowBeforeTax >= 0 ? "+" : ""}
                {formatEUR(metrics.monthlyCashflowBeforeTax)} / Mo.
              </div>
              <div className="text-xs text-slate-500">
                Kaltmiete: {formatEUR(simulatedRent)} ({formatEUR(metrics.rentPerSqm, 2)}/m²)
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="text-[11px] text-slate-500">Cashflow (nach Steuern)</div>
              <div
                className={`mt-1 text-lg font-bold ${
                  metrics.monthlyCashflowAfterTax >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {metrics.monthlyCashflowAfterTax >= 0 ? "+" : ""}
                {formatEUR(metrics.monthlyCashflowAfterTax)} / Mo.
              </div>
              <div className="text-xs text-slate-500">
                EK-Rendite: {formatPercent(metrics.returnOnEquityPercent, 1)} p.a.
              </div>
            </div>
          </div>

          {/* Objektbeschreibung & Zustand */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Building2 className="h-4 w-4 text-indigo-600" />
                Objekt-Analyse & Eckdaten
              </span>
              <span>
                Energieeffizienz: <strong className="text-slate-800">{property.energyClass}</strong> ·
                Zustand: <strong className="text-slate-800">{property.condition}</strong> ·{" "}
                {property.isRented ? "Vermietet" : "Bezugsfrei"}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              {property.description}
            </p>
          </div>

          {/* INTERAKTIVER ECHTZEIT-CASHFLOW-RECHNER (SLIDER) */}
          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/30 p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Interaktiver Echtzeit-Finanzierungs- & Cashflow-Simulator
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Passe Kaufpreis, Eigenkapital, Zins, Tilgung und Hausgeld per Slider an
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetSimulation}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <button
                  onClick={applyToAllProperties}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 shadow-sm"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Auf alle Inserate anwenden
                </button>
              </div>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kaufpreis-Verhandlung */}
              <div className="space-y-1.5 rounded-xl bg-white p-3.5 border border-slate-200/90 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Kaufpreis (Verhandlung)</span>
                  <span className="font-semibold text-slate-900">
                    {formatEUR(simulatedPrice)}{" "}
                    {simulatedPrice !== property.purchasePrice && (
                      <span className="text-emerald-600">
                        ({formatPercent(((simulatedPrice - property.purchasePrice) / property.purchasePrice) * 100, 1)})
                      </span>
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.round(property.purchasePrice * 0.7)}
                  max={Math.round(property.purchasePrice * 1.1)}
                  step={1000}
                  value={simulatedPrice}
                  onChange={(e) => setSimulatedPrice(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>-30% ({formatEUR(property.purchasePrice * 0.7)})</span>
                  <span>Inserat: {formatEUR(property.purchasePrice)}</span>
                </div>
              </div>

              {/* Geschätzte / Ziel-Kaltmiete */}
              <div className="space-y-1.5 rounded-xl bg-white p-3.5 border border-slate-200/90 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Kaltmiete / Monat</span>
                  <span className="font-semibold text-slate-900">
                    {formatEUR(simulatedRent)} ({formatEUR(metrics.rentPerSqm, 2)}/m²)
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.round(property.estimatedRentCold * 0.7)}
                  max={Math.round(property.estimatedRentCold * 1.4)}
                  step={10}
                  value={simulatedRent}
                  onChange={(e) => setSimulatedRent(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Ist-Miete: {formatEUR(property.currentRentCold ?? property.estimatedRentCold)}</span>
                  <span>Marktpotenzial: {formatEUR(property.estimatedRentCold * 1.2)}</span>
                </div>
              </div>

              {/* Eigenkapital % */}
              <div className="space-y-1.5 rounded-xl bg-white p-3.5 border border-slate-200/90 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Eigenkapital-Einsatz (Kaufpreis)</span>
                  <span className="font-semibold text-slate-900">
                    {formatPercent(localParams.equityPercent, 0)} (+ NK = {formatEUR(metrics.equityRequiredEUR)})
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={localParams.equityPercent}
                  onChange={(e) => handleParamChange("equityPercent", Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>0% (100%-Finanzierung)</span>
                  <span>Darlehen: {formatEUR(metrics.loanAmountEUR)}</span>
                </div>
              </div>

              {/* Zinssatz % */}
              <div className="space-y-1.5 rounded-xl bg-white p-3.5 border border-slate-200/90 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Sollzinssatz p.a.</span>
                  <span className="font-semibold text-slate-900">
                    {formatPercent(localParams.interestRatePercent, 2)} ({formatEUR(metrics.monthlyInterestEUR)}/Mo.)
                  </span>
                </div>
                <input
                  type="range"
                  min={1.5}
                  max={6.5}
                  step={0.1}
                  value={localParams.interestRatePercent}
                  onChange={(e) =>
                    handleParamChange("interestRatePercent", Number(e.target.value))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>1,5 %</span>
                  <span>3,6 % Marktstandard</span>
                  <span>6,5 %</span>
                </div>
              </div>

              {/* Tilgung % */}
              <div className="space-y-1.5 rounded-xl bg-white p-3.5 border border-slate-200/90 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Anfängliche Tilgung p.a.</span>
                  <span className="font-semibold text-slate-900">
                    {formatPercent(localParams.repaymentRatePercent, 2)} ({formatEUR(metrics.monthlyRepaymentEUR)}/Mo.)
                  </span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={5.0}
                  step={0.25}
                  value={localParams.repaymentRatePercent}
                  onChange={(e) =>
                    handleParamChange("repaymentRatePercent", Number(e.target.value))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>1,0 %</span>
                  <span>2,0 % Standard</span>
                  <span>5,0 %</span>
                </div>
              </div>

              {/* Nicht-umlegbares Hausgeld / Instandhaltung */}
              <div className="space-y-1.5 rounded-xl bg-white p-3.5 border border-slate-200/90 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Nicht-umlegbares Hausgeld + Rücklage</span>
                  <span className="font-semibold text-slate-900">
                    {formatEUR(metrics.monthlyOperatingCostsEUR)} / Mo.
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={300}
                  step={5}
                  value={simulatedNonAllocHoa}
                  onChange={(e) => setSimulatedNonAllocHoa(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>WEG-Anteil: {formatEUR(simulatedNonAllocHoa)}</span>
                  <span>+ Eigene Rücklage: {formatEUR(metrics.monthlyAdditionalMaintenanceEUR)}</span>
                </div>
              </div>
            </div>

            {/* Detaillierte monatliche Cashflow-Rechnung */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs shadow-sm">
                <div className="font-semibold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Monatliche Cashflow-Rechnung</span>
                  <Coins className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>+ Nettokaltmiete (Soll/Markt)</span>
                  <span>+{formatEUR(simulatedRent)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>- Nicht-umlegbares Hausgeld & Rücklage</span>
                  <span>-{formatEUR(metrics.monthlyOperatingCostsEUR)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>- Bankzinsen ({formatPercent(localParams.interestRatePercent, 2)})</span>
                  <span>-{formatEUR(metrics.monthlyInterestEUR)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>- Tilgung ({formatPercent(localParams.repaymentRatePercent, 2)})</span>
                  <span>-{formatEUR(metrics.monthlyRepaymentEUR)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-sm text-slate-900">
                  <span>= Cashflow vor Steuern</span>
                  <span
                    className={
                      metrics.monthlyCashflowBeforeTax >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }
                  >
                    {metrics.monthlyCashflowBeforeTax >= 0 ? "+" : ""}
                    {formatEUR(metrics.monthlyCashflowBeforeTax)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 pt-1">
                  <span>
                    Steuereffekt (inkl. {formatEUR(metrics.monthlyAfaEUR)} AfA/Mo. bei{" "}
                    {localParams.marginalTaxRatePercent}% St.-Satz)
                  </span>
                  <span
                    className={
                      metrics.monthlyTaxEffectEUR <= 0
                        ? "text-emerald-600 font-medium"
                        : "text-amber-600 font-medium"
                    }
                  >
                    {metrics.monthlyTaxEffectEUR <= 0
                      ? `+${formatEUR(Math.abs(metrics.monthlyTaxEffectEUR))} Erstattung`
                      : `-${formatEUR(metrics.monthlyTaxEffectEUR)} Steuer`}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-sm text-slate-900">
                  <span>= Cashflow nach Steuern</span>
                  <span
                    className={
                      metrics.monthlyCashflowAfterTax >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }
                  >
                    {metrics.monthlyCashflowAfterTax >= 0 ? "+" : ""}
                    {formatEUR(metrics.monthlyCashflowAfterTax)}
                  </span>
                </div>
              </div>

              {/* Kaufnebenkosten je Bundesland */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs shadow-sm">
                <div className="font-semibold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Kaufnebenkosten ({property.federalState})</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Kaufpreis</span>
                  <span className="font-medium text-slate-900">{formatEUR(simulatedPrice)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    Grunderwerbsteuer ({formatPercent(metrics.transferTaxPercent, 1)})
                  </span>
                  <span>
                    {formatEUR((simulatedPrice * metrics.transferTaxPercent) / 100)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Notar & Grundbuch ({formatPercent(metrics.notaryPercent, 1)})</span>
                  <span>{formatEUR((simulatedPrice * metrics.notaryPercent) / 100)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    Maklerprovision ({formatPercent(metrics.brokerFeePercent, 2)})
                  </span>
                  <span
                    className={
                      metrics.brokerFeePercent === 0
                        ? "text-emerald-600 font-semibold"
                        : ""
                    }
                  >
                    {metrics.brokerFeePercent === 0
                      ? "0 € (Provisionsfrei!)"
                      : formatEUR((simulatedPrice * metrics.brokerFeePercent) / 100)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-sm text-slate-900">
                  <span>Gesamtinvestition (inkl. {formatPercent(metrics.totalClosingCostPercent, 2)} NK)</span>
                  <span>{formatEUR(metrics.totalInvestmentEUR)}</span>
                </div>
                <div className="flex justify-between text-slate-500 pt-1">
                  <span>Geschätzter Marktwert (Vergleichswert)</span>
                  <span className="text-emerald-600 font-semibold">
                    {formatEUR(property.estimatedMarketValue)} (+
                    {formatEUR(metrics.belowMarketValueEUR)} Equity-Puffer)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* MULTI-PORTAL DUBLETTEN-VERGLEICH (property_sources) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Metasuchmaschine: Gefundene Portal-Quellen ({property.sources.length})
                </h3>
              </div>
              {metrics.maxPortalSpreadEUR > 0 && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  Dubletten-Preisvorteil: {formatEUR(metrics.maxPortalSpreadEUR)} günstiger!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {property.sources.map((src, idx) => {
                const isCheapest = idx === 0;
                return (
                  <div
                    key={src.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 transition ${
                      isCheapest
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${
                          isCheapest
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200/80 text-slate-700"
                        }`}
                      >
                        {src.portalName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {src.portalName}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            #{src.externalId}
                          </span>
                          {isCheapest && property.sources.length > 1 && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              Bestpreis-Quelle
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          Erstmals erfasst am{" "}
                          {new Date(src.firstSeenAt).toLocaleDateString("de-DE")} ·
                          Maklerprovision: {formatPercent(src.brokerFeePercent, 2)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900">
                          {formatEUR(src.listedPrice)}
                        </div>
                        {src.brokerFeePercent === 0 && (
                          <div className="text-[11px] font-medium text-emerald-600">
                            Provisionsfrei
                          </div>
                        )}
                      </div>
                      <a
                        href={src.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition shadow-sm"
                      >
                        Zum Portal
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PREISHISTORIE CHART (price_history) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Preishistorie & Verkäufer-Schmerzgrenze
              </h3>
            </div>
            <PriceHistoryChart
              history={property.priceHistory}
              estimatedMarketValue={property.estimatedMarketValue}
              initialPrice={property.initialPrice}
              currentPrice={property.purchasePrice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
