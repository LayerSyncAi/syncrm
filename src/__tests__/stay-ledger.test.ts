import { describe, it, expect } from "vitest";
import {
  addDays,
  addMonths,
  ageBucket,
  allocateOldestFirst,
  buildStatement,
  chargeStatus,
  daysBetween,
  dueDateFor,
  expiryAlertToSend,
  formatReceiptNumber,
  formatTotals,
  isOverdue,
  isValidDate,
  landlordTotals,
  periodRange,
  reminderToSend,
  rentChargesDue,
  rentForDueDate,
  todayIn,
  unwindCredit,
} from "../../convex/stay/ledger";

const charge = (id: string, dueDate: string, amount: number, amountPaid = 0, createdAt = 0) => ({
  id,
  dueDate,
  amount,
  amountPaid,
  createdAt,
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("26-02-01")).toBe(false);
  });

  it("adds days and months across year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("gives month ranges, including leap February", () => {
    expect(periodRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(dueDateFor("2026-10", 5)).toBe("2026-10-05");
  });

  it("computes today in the agency timezone", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Harare (UTC+2).
    const t = Date.UTC(2026, 9, 31, 23, 30);
    expect(todayIn("Africa/Harare", t)).toBe("2026-11-01");
    expect(todayIn("UTC", t)).toBe("2026-10-31");
  });
});

describe("rent schedule", () => {
  const lease = { startDate: "2026-01-01", endDate: "2026-12-31", rentAmount: 500, dueDay: 1 };

  it("raises next month's rent within the invoice lead time", () => {
    // The current month is listed too; the job skips periods already charged.
    expect(rentChargesDue(lease, "2026-10-25", 7)).toEqual([
      { period: "2026-10", dueDate: "2026-10-01", amount: 500 },
      { period: "2026-11", dueDate: "2026-11-01", amount: 500 },
    ]);
    // Too early for November; October's due date has passed and is still listed.
    expect(rentChargesDue(lease, "2026-10-20", 7)).toEqual([{ period: "2026-10", dueDate: "2026-10-01", amount: 500 }]);
  });

  it("never charges outside the lease or after a planned move-out", () => {
    expect(rentChargesDue(lease, "2026-12-28", 7)).toEqual([{ period: "2026-12", dueDate: "2026-12-01", amount: 500 }]);
    expect(rentChargesDue({ ...lease, moveOutDate: "2026-10-31" }, "2026-10-28", 7)).toEqual([
      { period: "2026-10", dueDate: "2026-10-01", amount: 500 },
    ]);
    expect(rentChargesDue({ ...lease, startDate: "2026-10-15" }, "2026-10-20", 7)).toEqual([]);
  });

  it("does not charge rent that fell due before the lease was entered", () => {
    expect(rentChargesDue(lease, "2026-10-28", 7, "2026-10-28")).toEqual([{ period: "2026-11", dueDate: "2026-11-01", amount: 500 }]);
  });

  it("uses the planned increase for charges due on or after its date", () => {
    const withInc = { ...lease, rentIncrease: { effectiveDate: "2026-11-01", newRent: 550 } };
    expect(rentForDueDate(withInc, "2026-10-01")).toBe(500);
    expect(rentForDueDate(withInc, "2026-11-01")).toBe(550);
    // Once applied, rentAmount already holds the new figure.
    expect(rentForDueDate({ ...withInc, rentAmount: 550, rentIncrease: { ...withInc.rentIncrease, appliedAt: 1 } }, "2026-12-01")).toBe(550);
  });
});

describe("allocation", () => {
  it("pays the oldest charge first and carries the rest as credit", () => {
    const res = allocateOldestFirst([charge("b", "2026-10-01", 500), charge("a", "2026-09-01", 500, 200)], 900);
    expect(res.allocations).toEqual([
      { chargeId: "a", amount: 300 },
      { chargeId: "b", amount: 500 },
    ]);
    expect(res.credit).toBe(100);
  });

  it("allows part payments", () => {
    const res = allocateOldestFirst([charge("a", "2026-09-01", 500)], 120.5);
    expect(res.allocations).toEqual([{ chargeId: "a", amount: 120.5 }]);
    expect(res.credit).toBe(0);
  });

  it("orders same-day charges by creation and skips settled ones", () => {
    const res = allocateOldestFirst(
      [charge("late", "2026-09-01", 50, 0, 2), charge("rent", "2026-09-01", 500, 0, 1), charge("paid", "2026-08-01", 500, 500)],
      520
    );
    expect(res.allocations).toEqual([
      { chargeId: "rent", amount: 500 },
      { chargeId: "late", amount: 20 },
    ]);
  });

  it("does not drift on cents", () => {
    const res = allocateOldestFirst([charge("a", "2026-09-01", 0.3), charge("b", "2026-10-01", 0.3)], 0.1 + 0.2 + 0.3);
    expect(res.allocations.map((a) => a.amount)).toEqual([0.3, 0.3]);
    expect(res.credit).toBe(0);
  });

  it("derives charge status", () => {
    expect(chargeStatus({ amount: 100, amountPaid: 0 })).toBe("unpaid");
    expect(chargeStatus({ amount: 100, amountPaid: 40 })).toBe("part_paid");
    expect(chargeStatus({ amount: 100, amountPaid: 100 })).toBe("paid");
  });
});

