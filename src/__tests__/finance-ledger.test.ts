import { describe, it, expect } from "vitest";
import {
  buildPlan,
  checkDate,
  checkPosting,
  feeOn,
  invoiceStatus,
  invoiceTotals,
  isLocked,
  monthlyInterest,
  pickReminder,
  planState,
  standRemindersDue,
} from "../../convex/finance/lib";
import { fillTemplate, missingFields, smsParts } from "../../convex/notify/lib";
import { routeMessage } from "../../convex/notify/send";
import { toE164 } from "../../convex/sms";

describe("checkPosting", () => {
  it("accepts a rent receipt split between landlord and agency", () => {
    expect(
      checkPosting([
        { currency: "USD", amount: 500, accountId: "trust" },
        { currency: "USD", amount: 450, ledger: "landlord" },
        { currency: "USD", amount: 50, ledger: "agency" },
      ])
    ).toBeNull();
  });

  it("accepts a commission move that only changes owners", () => {
    expect(
      checkPosting([
        { currency: "USD", amount: -50, ledger: "landlord" },
        { currency: "USD", amount: 50, ledger: "agency" },
      ])
    ).toBeNull();
  });

  it("rejects lines that do not balance", () => {
    expect(checkPosting([{ currency: "USD", amount: 100, accountId: "a" }, { currency: "USD", amount: 90, ledger: "landlord" }])).toMatch(/balance/);
  });

  it("never lets USD balance ZiG", () => {
    expect(checkPosting([{ currency: "USD", amount: 100, accountId: "a" }, { currency: "ZiG", amount: 100, ledger: "landlord" }])).toMatch(/balance/);
  });

  it("rejects a line with both an account and a ledger", () => {
    expect(checkPosting([{ currency: "USD", amount: 1, accountId: "a", ledger: "agency" }])).toMatch(/not both/);
  });
});

describe("fees and dates", () => {
  it("rounds commission to the cent and ignores zero rates", () => {
    expect(feeOn(333.33, 10)).toBe(33.33);
    expect(feeOn(500, 0)).toBe(0);
  });

  it("locks every month up to the closed one", () => {
    expect(isLocked("2026-09-30", "2026-09")).toBe(true);
    expect(isLocked("2026-10-01", "2026-09")).toBe(false);
    expect(isLocked("2026-01-01", undefined)).toBe(false);
  });

  it("rejects future and closed dates", () => {
    expect(checkDate("2026-11-01", "2026-10-29", null)).toMatch(/future/);
    expect(checkDate("2026-08-15", "2026-10-29", "2026-09")).toMatch(/closed/);
    expect(checkDate("2026-10-15", "2026-10-29", "2026-09")).toBeNull();
  });
});

describe("invoices", () => {
  it("adds VAT only when a rate is set", () => {
    expect(invoiceTotals([{ quantity: 2, unitPrice: 50 }], 0)).toEqual({ subtotal: 100, vat: 0, total: 100 });
    expect(invoiceTotals([{ quantity: 1, unitPrice: 100 }], 15)).toEqual({ subtotal: 100, vat: 15, total: 115 });
  });

  it("tracks paid status", () => {
    expect(invoiceStatus(100, 0)).toBe("unpaid");
    expect(invoiceStatus(100, 40)).toBe("part_paid");
    expect(invoiceStatus(100, 100)).toBe("paid");
  });
});

describe("payment plans", () => {
  const plan = buildPlan(10000, 2000, "2026-01-15", 4, "2026-02-31");

  it("builds a deposit and even instalments that add up to the price", () => {
    expect(plan[0]).toMatchObject({ label: "Deposit", amount: 2000, dueDate: "2026-01-15" });
    expect(plan).toHaveLength(5);
    expect(plan.reduce((s, r) => s + r.amount, 0)).toBe(10000);
    // Day 31 falls back to the month's last day.
    expect(plan[1].dueDate).toBe("2026-02-28");
  });

  it("allocates payments to the oldest instalment first", () => {
    const st = planState(plan, 3000, "2026-03-10");
    expect(st.rows[0].status).toBe("paid");
    expect(st.rows[1]).toMatchObject({ paid: 1000, status: "overdue" });
    expect(st.overdue).toBe(1000);
    expect(st.balance).toBe(7000);
    expect(st.nextDueDate).toBe("2026-03-31");
  });

  it("counts interest rows in what is owed", () => {
    const withInterest = [...plan, { dueDate: "2026-03-10", amount: 50, label: "Interest", kind: "interest" as const }];
    expect(planState(withInterest, 3000, "2026-03-10").balance).toBe(7050);
    expect(monthlyInterest(1000, 2.5)).toBe(25);
    expect(monthlyInterest(1000, undefined)).toBe(0);
  });

  it("reminds once before a due date and once when overdue", () => {
    const st = planState(plan, 2000, "2026-02-25");
    const due = standRemindersDue(st.rows, "2026-02-25", 7, []);
    expect(due.map((d) => d.key)).toEqual(["before:2026-02-28"]);
    expect(standRemindersDue(st.rows, "2026-02-25", 7, ["before:2026-02-28"])).toEqual([]);
    const late = planState(plan, 2000, "2026-03-02");
    expect(standRemindersDue(late.rows, "2026-03-02", 7, ["before:2026-02-28"]).map((d) => d.key)).toEqual(["overdue:2026-02-28"]);
  });
});

describe("instalment reminders", () => {
  it("sends the overdue notice first without swallowing a due-soon reminder", () => {
    const due = [
      { key: "overdue:2026-09-01", kind: "overdue" as const },
      { key: "overdue:2026-10-01", kind: "overdue" as const },
      { key: "before:2026-11-01", kind: "before" as const },
    ];
    const r = pickReminder(due)!;
    expect(r.pick.key).toBe("overdue:2026-09-01");
    expect(r.markSent).toEqual(["overdue:2026-09-01", "overdue:2026-10-01"]);
    expect(pickReminder(due.filter((d) => !r.markSent.includes(d.key)))!.markSent).toEqual(["before:2026-11-01"]);
    expect(pickReminder([])).toBeNull();
  });
});

describe("Sync Notify", () => {
  it("fills placeholders and leaves unknown ones as typed", () => {
    expect(fillTemplate("Dear {name}, you owe {owed}. {x}", { name: "Rudo", owed: "USD 300" })).toBe("Dear Rudo, you owe USD 300. {x}");
    expect(missingFields("{name} {owed}", { name: "Rudo" })).toEqual(["owed"]);
  });

  it("counts SMS parts", () => {
    expect(smsParts("a".repeat(160))).toBe(1);
    expect(smsParts("a".repeat(161))).toBe(2);
  });

  it("routes to the preferred channel, falling back to the other", () => {
    const s = { emailEnabled: true, smsEnabled: true, preferredChannel: "sms" as const };
    expect(routeMessage(s, { channel: "preferred", email: "a@b.co", phone: "0771234567" })).toEqual({ channel: "sms", to: "0771234567" });
    expect(routeMessage(s, { channel: "preferred", email: "a@b.co" })).toEqual({ channel: "email", to: "a@b.co" });
    expect(routeMessage({ ...s, smsEnabled: false }, { channel: "sms", phone: "0771234567" })).toEqual({ error: expect.stringMatching(/switched off/) });
  });

  it("writes Zimbabwe numbers in international form", () => {
    expect(toE164("077 123 4567")).toBe("+263771234567");
    expect(toE164("+27 82 123 4567")).toBe("+27821234567");
    expect(toE164("12")).toBeNull();
  });
});
