/**
 * Sync Dev rules kept pure, shared by the server and the app.
 */

/**
 * Stand numbers from what a person types: "1-40", "A1-A12", "7, 9, 12a" or a
 * mix. Ranges keep any prefix and zero padding ("A01-A03"). Duplicates are
 * dropped, order is kept. Returns an error message for anything unreadable.
 */
export function parseStandNumbers(input: string, max = 1000): { numbers: string[] } | { error: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string) => {
    const k = n.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  };
  for (const raw of input.split(/[,;\n]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^([A-Za-z]*)(\d+)\s*(?:-|–|to)\s*\1?(\d+)$/i);
    if (range) {
      const [, prefix, a, b] = range;
      const from = Number(a);
      const to = Number(b);
      if (to < from) return { error: `"${part}" counts backwards` };
      if (to - from + 1 > max) return { error: `"${part}" is more than ${max} stands` };
      const width = a.length > 1 && a.startsWith("0") ? a.length : 0;
      for (let i = from; i <= to; i++) push(`${prefix}${width ? String(i).padStart(width, "0") : i}`);
      continue;
    }
    if (!/^[\w./-]{1,20}$/.test(part)) return { error: `"${part}" is not a stand number` };
    push(part);
  }
  if (!out.length) return { error: "Enter at least one stand number" };
  if (out.length > max) return { error: `At most ${max} stands at a time` };
  return { numbers: out };
}

/** Natural order: 2 before 10, A2 before A10. */
export function compareStandNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export type StandStatus = "available" | "reserved" | "sold";

/** A reservation lapses after its date; the stand reads as available again. */
export function effectiveStatus(s: { status: StandStatus; reservedFor?: { until?: string } }, today: string): StandStatus {
  if (s.status === "reserved" && s.reservedFor?.until && s.reservedFor.until < today) return "available";
  return s.status;
}
