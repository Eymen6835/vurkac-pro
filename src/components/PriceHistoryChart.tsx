"use client";

import React from "react";
import { PriceHistoryDTO } from "@/lib/calculations";
import { formatEUR, formatPercent } from "@/lib/utils";
import { TrendingDown, Calendar, Tag } from "lucide-react";

interface PriceHistoryChartProps {
  history: PriceHistoryDTO[];
  estimatedMarketValue: number;
  initialPrice: number;
  currentPrice: number;
}

export function PriceHistoryChart({
  history,
  estimatedMarketValue,
  initialPrice,
  currentPrice,
}: PriceHistoryChartProps) {
  const sorted = [...history].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  // Füge aktuellen Zeitpunkt hinzu, damit die Linie bis "Heute" durchläuft
  const points = [
    ...sorted.map((h) => ({
      date: new Date(h.recordedAt),
      price: h.price,
      portalName: h.portalName,
      changePercent: h.changePercent,
      note: h.note,
    })),
    {
      date: new Date(),
      price: currentPrice,
      portalName: "Aktuell",
      changePercent: 0,
      note: "Aktueller Bestpreis",
    },
  ];

  const allValues = [...points.map((p) => p.price), estimatedMarketValue];
  const minVal = Math.min(...allValues) * 0.92;
  const maxVal = Math.max(...allValues) * 1.05;
  const range = Math.max(1, maxVal - minVal);

  const width = 560;
  const height = 200;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minTime = points[0]?.date.getTime() ?? Date.now() - 86400000;
  const maxTime = Math.max(
    minTime + 86400000,
    points[points.length - 1]?.date.getTime() ?? Date.now()
  );

  const getX = (date: Date) => {
    const ratio = (date.getTime() - minTime) / (maxTime - minTime);
    return padLeft + Math.min(1, Math.max(0, ratio)) * plotW;
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / range;
    return padTop + plotH - ratio * plotH;
  };

  const polylinePoints = points.map((p) => `${getX(p.date)},${getY(p.price)}`).join(" ");
  const areaPoints = `${getX(points[0].date)},${padTop + plotH} ${polylinePoints} ${getX(
    points[points.length - 1].date
  )},${padTop + plotH}`;

  const marketValueY = getY(estimatedMarketValue);
  const totalDrop = initialPrice - currentPrice;
  const totalDropPct = initialPrice > 0 ? (totalDrop / initialPrice) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/70">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Preisentwicklung seit Vermarktungsstart</div>
            <div className="text-sm font-semibold text-slate-800">
              {totalDrop > 0 ? (
                <>
                  Gesamter Nachlass:{" "}
                  <span className="text-emerald-600">
                    -{formatEUR(totalDrop)} (-{formatPercent(totalDropPct)})
                  </span>
                </>
              ) : (
                <span className="text-slate-600">Bisher keine Preissenkung seit Start</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <span className="text-slate-600">Angebotspreis</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-emerald-500" />
            <span className="text-emerald-700 font-medium">
              Marktwert ({formatEUR(estimatedMarketValue)})
            </span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="priceGradientLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines */}
          {[0, 0.5, 1].map((step) => {
            const val = minVal + range * step;
            const y = getY(val);
            return (
              <g key={step}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px]"
                >
                  {Math.round(val / 1000)}k €
                </text>
              </g>
            );
          })}

          {/* Geschätzter Marktwert Referenzlinie */}
          <line
            x1={padLeft}
            y1={marketValueY}
            x2={width - padRight}
            y2={marketValueY}
            stroke="#10b981"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text
            x={width - padRight - 4}
            y={marketValueY - 6}
            textAnchor="end"
            className="fill-emerald-600 text-[10px] font-medium"
          >
            Marktwert: {formatEUR(estimatedMarketValue)}
          </text>

          {/* Area & Line */}
          <polygon points={areaPoints} fill="url(#priceGradientLight)" />
          <polyline
            fill="none"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />

          {/* Datenpunkte */}
          {points.map((pt, idx) => {
            const cx = getX(pt.date);
            const cy = getY(pt.price);
            return (
              <g key={idx}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={4.5}
                  className="fill-white stroke-indigo-600"
                  strokeWidth="2.5"
                />
                <text
                  x={cx}
                  y={cy - 9}
                  textAnchor="middle"
                  className="fill-slate-700 text-[10px] font-semibold"
                >
                  {Math.round(pt.price / 1000)}k €
                </text>
                <text
                  x={cx}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px]"
                >
                  {pt.date.toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Chronologische Liste der Preissenkungen */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Chronologie der Preisänderungen
        </div>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {sorted.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-3.5 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-mono text-slate-600">
                  {new Date(entry.recordedAt).toLocaleDateString("de-DE")}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                  <Tag className="h-3 w-3 text-indigo-600" />
                  {entry.portalName}
                </span>
                {entry.note && (
                  <span className="text-slate-500 hidden sm:inline">· {entry.note}</span>
                )}
              </div>
              <div className="flex items-center gap-2 font-medium">
                <span className="text-slate-800">{formatEUR(entry.price)}</span>
                {entry.changePercent < 0 && (
                  <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {formatPercent(entry.changePercent)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
