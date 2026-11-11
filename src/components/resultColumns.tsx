import React from "react";
import type { PropertyDTO, PropertyMetrics } from "@/lib/calculations";
import { normalizeCity } from "@/lib/city";

export interface ResultItem {
  property: PropertyDTO;
  metrics: PropertyMetrics;
}

/** Nutzerdaten pro Inserat, die Spalten wie "Notizen" und "Status" brauchen. */
export interface ColumnContext {
  notes: Record<string, string>;
  status: Record<string, string>;
  setNote: (id: string, value: string) => void;
  setStatus: (id: string, value: string) => void;
}

export type ColumnKey =
  | "pricePerSqm"
  | "price"
  | "city"
  | "marketValue"
  | "marketPct"
  | "cashflow"
  | "roiIst"
  | "roiSoll"
  | "date"
  | "address"
  | "active"
  | "yearBuilt"
  | "energyClass"
  | "hoa"
  | "kreis"
  | "marketValuePerSqm"
  | "rent"
  | "rentPerSqm"
  | "modernized"
  | "notes"
  | "zip"
  | "private"
  | "source"
  | "quarter"
  | "userStatus"
  | "daysOnline"
  | "title"
  | "trend"
  | "currency"
  | "area"
  | "flatType"
  | "rooms"
  | "condition";

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  description: string;
  align: "left" | "right";
  sort: (item: ResultItem, ctx: ColumnContext) => number | string;
  render: (item: ResultItem, ctx: ColumnContext) => React.ReactNode;
  csv: (item: ResultItem, ctx: ColumnContext) => string | number | null;
}

export const DEFAULT_COLUMNS: ColumnKey[] = [
  "pricePerSqm",
  "price",
  "city",
  "marketValue",
  "marketPct",
  "cashflow",
  "roiIst",
  "roiSoll",
  "date",
];

export const USER_STATUS_OPTIONS = [
  "Neu",
  "Prüfen",
  "Besichtigung",
  "Angebot",
  "Gekauft",
  "Abgelehnt",
];

// ---------- Formatierung ----------

export const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const num1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const DASH = "–";

// ---------- Abgeleitete Werte ----------

/** Brutto-Rendite auf die tatsächliche Miete – nur bei vermieteten Objekten. */
export function roiIst({ property }: ResultItem): number | null {
  if (!property.isRented || !property.currentRentCold || property.purchasePrice <= 0) return null;
  return ((property.currentRentCold * 12) / property.purchasePrice) * 100;
}

function monthlyRent({ property }: ResultItem): number {
  return property.isRented && property.currentRentCold
    ? property.currentRentCold
    : property.estimatedRentCold;
}

function usableDistrict(p: PropertyDTO): string | null {
  const d = (p.district ?? "").trim();
  if (!d || d === p.city || d === normalizeCity(p.city)) return null;
  if (/metropolregion|provisionsfrei|unvollständig/i.test(d)) return null;
  if (/[,\d]/.test(d)) return null;
  return d;
}

function streetOf(p: PropertyDTO): string {
  const address = (p.address ?? "").trim();
  if (address && !/^\d{5}\b/.test(address)) return address.split(",")[0].trim();
  // Manche Portale liefern die volle Adresse im district-Feld ("Breslauer Straße 5, 69181 Leimen, …")
  const first = (p.district ?? "").split(",")[0].trim();
  if (first && !/^\d{5}\b/.test(first) && /\d/.test(first) && !/metropolregion/i.test(first)) {
    return first;
  }
  return "";
}

/** "Akazienstraße 29, 68305 Mannheim" */
export function addressLine(p: PropertyDTO): string {
  const street = streetOf(p);
  const place = `${p.zipCode ? `${p.zipCode} ` : ""}${normalizeCity(p.city)}`;
  return street ? `${street}, ${place}` : place;
}

/** "Akazienstraße 29, 68305 Mannheim (Luzenberg), 64 m²" */
export function locationLine(p: PropertyDTO): string {
  const district = usableDistrict(p);
  const area = p.livingAreaSqm ? `, ${Math.round(p.livingAreaSqm)} m²` : "";
  return `${addressLine(p)}${district ? ` (${district})` : ""}${area}`;
}

// Kreisfreie Städte im Umkreis – für alle anderen Orte liefern die Portale keinen Landkreis
const KREISFREIE_STAEDTE = new Set([
  "Mannheim",
  "Heidelberg",
  "Ludwigshafen am Rhein",
  "Worms",
  "Speyer",
  "Frankenthal (Pfalz)",
  "Neustadt an der Weinstraße",
  "Landau in der Pfalz",
  "Kaiserslautern",
  "Darmstadt",
  "Mainz",
  "Karlsruhe",
  "Heilbronn",
  "Frankfurt am Main",
]);

function kreisOf(p: PropertyDTO): string | null {
  const city = normalizeCity(p.city);
  return KREISFREIE_STAEDTE.has(city) ? city : null;
}

