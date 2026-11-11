"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, Search, X } from "lucide-react";
import { COLUMNS, COLUMN_MAP, type ColumnKey } from "./resultColumns";

export type RowSize = "compact" | "normal" | "large";

export interface TableConfig {
  columns: ColumnKey[];
  rowSize: RowSize;
  pageSize: number;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100];

const ROW_SIZE_LABELS: Record<RowSize, string> = {
  compact: "Kompakt",
  normal: "Normal",
  large: "Groß",
};

interface TableConfigDialogProps {
  config: TableConfig;
  favoritesCount: number;
  hiddenCount: number;
  onlyFavorites: boolean;
  onToggleOnlyFavorites: () => void;
  onRestoreHidden: () => void;
  onSave: (config: TableConfig) => void;
  onClose: () => void;
}

export function TableConfigDialog({
  config,
  favoritesCount,
  hiddenCount,
  onlyFavorites,
  onToggleOnlyFavorites,
  onRestoreHidden,
  onSave,
  onClose,
}: TableConfigDialogProps) {
  // Änderungen erst beim Speichern übernehmen, "Abbrechen" verwirft sie
  const [draft, setDraft] = useState<TableConfig>(config);
  const [query, setQuery] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = (key: ColumnKey) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const c = COLUMN_MAP.get(key)!;
    return c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  };

  const hiddenColumns = useMemo(
    () =>
      COLUMNS.filter((c) => !draft.columns.includes(c.key)).sort((a, b) =>
        a.label.localeCompare(b.label, "de")
      ),
    [draft.columns]
  );

  const setColumns = (columns: ColumnKey[]) => setDraft((d) => ({ ...d, columns }));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.columns.length || from === to) return;
    const next = [...draft.columns];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setColumns(next);
  };

  const segment = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs transition ${
      active ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-config-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[690px] flex-col rounded-xl bg-white shadow-2xl"
      >
        {/* Kopf */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="table-config-title" className="text-xl font-medium text-slate-800">
              Tabelle konfigurieren
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Spalten, Zeilengröße und Objekte pro Seite festlegen
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Inhalt */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700">Zeilengröße</div>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {(Object.keys(ROW_SIZE_LABELS) as RowSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => setDraft((d) => ({ ...d, rowSize: size }))}
                    className={segment(draft.rowSize === size)}
                  >
                    {ROW_SIZE_LABELS[size]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700">Objekte pro Seite</div>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setDraft((d) => ({ ...d, pageSize: n }))}
                    className={segment(draft.pageSize === n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={onlyFavorites}
                onChange={onToggleOnlyFavorites}
                className="h-4 w-4 accent-sky-600"
              />
              Nur Favoriten anzeigen ({favoritesCount})
            </label>
            <button
              onClick={onRestoreHidden}
              disabled={hiddenCount === 0}
              className="text-sky-700 underline underline-offset-2 disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
            >
              Ausgeblendete Inserate wieder anzeigen ({hiddenCount})
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Spalte suchen"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Sichtbare Spalten: Reihenfolge per Drag & Drop oder Pfeilen */}
          <div className="space-y-2">
            {draft.columns.map((key, index) => {
              if (!matches(key)) return null;
              const c = COLUMN_MAP.get(key)!;
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 ${
                    dragIndex === index ? "border-sky-400 opacity-60" : "border-slate-200"
                  }`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400" />
                  <input
                    type="checkbox"
                    checked
                    onChange={() => setColumns(draft.columns.filter((k) => k !== key))}
                    className="h-[18px] w-[18px] shrink-0 accent-sky-600"
                  />
                  <span className="shrink-0 text-sm font-medium text-slate-800">{c.label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{c.description}</span>
                  <div className="flex shrink-0 flex-col">
                    {index > 0 && (
                      <button onClick={() => move(index, index - 1)} aria-label={`${c.label} nach oben`}>
                        <ChevronUp className="h-4 w-4 text-slate-500 hover:text-slate-800" />
                      </button>
                    )}
                    {index < draft.columns.length - 1 && (
                      <button onClick={() => move(index, index + 1)} aria-label={`${c.label} nach unten`}>
                        <ChevronDown className="h-4 w-4 text-slate-500 hover:text-slate-800" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ausgeblendete Spalten */}
          <div className="mb-2 mt-5 flex items-baseline gap-2">
            <span className="text-sm font-medium text-slate-800">Ausgeblendete Spalten</span>
            <span className="text-xs text-slate-500">alphabetisch</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {hiddenColumns.filter((c) => matches(c.key)).map((c) => (
              <label
                key={c.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => setColumns([...draft.columns, c.key])}
                  className="h-[18px] w-[18px] shrink-0 accent-sky-600"
                />
                <span className="shrink-0 text-sm font-medium text-slate-800">{c.label}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={c.description}>
                  {c.description}
                </span>
              </label>
            ))}
            {hiddenColumns.length === 0 && (
              <p className="text-xs text-slate-400">Alle Spalten sind eingeblendet.</p>
            )}
          </div>
        </div>

        {/* Fuß */}
        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-3.5">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md border border-sky-700 px-6 py-2 text-sm text-sky-800 hover:bg-sky-50"
          >
            <X className="h-4 w-4" />
            Abbrechen
          </button>
          <button
            onClick={() => onSave(draft)}
            className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-6 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            <Check className="h-4 w-4" />
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
