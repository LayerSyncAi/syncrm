"use client";

import * as React from "react";
import { useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Columns3, Search, X, GripVertical } from "lucide-react";

// ── Column definition ──────────────────────────────────────────────────────
export interface ColumnDef<T> {
  /** Unique column identifier */
  id: string;
  /** Display header text (used in column picker and search placeholder) */
  header: string;
  /** Optional custom header content (replaces the default text in the table header) */
  headerContent?: React.ReactNode;
  /** Extract a searchable string value from the row (used for column-level search) */
  accessor?: (row: T) => string | number | null | undefined;
  /** Custom cell renderer */
  cell: (row: T) => React.ReactNode;
  /** Enable column-level search (requires accessor) */
  searchable?: boolean;
  /** Extra className for the header cell */
  headerClassName?: string;
  /** Extra className for the body cell */
  cellClassName?: string;
  /** Whether the column is visible by default (default: true) */
  defaultVisible?: boolean;
}

// ── DataTable props ────────────────────────────────────────────────────────
interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  keyAccessor: (row: T) => string;
  /** Loading state */
  loading?: boolean;
  /** Message when no data */
  emptyMessage?: string;
  /** Action node shown in empty state */
  emptyAction?: React.ReactNode;
  /** Extra className on the motion.tr rows */
  rowClassName?: string;
  /** Custom header content to render on the left of the toolbar */
  toolbarLeft?: React.ReactNode;
  /** Custom body renderer (for tables that need special row rendering, e.g. drag-to-reorder).
   *  Receives the filtered data and visible columns. Return the <tbody> element. */
  renderBody?: (data: T[], columns: ColumnDef<T>[]) => React.ReactNode;
}

// ── Animation variants ─────────────────────────────────────────────────────
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
} as const;