/** Jüngste Preisänderung in % (negativ = gesenkt), sonst null. */
function latestPriceChange(p: PropertyDTO): number | null {
  const changes = [...(p.priceHistory ?? [])]
    .filter((h) => h.changePercent)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  return changes.length ? changes[changes.length - 1].changePercent : null;
}

/** Ampel für den Abstand zum Marktwert: Farbe + Anzahl gefüllter Balken (von 5). */
function marketSignal(diffPercent: number): { bars: number; text: string; bar: string } {
  if (diffPercent <= -25) return { bars: 5, text: "text-emerald-600", bar: "bg-emerald-500" };
  if (diffPercent <= -10) return { bars: 4, text: "text-emerald-600", bar: "bg-emerald-500" };
  if (diffPercent <= 0) return { bars: 3, text: "text-emerald-600", bar: "bg-emerald-500" };
  if (diffPercent < 20) return { bars: 2, text: "text-amber-500", bar: "bg-amber-400" };
  return { bars: 1, text: "text-rose-600", bar: "bg-rose-500" };
}

// ---------- Spalten-Bausteine ----------

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Spalte, deren Wert direkt angezeigt, sortiert und exportiert wird. */
function valueColumn(
  key: ColumnKey,
  label: string,
  description: string,
  align: "left" | "right",
  value: (item: ResultItem) => number | string | null,
  format: (v: number | string) => string = (v) => String(v)
): ColumnDef {
  return {
    key,
    label,
    description,
    align,
    sort: (item) => value(item) ?? (align === "right" ? -Infinity : ""),
    render: (item) => {
      const v = value(item);
      return v === null || v === "" ? DASH : format(v);
    },
    csv: (item) => value(item),
  };
}

const money = (v: number | string) => eur0.format(Number(v));
const percent1 = (v: number | string) => `${num1.format(Number(v))} %`;

