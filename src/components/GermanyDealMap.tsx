"use client";

import React from "react";
import { PropertyDTO, PropertyMetrics } from "@/lib/calculations";
import { formatEUR, formatPercent } from "@/lib/utils";
import { MapPin, Sparkles } from "lucide-react";

interface EnrichedProperty {
  property: PropertyDTO;
  metrics: PropertyMetrics;
}

interface GermanyDealMapProps {
  items: EnrichedProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Geografische Bounding-Box Deutschlands für präzise SVG-Projektion
const MIN_LAT = 47.2;
const MAX_LAT = 55.1;
const MIN_LON = 5.8;
const MAX_LON = 15.1;

export function GermanyDealMap({ items, selectedId, onSelect }: GermanyDealMapProps) {
  const width = 420;
  const height = 520;
  const pad = 34;

  const project = (lat: number, lon: number) => {
    const xRatio = (lon - MIN_LON) / (MAX_LON - MIN_LON);
    const yRatio = (lat - MIN_LAT) / (MAX_LAT - MIN_LAT);
    const x = pad + xRatio * (width - pad * 2);
    const y = height - pad - yRatio * (height - pad * 2);
    return { x, y };
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            Geodaten & Deal-Radar ({items.length} Objekte)
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Rendite &gt; 6%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            &gt; 15% u. MW
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            Bestand
          </span>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center my-3 rounded-xl bg-slate-50/80 border border-slate-200/70 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full max-h-[480px]">
          <defs>
            <radialGradient id="mapGlowLight" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width={width} height={height} fill="url(#mapGlowLight)" />

          {/* Koordinaten-Gitter */}
          {[48, 50, 52, 54].map((lat) => {
            const { y } = project(lat, MIN_LON);
            return (
              <g key={`lat-${lat}`}>
                <line
                  x1={pad}
                  y1={y}
                  x2={width - pad}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text x={8} y={y + 3} className="fill-slate-400 text-[9px]">
                  {lat}°N
                </text>
              </g>
            );
          })}

          {[7, 10, 13].map((lon) => {
            const { x } = project(MIN_LAT, lon);
            return (
              <g key={`lon-${lon}`}>
                <line
                  x1={x}
                  y1={pad}
                  x2={x}
                  y2={height - pad}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px]"
                >
                  {lon}°E
                </text>
              </g>
            );
          })}

          {/* Stilisierter Deutschland-Umriss (Polygon) */}
          <path
            d="M 135 55 L 185 45 L 245 65 L 315 80 L 340 140 L 365 215 L 345 270 L 295 305 L 330 375 L 305 455 L 235 470 L 145 455 L 105 390 L 75 305 L 65 220 L 95 145 L 115 95 Z"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1.75"
          />

          {/* Objekt-Pins */}
          {items.map(({ property, metrics }) => {
            const { x, y } = project(property.latitude, property.longitude);
            const isSelected = property.id === selectedId;
            const isHighYield = metrics.grossRentalYieldPercent >= 6.0;
            const isDeepValue = metrics.belowMarketValuePercent >= 15.0;

            const fillClass = isHighYield
              ? "#10b981"
              : isDeepValue
              ? "#f59e0b"
              : "#6366f1";

            return (
              <g
                key={property.id}
                onClick={() => onSelect(property.id)}
                className="cursor-pointer group"
              >
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={16}
                    fill={fillClass}
                    opacity={0.22}
                    className="animate-ping"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 8 : 6}
                  fill={fillClass}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y - 10}
                  textAnchor="middle"
                  className="fill-slate-700 text-[9.5px] font-semibold pointer-events-none select-none"
                >
                  {property.city} ({formatPercent(metrics.grossRentalYieldPercent, 1)})
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          Klicke auf einen Standort-Pin für Echtzeit-Cashflow & Preishistorie
        </span>
        {items.length > 0 && (
          <span className="text-slate-700 font-semibold">
            Ø {formatEUR(items.reduce((acc, i) => acc + i.metrics.pricePerSqm, 0) / items.length)}/m²
          </span>
        )}
      </div>
    </div>
  );
}
