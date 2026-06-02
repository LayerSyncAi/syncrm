"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Loader2, FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import {
  exportReportCsv,
  exportReportPdf,
  type ExportPayload,
} from "@/lib/report-export";

// Theme colours pulled from the app's CSS tokens (see globals.css).
export const COLOR = {
  primary: "#eca400",
  success: "#16a34a",
  warning: "#ca8a04",
  danger: "#dc2626",
  info: "#0284c7",
  muted: "#5b647f",
};

// Categorical palette for sources / stages / agents.
export const PALETTE = [
  "#eca400",
  "#0284c7",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#ca8a04",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#9333ea",
];

/** Render a per-currency total map as a readable string, e.g. "$1,200.00 + ZWL 500.00". */
export function formatCurrencyMap(map: Record<string, number> | undefined): string {
  if (!map) return "—";
  const entries = Object.entries(map).filter(([, v]) => v !== 0);
  if (entries.length === 0) return formatCurrency(0, "USD");
  return entries.map(([currency, value]) => formatCurrency(value, currency)).join(" + ");
}

/** Sum a currency map into a single number (currency-agnostic) for chart magnitudes. */
export function currencyMapTotal(map: Record<string, number> | undefined): number {
  if (!map) return 0;
  return Object.values(map).reduce((a, b) => a + b, 0);
}

/** CSV / PDF export controls. `build` is called lazily on click for fresh data. */
export function ExportButtons({ build }: { build: () => ExportPayload }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => exportReportCsv(build())}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-strong px-3 text-xs font-medium text-text-muted transition-colors hover:border-primary/60 hover:text-text"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </button>
      <button
        type="button"
        onClick={() => void exportReportPdf(build())}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-strong px-3 text-xs font-medium text-text-muted transition-colors hover:border-primary/60 hover:text-text"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF
      </button>
    </div>
  );
}

export function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
    </div>
  );
}

/** Header row with a section title on the left and export controls on the right. */
export function SectionToolbar({
  title,
  build,
}: {
  title: string;
  build: () => ExportPayload;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <ExportButtons build={build} />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-text-dim">{label}</p>
        {icon ? <span className="text-text-muted">{icon}</span> : null}
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-text-dim">{hint}</p> : null}
    </Card>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid rgba(63,82,138,0.14)",
  background: "#ffffff",
  fontSize: 12,
};

export interface BarSeries {
  key: string;
  name: string;
  color: string;
}

/** Grouped/single vertical bar chart card. */
export function BarsCard({
  title,
  data,
  nameKey,
  bars,
  height = 300,
}: {
  title: string;
  data: Record<string, unknown>[];
  nameKey: string;
  bars: BarSeries[];
  height?: number;
}) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </h3>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No data for this period" />
        ) : (
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,82,138,0.12)" vertical={false} />
                <XAxis
                  dataKey={nameKey}
                  tick={{ fontSize: 11, fill: COLOR.muted }}
                  interval={0}
                  angle={data.length > 5 ? -20 : 0}
                  textAnchor={data.length > 5 ? "end" : "middle"}
                  height={data.length > 5 ? 60 : 30}
                />
                <YAxis tick={{ fontSize: 11, fill: COLOR.muted }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(63,82,138,0.06)" }} />
                {bars.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
                {bars.map((b) => (
                  <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Pie/donut chart card. */
export function PieCard({
  title,
  data,
  nameKey,
  valueKey,
  height = 300,
}: {
  title: string;
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  height?: number;
}) {
  const nonEmpty = data.filter((d) => Number(d[valueKey]) > 0);
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </h3>
      </CardHeader>
      <CardContent>
        {nonEmpty.length === 0 ? (
          <EmptyState message="No data for this period" />
        ) : (
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={nonEmpty}
                  dataKey={valueKey}
                  nameKey={nameKey}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {nonEmpty.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
