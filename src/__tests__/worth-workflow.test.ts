import { describe, it, expect } from "vitest";
import {
  addDays,
  allocateReference,
  daysBetween,
  dueState,
  formatReference,
  formatTotals,
  hasAnyValue,
  localToday,
  nextStatus,
  stageDurations,
  sumByCurrency,
  turnaroundDays,
} from "../../convex/worth/lib";

describe("job references", () => {
  it("pads to four digits", () => {
    expect(formatReference("VAL", 2026, 142)).toBe("VAL-2026-0142");
    expect(formatReference("VAL", 2026, 12345)).toBe("VAL-2026-12345");
  });

  it("continues the counter within a year and restarts in a new one", () => {
    expect(allocateReference({ prefix: "VAL", seqYear: 2026, nextSeq: 7 }, 2026)).toEqual({
      reference: "VAL-2026-0007",
      seqYear: 2026,
      nextSeq: 8,
    });
    expect(allocateReference({ prefix: "VAL", seqYear: 2026, nextSeq: 90 }, 2027).reference).toBe("VAL-2027-0001");
    expect(allocateReference({ prefix: "VAL", seqYear: 0, nextSeq: 1 }, 2026).reference).toBe("VAL-2026-0001");
  });
});

describe("dates", () => {
  it("works in Harare time", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Harare (UTC+2).
    expect(localToday(Date.UTC(2026, 11, 31, 23, 30))).toBe("2027-01-01");
  });

  it("adds and counts days", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-03-01", "2026-03-11")).toBe(10);
    expect(daysBetween("2026-03-11", "2026-03-01")).toBe(-10);
  });
});

describe("dueState", () => {
  const today = "2026-10-28";
  it("flags overdue and due-soon open jobs", () => {
    expect(dueState({ status: "assigned", dueDate: "2026-10-27" }, today, 2)).toBe("overdue");
    expect(dueState({ status: "draft", dueDate: "2026-10-30" }, today, 2)).toBe("due_soon");
    expect(dueState({ status: "draft", dueDate: "2026-10-28" }, today, 2)).toBe("due_soon");
    expect(dueState({ status: "draft", dueDate: "2026-10-31" }, today, 2)).toBe(null);
  });

  it("ignores closed and held jobs", () => {
    expect(dueState({ status: "issued", dueDate: "2026-10-01" }, today, 2)).toBe(null);
    expect(dueState({ status: "cancelled", dueDate: "2026-10-01" }, today, 2)).toBe(null);
    expect(dueState({ status: "on_hold", dueDate: "2026-10-01" }, today, 2)).toBe(null);
  });
});

describe("nextStatus", () => {
  it("walks the main path", () => {
    expect(nextStatus("new", "assign")).toBe("assigned");
    expect(nextStatus("assigned", "complete_inspection", { hasValuer: true })).toBe("inspected");
    expect(nextStatus("inspected", "start_draft")).toBe("draft");
    expect(nextStatus("draft", "submit")).toBe("in_review");
    expect(nextStatus("in_review", "issue")).toBe("issued");
  });

  it("returns to draft and opens corrections", () => {
    expect(nextStatus("in_review", "return")).toBe("draft");
    expect(nextStatus("issued", "correct")).toBe("draft");
    expect(nextStatus("draft", "correct")).toBe(null);
  });

  it("refuses moves that skip review or reopen closed jobs", () => {
    expect(nextStatus("draft", "issue")).toBe(null);
    expect(nextStatus("issued", "assign")).toBe(null);
    expect(nextStatus("cancelled", "hold")).toBe(null);
    expect(nextStatus("issued", "cancel")).toBe(null);
    expect(nextStatus("new", "complete_inspection")).toBe(null);
  });

  it("holds and resumes to the previous status", () => {
    expect(nextStatus("draft", "hold")).toBe("on_hold");
    expect(nextStatus("on_hold", "hold")).toBe(null);
    expect(nextStatus("on_hold", "resume", { statusBeforeHold: "draft" })).toBe("draft");
    expect(nextStatus("on_hold", "cancel")).toBe("cancelled");
  });
});

describe("values and turnaround", () => {
  it("needs at least one positive value", () => {
    expect(hasAnyValue({})).toBe(false);
    expect(hasAnyValue({ market: { amount: 0, currency: "USD" } })).toBe(false);
    expect(hasAnyValue({ rental: { amount: 900, currency: "USD" } })).toBe(true);
  });

  it("measures time in each stage", () => {
    const h = 3_600_000;
    const log = [
      { status: "new" as const, at: 0 },
      { status: "assigned" as const, at: 2 * h },
      { status: "draft" as const, at: 5 * h },
      { status: "issued" as const, at: 9 * h },
    ];
    expect(stageDurations(log, 100 * h)).toEqual({ new: 2 * h, assigned: 3 * h, draft: 4 * h, issued: 0 });
    expect(stageDurations(log.slice(0, 2), 10 * h).assigned).toBe(8 * h);
  });

  it("counts days from instruction to issue", () => {
    expect(turnaroundDays({ receivedDate: "2026-10-01", issuedDate: "2026-10-08" })).toBe(7);
    expect(turnaroundDays({ receivedDate: "2026-10-01" })).toBe(null);
  });

  it("never adds USD and ZiG together", () => {
    const t = sumByCurrency([
      { amount: 100, currency: "USD" },
      { amount: 500, currency: "ZiG" },
      { amount: 50, currency: "USD" },
    ]);
    expect(t).toEqual({ USD: 150, ZiG: 500 });
    expect(formatTotals(t)).toBe("US$150 · ZiG 500");
    expect(formatTotals({ USD: 0, ZiG: 0 })).toBe("US$0");
  });
});