// ── DataTable component ────────────────────────────────────────────────────
export function DataTable<T>({
  columns,
  data,
  keyAccessor,
  loading,
  emptyMessage = "No data found.",
  emptyAction,
  rowClassName,
  toolbarLeft,
  renderBody,
}: DataTableProps<T>) {
  // Column visibility
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    columns.forEach((c) => {
      init[c.id] = c.defaultVisible !== false;
    });
    return init;
  });

  // Column order (array of column ids)
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    columns.map((c) => c.id)
  );

  // Per-column search values
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});

  // Show/hide the column-level search row
  const [showSearch, setShowSearch] = useState(false);

  // Show/hide the column visibility dropdown
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Drag state for column reordering
  const dragCol = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Close column picker when clicking outside
  React.useEffect(() => {
    if (!showColumnPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColumnPicker]);

  // Ordered + visible columns
  const visibleColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.id, c]));
    // Merge any new columns that aren't in the order yet
    const allIds = new Set(columnOrder);
    const merged = [...columnOrder];
    columns.forEach((c) => {
      if (!allIds.has(c.id)) merged.push(c.id);
    });
    return merged
      .filter((id) => visibility[id] !== false && colMap.has(id))
      .map((id) => colMap.get(id)!);
  }, [columns, columnOrder, visibility]);

  // Client-side filtering by column searches
  const filteredData = useMemo(() => {
    if (!data) return undefined;
    const activeFilters = Object.entries(columnSearch).filter(
      ([, v]) => v.trim() !== ""
    );
    if (activeFilters.length === 0) return data;

    const colMap = new Map(columns.map((c) => [c.id, c]));
    return data.filter((row) =>
      activeFilters.every(([colId, search]) => {
        const col = colMap.get(colId);
        if (!col?.accessor) return true;
        const value = col.accessor(row);
        if (value == null) return false;
        return String(value).toLowerCase().includes(search.toLowerCase());
      })
    );
  }, [data, columnSearch, columns]);

  // Column visibility toggle
  const toggleVisibility = useCallback((colId: string) => {
    setVisibility((prev) => ({ ...prev, [colId]: !prev[colId] }));
  }, []);

  // Column search change
  const handleColumnSearch = useCallback((colId: string, value: string) => {
    setColumnSearch((prev) => ({ ...prev, [colId]: value }));
  }, []);

  // Clear all column searches
  const clearAllSearch = useCallback(() => {
    setColumnSearch({});
    setShowSearch(false);
  }, []);

  // Drag handlers for column reordering
  const handleDragStart = useCallback((colId: string) => {
    dragCol.current = colId;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, colId: string) => {
      e.preventDefault();
      if (dragCol.current && dragCol.current !== colId) {
        setDragOver(colId);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (colId: string) => {
      if (!dragCol.current || dragCol.current === colId) {
        setDragOver(null);
        return;
      }
      setColumnOrder((prev) => {
        const from = prev.indexOf(dragCol.current!);
        const to = prev.indexOf(colId);
        if (from === -1 || to === -1) return prev;
        const next = [...prev];
        next.splice(from, 1);
        next.splice(to, 0, dragCol.current!);
        return next;
      });
      dragCol.current = null;
      setDragOver(null);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    dragCol.current = null;
    setDragOver(null);
  }, []);

  const hasActiveSearch = Object.values(columnSearch).some((v) => v.trim() !== "");
  const hasSearchableColumns = columns.some((c) => c.searchable);
  const colSpan = visibleColumns.length;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Column search toggle */}
          {hasSearchableColumns && (
            <button
              onClick={() => {
                if (showSearch) {
                  clearAllSearch();
                } else {
                  setShowSearch(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors",
                showSearch || hasActiveSearch
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border-strong bg-card-bg text-text-muted hover:bg-row-hover"
              )}
            >
              <Search className="h-3.5 w-3.5" />
              Column Search
              {hasActiveSearch && (
                <X className="h-3 w-3 ml-0.5" />
              )}
            </button>
          )}

          {/* Column visibility toggle */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowColumnPicker((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors",
                showColumnPicker
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border-strong bg-card-bg text-text-muted hover:bg-row-hover"
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </button>

            <AnimatePresence>
              {showColumnPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-50 mt-1 w-52 rounded-[12px] border border-border-strong bg-card-bg p-2 shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
                >
                  <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-text-dim">
                    Toggle columns
                  </p>
                  {columns.map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm text-text hover:bg-row-hover"
                    >
                      <input
                        type="checkbox"
                        checked={visibility[col.id] !== false}
                        onChange={() => toggleVisibility(col.id)}
                        className="h-3.5 w-3.5 rounded border-border-strong accent-primary"
                      />
                      {col.header}
                    </label>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-hidden rounded-[12px] border border-border-strong bg-card-bg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Header row */}
              <tr className="border-b">
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    draggable
                    onDragStart={() => handleDragStart(col.id)}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDrop={() => handleDrop(col.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "h-10 bg-[rgba(148,163,184,0.06)] px-4 text-left text-[12px] font-medium uppercase tracking-wide text-text-muted select-none",
                      dragOver === col.id && "bg-primary/10",
                      col.headerClassName
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
                      <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0 text-text-dim" />
                      {col.headerContent ?? col.header}
                    </span>
                  </th>
                ))}
              </tr>

              {/* Column search row */}
              {showSearch && (
                <tr className="border-b border-border">
                  {visibleColumns.map((col) => (
                    <th key={col.id} className="bg-[rgba(148,163,184,0.03)] px-3 py-1.5">
                      {col.searchable && col.accessor ? (
                        <input
                          type="text"
                          placeholder={`Filter ${col.header.toLowerCase()}...`}
                          value={columnSearch[col.id] || ""}
                          onChange={(e) =>
                            handleColumnSearch(col.id, e.target.value)
                          }
                          className="w-full rounded-[8px] border border-border bg-transparent px-2.5 py-1 text-xs font-normal normal-case tracking-normal text-text placeholder:text-text-dim focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-[var(--primary-glow)]"
                        />
                      ) : (
                        <span />
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>

            {/* Body */}
            {loading || data === undefined ? (
              <tbody>
                <tr className="h-11 border-b border-[rgba(148,163,184,0.1)]">
                  <td
                    colSpan={colSpan}
                    className="px-4 text-center text-text-muted"
                  >
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : filteredData && filteredData.length === 0 ? (
              <tbody>
                <tr className="h-11 border-b border-[rgba(148,163,184,0.1)]">
                  <td
                    colSpan={colSpan}
                    className="px-4 text-center text-text-muted py-8"
                  >
                    <p>{emptyMessage}</p>
                    {emptyAction && <div className="mt-3">{emptyAction}</div>}
                  </td>
                </tr>
              </tbody>
            ) : renderBody && filteredData ? (
              renderBody(filteredData, visibleColumns)
            ) : (
              <motion.tbody
                variants={listVariants}
                initial="hidden"
                animate="show"
                key="data"
              >
                {filteredData?.map((row) => (
                  <motion.tr
                    key={keyAccessor(row)}
                    variants={rowVariants}
                    className={cn(
                      "group h-11 border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover hover:shadow-[inset_3px_0_0_var(--primary)]",
                      rowClassName
                    )}
                  >
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        className={cn("px-4 text-text", col.cellClassName)}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </motion.tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
