import React, { useState, useEffect, useMemo } from "react";
import {
  Building2,
  Radio,
  Flame,
  ExternalLink,
  Search,
} from "lucide-react";

const API_RECENT_URL = "http://localhost:8000/api/deals/recent";
const WS_LIVE_URL = "ws://localhost:8000/ws/live-deals";

export default function App() {
  const [deals, setDeals] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyTopDeals, setOnlyTopDeals] = useState(false);

  useEffect(() => {
    let active = true;
    let ws = null;
    let retryTimeout = null;

    fetch(API_RECENT_URL)
      .then((res) => (res.ok ? res.json() : []))
      .then((initialDeals) => {
        if (active && Array.isArray(initialDeals)) {
          setDeals(initialDeals);
        }
      })
      .catch((err) => console.error("Fehler beim Laden der Recent Deals:", err));

    const connectWebSocket = () => {
      ws = new WebSocket(WS_LIVE_URL);

      ws.onopen = () => {
        if (active) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const newDeal = JSON.parse(event.data);
          setDeals((prevDeals) => [
            newDeal,
            ...prevDeals.filter(
              (d) =>
                `${d.portal}_${d.external_id}` !==
                `${newDeal.portal}_${newDeal.external_id}`
            ),
          ]);
        } catch (err) {
          console.error("WebSocket JSON-Fehler:", err);
        }
      };

      ws.onclose = () => {
        if (active) {
          setWsConnected(false);
          retryTimeout = setTimeout(connectWebSocket, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (ws) ws.close();
    };
  }, []);

  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      if (onlyTopDeals && !deal.is_top_deal) return false;
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          deal.city?.toLowerCase().includes(q) ||
          deal.zip_code?.toLowerCase().includes(q) ||
          deal.title?.toLowerCase().includes(q) ||
          deal.portal?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [deals, onlyTopDeals, searchQuery]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-indigo-200 bg-slate-100 shadow-md ring-2 ring-indigo-50">
              <img
                src="/vurkac-logo.jpg"
                alt="VurKac Pro Logo"
                className="h-full w-full object-cover object-[50%_28%]"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">VurKac Pro</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                    wsConnected
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  <Radio className="h-3.5 w-3.5 animate-pulse" />
                  {wsConnected ? "LIVE STREAM AKTIV" : "RECONNECTING..."}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Echtzeit-Delta-Scraper · Cross-Portal Deduplizierung · Cashflow-Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Stadt, PLZ, Portal..."
                className="rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              onClick={() => setOnlyTopDeals((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                onlyTopDeals
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-emerald-600" />
              Nur Top-Deals
            </button>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 pl-4 pr-3">Portal &amp; Objekt</th>
                <th className="px-3 py-3.5 text-right">Kaufpreis &amp; m²</th>
                <th className="px-3 py-3.5 text-right">Marktwert-Spread</th>
                <th className="px-3 py-3.5 text-right">Rendite (Brutto / Netto)</th>
                <th className="px-3 py-3.5 text-right">Cashflow (v. / n. St.)</th>
                <th className="py-3.5 pl-2 pr-4 text-right">Inserat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredDeals.map((deal) => (
                <tr
                  key={`${deal.portal}_${deal.external_id}`}
                  className="hover:bg-slate-50/80 transition"
                >
                  <td className="py-4 pl-4 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {deal.portal}
                      </span>
                      <span className="text-slate-700 font-medium">
                        {deal.zip_code} {deal.city}
                      </span>
                      {deal.is_top_deal && (
                        <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          TOP-DEAL
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-900">{deal.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {deal.living_area} m² · {deal.rooms} Zi. · Bj. {deal.construction_year}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="font-bold text-slate-900">
                      {deal.price?.toLocaleString("de-DE")} €
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {deal.price_per_sqm?.toLocaleString("de-DE")} €/m²
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 font-bold ${
                        deal.market_spread_pct >= 15
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {deal.market_spread_pct > 0 ? `+${deal.market_spread_pct}` : deal.market_spread_pct} %
                    </span>
                    <div className="text-[11px] text-slate-500 mt-1">
                      MW: {deal.estimated_market_value?.toLocaleString("de-DE")} €
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="font-bold text-emerald-600">
                      {deal.gross_yield_pct?.toFixed(2)} %
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Netto: {deal.net_yield_pct?.toFixed(2)} %
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div
                      className={`font-bold ${
                        deal.monthly_cashflow_after_tax >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {deal.monthly_cashflow_after_tax >= 0 ? "+" : ""}
                      {deal.monthly_cashflow_after_tax?.toFixed(0)} € / Mo.
                    </div>
                    <div className="text-[11px] text-slate-500">
                      v. St.: {deal.monthly_cashflow_pre_tax?.toFixed(0)} €
                    </div>
                  </td>
                  <td className="py-4 pl-2 pr-4 text-right">
                    <a
                      href={deal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-600 hover:bg-indigo-600 hover:text-white transition"
                    >
                      Öffnen
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
