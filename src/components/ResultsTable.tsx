"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Poppins } from "next/font/google";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChartColumn,
  ChartLine,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Maximize,
  Minimize,
  Star,
  Table2,
  Trash2,
} from "lucide-react";
import {
  COLUMN_MAP,
  DEFAULT_COLUMNS,
  eur0,
  locationLine,
  type ColumnContext,
  type ColumnKey,
  type ResultItem,
} from "./resultColumns";
import {
  PAGE_SIZE_OPTIONS,
  TableConfigDialog,
  type RowSize,
  type TableConfig,
} from "./TableConfigDialog";

export type { ResultItem } from "./resultColumns";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"] });

const LS_FAVORITES = "vurkac.favorites";
const LS_HIDDEN = "vurkac.hidden";
const LS_CONFIG = "vurkac.tableConfig";
const LS_NOTES = "vurkac.notes";
const LS_STATUS = "vurkac.status";

const DEFAULT_CONFIG: TableConfig = { columns: DEFAULT_COLUMNS, rowSize: "normal", pageSize: 50 };

const ROW_PADDING: Record<RowSize, string> = {
  compact: "py-0.5",
  normal: "py-1.5",
  large: "py-3",
};

const PORTAL_LABELS: Record<string, string> = {
  ImmoScout24: "ImmoScout",
  Immowelt: "immowelt",
  Kleinanzeigen: "Kleinanzeigen",
  "Ohne-Makler": "Ohne-Makler",
};

function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ---------- localStorage (darf fehlschlagen, z. B. im Privatmodus) ----------

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignorieren */
  }
}

function loadConfig(): TableConfig {
  const stored = loadJSON<Partial<TableConfig>>(LS_CONFIG, {});
  const columns = (stored.columns ?? []).filter((k) => COLUMN_MAP.has(k));
  return {
    columns: columns.length > 0 ? columns : DEFAULT_COLUMNS,
    rowSize: stored.rowSize && stored.rowSize in ROW_PADDING ? stored.rowSize : "normal",
    pageSize: PAGE_SIZE_OPTIONS.includes(stored.pageSize ?? 0) ? stored.pageSize! : 50,
  };
}

