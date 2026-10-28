/**
 * Groupings for the Sync Worth reports page (BRD §6). Pure, so they are
 * unit-tested; the server returns the register rows.
 */
import { STATUS_FLOW, type WorthCurrency, type WorthStatus } from "../../../convex/worth/lib";

export type RegisterRow = {
  reference: string;
  clientName: string;
  partyType: string;
  valuerName: string;
  status: WorthStatus;
  fee: number;
  currency: WorthCurrency;
  paid: boolean;
  invoiced: boolean;
  turnaroundDays: number | null;
  stageMs: Partial<Record<WorthStatus, number>>;
};

const DAY = 86_400_000;

export type TurnaroundGroup = {
  key: string;
  jobs: number;
  issued: number;
  averageDays: number | null;
  /** Average days spent in each stage of the main path. */
  stageDays: Partial<Record<WorthStatus, number>>;
};

/** Turnaround and time at each stage, grouped by valuer or by client. */
export function turnaroundBy(rows: RegisterRow[], by: "valuerName" | "clientName"): TurnaroundGroup[] {
  const groups = new Map<string, RegisterRow[]>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const key = r[by] || "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const done = list.map((r) => r.turnaroundDays).filter((d): d is number => d !== null);
      const stageDays: Partial<Record<WorthStatus, number>> = {};
      for (const s of STATUS_FLOW) {
        if (s === "issued") continue;
        const spent = list.map((r) => r.stageMs[s]).filter((ms): ms is number => ms !== undefined);
        if (spent.length) stageDays[s] = spent.reduce((a, b) => a + b, 0) / spent.length / DAY;
      }
      return {
        key,
        jobs: list.length,
        issued: done.length,
        averageDays: done.length ? done.reduce((a, b) => a + b, 0) / done.length : null,
        stageDays,
      };
    })
    .sort((a, b) => b.jobs - a.jobs);
}

export type PartyGroup = {
  clientName: string;
  partyType: string;
  jobs: number;
  issued: number;
  fees: Record<WorthCurrency, number>;
  unpaid: Record<WorthCurrency, number>;
};

/** Jobs and fees per instructing party (bank panel relationships). */
export function workByParty(rows: RegisterRow[]): PartyGroup[] {
  const groups = new Map<string, PartyGroup>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const g =
      groups.get(r.clientName) ??
      ({ clientName: r.clientName, partyType: r.partyType, jobs: 0, issued: 0, fees: { USD: 0, ZiG: 0 }, unpaid: { USD: 0, ZiG: 0 } } as PartyGroup);
    g.jobs++;
    if (r.status === "issued") g.issued++;
    g.fees[r.currency] += r.fee;
    if ((r.invoiced || r.status === "issued") && !r.paid) g.unpaid[r.currency] += r.fee;
    groups.set(r.clientName, g);
  }
  return [...groups.values()].sort((a, b) => b.jobs - a.jobs);
}

/** Age buckets for the unpaid fees report. */
export function ageBucket(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function fmtDays(d: number | null | undefined): string {
  return d === null || d === undefined ? "-" : d.toFixed(1);
}