describe("reversal of credit", () => {
  it("only lowers the balance when the credit is unused", () => {
    expect(unwindCredit(150, 100, [])).toEqual({ newCreditBalance: 50, unwind: [] });
  });

  it("takes used credit back from the newest charges", () => {
    const res = unwindCredit(20, 100, [
      { id: "sep", dueDate: "2026-09-01", createdAt: 1, creditApplied: 30 },
      { id: "oct", dueDate: "2026-10-01", createdAt: 2, creditApplied: 50 },
    ]);
    expect(res.newCreditBalance).toBe(0);
    expect(res.unwind).toEqual([
      { chargeId: "oct", amount: 50 },
      { chargeId: "sep", amount: 30 },
    ]);
  });
});

describe("arrears", () => {
  it("buckets days overdue", () => {
    expect(ageBucket(0)).toBe("0_30");
    expect(ageBucket(30)).toBe("0_30");
    expect(ageBucket(31)).toBe("31_60");
    expect(ageBucket(90)).toBe("61_90");
    expect(ageBucket(91)).toBe("90_plus");
  });

  it("counts a charge from its due date, not before", () => {
    const c = { dueDate: "2026-11-01", amount: 500, amountPaid: 0, status: "unpaid" };
    expect(isOverdue(c, "2026-10-31")).toBe(false);
    expect(isOverdue(c, "2026-11-01")).toBe(true);
    expect(isOverdue({ ...c, status: "cancelled" }, "2026-12-01")).toBe(false);
  });

  it("sends one reminder per interval and catches up without repeats", () => {
    expect(reminderToSend(2, [3, 7, 14])).toEqual({ send: null, markSent: [] });
    expect(reminderToSend(3, [3, 7, 14])).toEqual({ send: 3, markSent: [3] });
    expect(reminderToSend(8, [3, 7, 14], [3])).toEqual({ send: 7, markSent: [7] });
    // Imported arrears 40 days old: one email, every interval marked.
    expect(reminderToSend(40, [3, 7, 14])).toEqual({ send: 14, markSent: [3, 7, 14] });
    expect(reminderToSend(40, [3, 7, 14], [3, 7, 14])).toEqual({ send: null, markSent: [] });
  });

  it("raises the nearest expiry alert once", () => {
    expect(expiryAlertToSend(61, [60, 30])).toEqual({ send: null, markSent: [] });
    expect(expiryAlertToSend(60, [60, 30])).toEqual({ send: 60, markSent: [60] });
    expect(expiryAlertToSend(25, [60, 30])).toEqual({ send: 30, markSent: [60, 30] });
    expect(expiryAlertToSend(25, [60, 30], [60, 30])).toEqual({ send: null, markSent: [] });
    expect(expiryAlertToSend(-1, [60, 30])).toEqual({ send: null, markSent: [] });
  });
});

describe("statements", () => {
  it("runs a balance through charges, payments, reversals and deposit", () => {
    const { lines, balance } = buildStatement(
      [
        { id: "c1", date: "2026-09-01", description: "Rent Sep 2026", amount: 500, status: "paid", createdAt: 1 },
        { id: "c2", date: "2026-10-01", description: "Rent Oct 2026", amount: 500, status: "unpaid", createdAt: 2 },
        { id: "c3", date: "2026-10-05", description: "Raised in error", amount: 80, status: "cancelled", createdAt: 3 },
      ],
      [
        { id: "p1", date: "2026-09-01", receiptNumber: "RC-00001", amount: 500, method: "cash", createdAt: 4 },
        { id: "p2", date: "2026-10-02", receiptNumber: "RC-00002", amount: 300, method: "cash", createdAt: 5, reversedOn: "2026-10-03", reverseReason: "bounced" },
      ],
      [{ date: "2026-10-31", amount: 200, at: 6 }]
    );
    expect(lines.map((l) => l.kind)).toEqual(["charge", "payment", "charge", "payment", "reversal", "deposit_applied"]);
    expect(lines.map((l) => l.balance)).toEqual([500, 0, 500, 200, 500, 300]);
    expect(balance).toBe(300);
  });
});

describe("landlord statement", () => {
  it("takes the fee per property and keeps currencies apart", () => {
    const totals = landlordTotals(
      [
        { stayPropertyId: "p1", currency: "USD", amount: 1000 },
        { stayPropertyId: "p2", currency: "USD", amount: 500 },
        { stayPropertyId: "p2", currency: "ZiG", amount: 3000 },
      ],
      [{ stayPropertyId: "p1", currency: "USD", amount: 100 }],
      [{ stayPropertyId: "p1", currency: "USD", amount: 75.5 }],
      { p1: 10, p2: 8 }
    );
    expect(totals).toEqual([
      { currency: "USD", collected: 1500, depositApplied: 100, fee: 140, expenses: 75.5, net: 1384.5 },
      { currency: "ZiG", collected: 3000, depositApplied: 0, fee: 240, expenses: 0, net: 2760 },
    ]);
  });
});

describe("formatting", () => {
  it("formats per currency without converting", () => {
    expect(formatTotals({ USD: 12400, ZiG: 3000 })).toBe("USD 12,400 · ZiG 3,000");
    expect(formatTotals({})).toBe("USD 0");
    expect(formatReceiptNumber("RC-", 42)).toBe("RC-00042");
  });
});