// ---------- CSV (exportiert die aktuell sichtbaren Spalten) ----------

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(items: ResultItem[], columns: ColumnKey[], ctx: ColumnContext) {
  const defs = columns.map((k) => COLUMN_MAP.get(k)!);
  const header = ["Titel", "Link", ...defs.map((c) => c.label)];
  const rows = items.map((item) =>
    [
      item.property.title,
      item.property.sources[0]?.sourceUrl ?? "",
      ...defs.map((c) => c.csv(item, ctx)),
    ]
      .map(csvCell)
      .join(";")
  );
  // BOM, damit Excel die Umlaute korrekt erkennt
  const blob = new Blob(["﻿" + [header.join(";"), ...rows].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vurkac-wohnungen-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Komponente ----------

type SortKey = ColumnKey | "object";

interface ResultsTableProps {
  items: ResultItem[];
  /** z. B. "in Mannheim" – erscheint in der Überschrift "665 Wohnungen in Mannheim gefunden" */
  scopeLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShowStats: () => void;
  /** Ändert sich die Sortierung im Dashboard-Dropdown, wird die Spalten-Sortierung verworfen. */
  externalSortKey: string;
}

export function ResultsTable({
  items,
  scopeLabel,
  selectedId,
  onSelect,
  onShowStats,
  externalSortKey,
}: ResultsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>({
    key: "date",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<TableConfig>(DEFAULT_CONFIG);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatusMap] = useState<Record<string, string>>({});
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Gespeicherte Einstellungen nach dem Mount laden (→ kein Hydration-Mismatch)
  useEffect(() => {
    setConfig(loadConfig());
    setFavorites(new Set(loadJSON<string[]>(LS_FAVORITES, [])));
    setHidden(new Set(loadJSON<string[]>(LS_HIDDEN, [])));
    setNotes(loadJSON<Record<string, string>>(LS_NOTES, {}));
    setStatusMap(loadJSON<Record<string, string>>(LS_STATUS, {}));
  }, []);

  // Dropdown-Sortierung im Dashboard hat Vorrang, sobald sie geändert wird
  const firstExternal = useRef(true);
  useEffect(() => {
    if (firstExternal.current) {
      firstExternal.current = false;
      return;
    }
    setSort(null);
    setPage(1);
  }, [externalSortKey]);

  useEffect(() => {
    if (!fullscreen || configOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen, configOpen]);

  const setNote = useCallback((id: string, value: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (value.trim()) next[id] = value.trim();
      else delete next[id];
      saveJSON(LS_NOTES, next);
      return next;
    });
  }, []);

  const setStatus = useCallback((id: string, value: string) => {
    setStatusMap((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      saveJSON(LS_STATUS, next);
      return next;
    });
  }, []);

  const ctx: ColumnContext = useMemo(
    () => ({ notes, status, setNote, setStatus }),
    [notes, status, setNote, setStatus]
  );

  const rows = useMemo(() => {
    let list = items.filter(({ property }) => !hidden.has(property.id));
    if (onlyFavorites) list = list.filter(({ property }) => favorites.has(property.id));
    if (sort) {
      const factor = sort.dir === "asc" ? 1 : -1;
      const value = (item: ResultItem) =>
        sort.key === "object"
          ? item.property.title.toLowerCase()
          : COLUMN_MAP.get(sort.key)!.sort(item, ctx);
      list = [...list].sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb, "de") * factor;
        }
        return ((va as number) - (vb as number)) * factor;
      });
    }
    return list;
  }, [items, hidden, favorites, onlyFavorites, sort, ctx]);

  const pageSize = config.pageSize;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const medianDaysOnline = useMemo(() => median(rows.map((r) => r.metrics.daysOnline)), [rows]);
  const medianPricePerSqm = useMemo(() => median(rows.map((r) => r.metrics.pricePerSqm)), [rows]);

  const goToPage = (p: number) => {
    setPage(p);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const toggleSort = (key: SortKey) => {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) {
        // Text aufsteigend, Zahlen/Datum zuerst absteigend
        const isText = key === "object" || COLUMN_MAP.get(key as ColumnKey)?.align === "left";
        return { key, dir: isText ? "asc" : "desc" };
      }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const toggleInSet = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    storageKey: string,
    id: string
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveJSON(storageKey, Array.from(next));
      return next;
    });
  };

  const saveConfig = (next: TableConfig) => {
    setConfig(next);
    saveJSON(LS_CONFIG, next);
    setPage(1);
    // Sortierung nach einer ausgeblendeten Spalte aufheben
    if (sort && sort.key !== "object" && !next.columns.includes(sort.key)) setSort(null);
    setConfigOpen(false);
  };

  const restoreHidden = () => {
    setHidden(new Set());
    saveJSON(LS_HIDDEN, []);
  };

  const columns = config.columns.map((k) => COLUMN_MAP.get(k)!).filter(Boolean);
  const rowPadding = ROW_PADDING[config.rowSize];
  const firstIndex = rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastIndex = Math.min(currentPage * pageSize, rows.length);

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sort?.key !== k) return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
    return sort.dir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-slate-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-slate-600" />
    );
  };

  const toolbarButton =
    "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-slate-50 transition";

  return (
    <div
      className={`${poppins.className} ${
        fullscreen ? "fixed inset-0 z-50 flex flex-col bg-slate-50 p-4" : ""
      }`}
    >
      {/* Kopfzeile: Trefferzahl + Aktionen */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">
          {rows.length.toLocaleString("de-DE")} Wohnungen{scopeLabel ? ` ${scopeLabel}` : ""} gefunden
        </div>
        <div className="flex items-center gap-2">
          <button className={toolbarButton} onClick={() => exportCsv(rows, config.columns, ctx)}>
            <FileText className="h-3.5 w-3.5" />
            CSV-Export
          </button>
          <button className={toolbarButton} onClick={() => setFullscreen((f) => !f)}>
            {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
            {fullscreen ? "Vollbild beenden" : "Vollbild"}
          </button>
          <button className={toolbarButton} onClick={() => setConfigOpen(true)}>
            <Table2 className="h-3.5 w-3.5" />
            Tabelle konfigurieren
          </button>
        </div>
      </div>

      {/* Tabelle */}
      <div
        className={`flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white ${
          fullscreen ? "min-h-0 flex-1" : ""
        }`}
      >
        <div
          ref={scrollRef}
          className={`overflow-auto ${fullscreen ? "min-h-0 flex-1" : "max-h-[72vh]"}`}
        >
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="w-[72px] py-2.5" />
                <th className="min-w-[280px] py-2.5 pr-3 font-normal">
                  <button
                    onClick={() => toggleSort("object")}
                    className="inline-flex items-center gap-1 hover:text-slate-800"
                  >
                    Objekt <SortIcon k="object" />
                  </button>
                </th>
                {columns.map((c, i) => (
                  <th
                    key={c.key}
                    title={c.description}
                    className={`whitespace-nowrap px-3 py-2.5 font-normal ${
                      c.align === "right" ? "text-right" : "text-left"
                    } ${i === 0 ? "border-l border-slate-200" : ""}`}
                  >
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      {c.label} <SortIcon k={c.key} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[13px] text-slate-800">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="py-12 text-center text-sm text-slate-500">
                    Keine Wohnungen entsprechen den aktuellen Filtern.
                  </td>
                </tr>
              ) : (
                pageRows.map((item) => {
                  const p = item.property;
                  const isFav = favorites.has(p.id);
                  const [mainSource, ...otherSources] = p.sources;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelect(p.id)}
                      className={`cursor-pointer border-b border-slate-100 border-l-[3px] border-l-sky-600 transition hover:bg-slate-50 ${
                        selectedId === p.id ? "bg-sky-50/70" : ""
                      }`}
                    >
                      <td className={`${rowPadding} pl-2 align-middle`}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleInSet(setFavorites, LS_FAVORITES, p.id);
                            }}
                            title={isFav ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                            className="rounded p-0.5 hover:bg-amber-50"
                          >
                            <Star
                              className={`h-[18px] w-[18px] text-amber-400 ${isFav ? "fill-amber-400" : ""}`}
                            />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleInSet(setHidden, LS_HIDDEN, p.id);
                            }}
                            title="Inserat ausblenden"
                            className="rounded p-0.5 hover:bg-rose-50"
                          >
                            <Trash2 className="h-[18px] w-[18px] text-rose-500" />
                          </button>
                        </div>
                      </td>

                      <td className={`w-full max-w-0 ${rowPadding} pr-3`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{p.title}</span>
                          {mainSource && (
                            <a
                              href={mainSource.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Inserat auf ${mainSource.portalName} öffnen`}
                              className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-1.5 py-[1px] text-[10px] text-sky-700 hover:border-sky-300 hover:bg-sky-50"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              {PORTAL_LABELS[mainSource.portalName] ?? mainSource.portalName}
                            </a>
                          )}
                          {otherSources.length > 0 && (
                            <span
                              title={otherSources.map((s) => s.portalName).join(", ")}
                              className="shrink-0 text-[10px] font-medium text-sky-700"
                            >
                              +{otherSources.length}
                            </span>
                          )}
                        </div>
                        {config.rowSize !== "compact" && (
                          <div className="truncate text-[11px] text-slate-500">{locationLine(p)}</div>
                        )}
                      </td>

                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={`whitespace-nowrap px-3 ${rowPadding} ${
                            c.align === "right" ? "text-right" : "text-left"
                          } ${i === 0 ? "border-l border-slate-200" : ""}`}
                        >
                          {c.render(item, ctx)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Fußzeile: Bereich, Mediane, Seitenwechsel */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
          <div>
            Zeige {firstIndex}–{lastIndex} von {rows.length.toLocaleString("de-DE")}
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Median online: {Math.round(medianDaysOnline)} Tage
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ChartColumn className="h-3.5 w-3.5" />
              Median Preis/m²: {eur0.format(medianPricePerSqm)}
            </span>
            <button
              onClick={() => {
                setFullscreen(false);
                onShowStats();
              }}
              className="inline-flex items-center gap-1.5 text-sky-700 underline underline-offset-2 hover:text-sky-900"
            >
              <ChartLine className="h-3.5 w-3.5" />
              Marktstatistik
            </button>
          </div>
          <Pagination page={currentPage} pageCount={pageCount} onChange={goToPage} />
        </div>
      </div>

      {configOpen && (
        <div className={poppins.className}>
          <TableConfigDialog
            config={config}
            favoritesCount={favorites.size}
            hiddenCount={hidden.size}
            onlyFavorites={onlyFavorites}
            onToggleOnlyFavorites={() => {
              setOnlyFavorites((v) => !v);
              setPage(1);
            }}
            onRestoreHidden={restoreHidden}
            onSave={saveConfig}
            onClose={() => setConfigOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function pageList(page: number, pageCount: number): (number | "…")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  const navBtn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-1">
      <button className={navBtn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Vorherige Seite">
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {pageList(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 ${
              p === page ? "bg-sky-600 font-medium text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        className={navBtn}
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="Nächste Seite"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