export const COLUMNS: ColumnDef[] = [
  valueColumn("pricePerSqm", "Preis/m²", "Kaufpreis je Quadratmeter Wohnfläche", "right", (i) => Math.round(i.metrics.pricePerSqm), money),
  valueColumn("price", "Preis", "Kaufpreis laut Inserat", "right", (i) => i.property.purchasePrice, money),
  valueColumn("city", "Ort", "Stadt bzw. Gemeinde", "left", (i) => normalizeCity(i.property.city)),
  valueColumn("marketValue", "Marktwert €", "Geschätzter Marktwert", "right", (i) => i.property.estimatedMarketValue, money),
  {
    key: "marketPct",
    label: "Marktwert %",
    description: "Abweichung vom geschätzten Marktwert",
    align: "right",
    sort: (i) => i.metrics.marketValueDiffPercent,
    csv: (i) => Math.round(i.metrics.marketValueDiffPercent),
    render: (i) => {
      const diff = Math.round(i.metrics.marketValueDiffPercent);
      const signal = marketSignal(i.metrics.marketValueDiffPercent);
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={signal.text}>
            {diff > 0 ? "+" : ""}
            {diff} %
          </span>
          <span className="inline-flex gap-[2px]">
            {[0, 1, 2, 3, 4].map((b) => (
              <span
                key={b}
                className={`h-3.5 w-[3px] rounded-[1px] ${b < signal.bars ? signal.bar : "bg-slate-200"}`}
              />
            ))}
          </span>
        </span>
      );
    },
  },
  valueColumn("cashflow", "Cashflow", "Monatlicher Überschuss – siehe Cashflow-Rechner in den Details", "right", (i) => Math.round(i.metrics.monthlyCashflowBeforeTax), money),
  {
    ...valueColumn("roiIst", "ROI (ist)", "Rendite im Ist-Zustand auf Basis der Ist-Miete", "right", (i) => {
      const v = roiIst(i);
      return v === null ? null : Number(v.toFixed(1));
    }, percent1),
    render: (i) => {
      const v = roiIst(i);
      return v === null ? "-" : percent1(v);
    },
  },
  valueColumn("roiSoll", "ROI (soll)", "Rendite im Soll-Zustand auf Basis der geschätzten Marktmiete", "right", (i) => Number(i.metrics.grossRentalYieldPercent.toFixed(1)), percent1),
  {
    key: "date",
    label: "Datum",
    description: "Wann es inseriert wurde",
    align: "right",
    sort: (i) => new Date(i.property.firstListedAt).getTime() || 0,
    render: (i) => formatDate(i.property.firstListedAt),
    csv: (i) => formatDate(i.property.firstListedAt),
  },

  // ---- standardmäßig ausgeblendet ----
  valueColumn("address", "Adresse", "Straße, PLZ und Ort", "left", (i) => addressLine(i.property)),
  valueColumn("active", "Aktiv", "Inserat ist noch online", "left", (i) =>
    i.property.sources.some((s) => s.isActive) ? "Ja" : "Nein"
  ),
  valueColumn("yearBuilt", "Bj", "Baujahr des Gebäudes", "right", (i) => i.property.yearBuilt || null),
  valueColumn("energyClass", "Energieklasse", "Energieeffizienzklasse laut Energieausweis", "left", (i) => i.property.energyClass || null),
  valueColumn("hoa", "Hausgeld", "Hausgeld pro Monat", "right", (i) => i.property.hoaTotalMonthly || null, money),
  valueColumn("kreis", "Kreis", "Landkreis, kreisfreie Stadt oder Bezirk", "left", (i) => kreisOf(i.property)),
  valueColumn("marketValuePerSqm", "Marktwert €/m²", "Geschätzter Marktwert je Quadratmeter", "right", (i) => Math.round(i.metrics.marketValuePerSqm), money),
  valueColumn("rent", "Miete", "Kaltmiete pro Monat", "right", (i) => Math.round(monthlyRent(i)), money),
  valueColumn("rentPerSqm", "Miete/m²", "Kaltmiete je Quadratmeter", "right", (i) =>
    i.property.livingAreaSqm ? Number((monthlyRent(i) / i.property.livingAreaSqm).toFixed(2)) : null,
    (v) => `${num1.format(Number(v))} €`
  ),
  // Die Portale liefern das Modernisierungsjahr bisher nicht mit
  valueColumn("modernized", "Modernisiert", "Jahr der letzten Modernisierung", "right", () => null),
  {
    key: "notes",
    label: "Notizen",
    description: "Deine Notizen zum Objekt",
    align: "left",
    sort: (i, ctx) => (ctx.notes[i.property.id] ?? "").toLowerCase(),
    csv: (i, ctx) => ctx.notes[i.property.id] ?? "",
    render: (i, ctx) => (
      <input
        type="text"
        defaultValue={ctx.notes[i.property.id] ?? ""}
        placeholder="Notiz…"
        onClick={stop}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => ctx.setNote(i.property.id, e.target.value)}
        className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
      />
    ),
  },
  valueColumn("zip", "PLZ", "Postleitzahl des Objekts", "left", (i) => i.property.zipCode || null),
  valueColumn("private", "Privat", "Privater oder gewerblicher Anbieter", "left", (i) =>
    i.property.brokerFeePercent === 0 ? "Privat" : "Gewerblich"
  ),
  {
    key: "source",
    label: "Quelle",
    description: "Portale, auf denen das Objekt online ist",
    align: "left",
    sort: (i) => i.property.sources.map((s) => s.portalName).join(", ").toLowerCase(),
    csv: (i) => i.property.sources.map((s) => s.portalName).join(", "),
    render: (i) => (
      <span className="inline-flex gap-1.5">
        {i.property.sources.map((s) => (
          <a
            key={s.id}
            href={s.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="text-sky-700 hover:underline"
          >
            {s.portalName}
          </a>
        ))}
      </span>
    ),
  },
  valueColumn("quarter", "Stadtteil", "Stadt- bzw. Ortsteil, soweit bekannt", "left", (i) => usableDistrict(i.property)),
  {
    key: "userStatus",
    label: "Status",
    description: "Dein Bearbeitungsstand für das Objekt",
    align: "left",
    sort: (i, ctx) => ctx.status[i.property.id] ?? "",
    csv: (i, ctx) => ctx.status[i.property.id] ?? "",
    render: (i, ctx) => (
      <select
        value={ctx.status[i.property.id] ?? ""}
        onClick={stop}
        onChange={(e) => ctx.setStatus(i.property.id, e.target.value)}
        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none"
      >
        <option value="">–</option>
        {USER_STATUS_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ),
  },
  valueColumn("daysOnline", "Tage online", "Wie lange es schon läuft", "right", (i) => i.metrics.daysOnline),
  valueColumn("title", "Titel", "Überschrift des Inserats", "left", (i) => i.property.title),
  {
    ...valueColumn("trend", "Trend", "Die jüngste Preisanpassung", "right", (i) => latestPriceChange(i.property)),
    render: (i) => {
      const change = latestPriceChange(i.property);
      if (change === null) return DASH;
      return (
        <span className={change < 0 ? "text-emerald-600" : "text-rose-600"}>
          {change < 0 ? "▼" : "▲"} {num1.format(Math.abs(change))} %
        </span>
      );
    },
  },
  valueColumn("currency", "Währung", "Währung des Kaufpreises", "left", () => "EUR"),
  valueColumn("area", "Wfl.", "Wohnfläche in m²", "right", (i) => i.property.livingAreaSqm || null, (v) => `${num0.format(Number(v))} m²`),
  valueColumn("flatType", "Wohnungstyp", "Art der Wohnung laut Inserat", "left", (i) => i.property.propertyType || null),
  valueColumn("rooms", "Zi", "Anzahl der Zimmer", "right", (i) => i.property.rooms || null, (v) => num0.format(Number(v))),
  valueColumn("condition", "Zustand", "Zustand laut Inserat", "left", (i) => i.property.condition || null),
];

export const COLUMN_MAP = new Map<ColumnKey, ColumnDef>(COLUMNS.map((c) => [c.key, c]));
