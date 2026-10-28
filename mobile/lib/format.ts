/** Formatting shared by every screen. Amounts carry their currency; USD and ZiG are never converted. */

export function money(amount: number | null | undefined, currency = "USD"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "";
  const n = Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "-" : "";
  return currency === "USD" ? `${sign}US$${n}` : `${sign}${currency} ${n}`;
}

/** A per-currency map such as { USD: 120, ZiG: 4000 }, never added together. */
export function moneyMap(m: Partial<Record<string, number>> | null | undefined): string {
  const parts = Object.entries(m ?? {})
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([c, v]) => money(v as number, c));
  return parts.length ? parts.join(" · ") : money(0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-28" or a unix-ms instant, as "28 Oct 2026". */
export function dateLabel(d: string | number | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return `${day} ${MONTHS[m - 1]} ${y}`;
  }
  const dt = new Date(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function dateTimeLabel(ms: number | null | undefined): string {
  if (!ms) return "";
  const dt = new Date(ms);
  return `${dateLabel(ms)}, ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days} d ago` : dateLabel(ms);
}

/** Today as YYYY-MM-DD on this device. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse a typed amount ("1,200.50") or return null. */
export function parseAmount(s: string): number | null {
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function initials(name: string | null | undefined): string {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
