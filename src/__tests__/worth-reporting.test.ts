import { describe, it, expect } from "vitest";
import { ageBucket, turnaroundBy, workByParty, type RegisterRow } from "../lib/worth/reporting";

const DAY = 86_400_000;
const row = (over: Partial<RegisterRow>): RegisterRow => ({
  reference: "VAL-2026-0001",
  clientName: "CBZ Bank",
  partyType: "bank",
  valuerName: "Rudo",
  status: "issued",
  fee: 300,
  currency: "USD",
  paid: false,
  invoiced: true,
  turnaroundDays: 5,
  stageMs: { new: DAY, draft: 2 * DAY },
  ...over,
});

describe("turnaroundBy", () => {
  it("averages turnaround and stage days per valuer", () => {
    const g = turnaroundBy(
      [row({}), row({ turnaroundDays: 9, stageMs: { new: 3 * DAY } }), row({ valuerName: "", status: "draft", turnaroundDays: null })],
      "valuerName"
    );
    expect(g[0]).toMatchObject({ key: "Rudo", jobs: 2, issued: 2, averageDays: 7 });
    expect(g[0].stageDays.new).toBeCloseTo(2);
    expect(g[0].stageDays.draft).toBeCloseTo(2);
    expect(g[1]).toMatchObject({ key: "Unassigned", issued: 0, averageDays: null });
  });

  it("leaves cancelled jobs out", () => {
    expect(turnaroundBy([row({ status: "cancelled" })], "clientName")).toEqual([]);
  });
});

describe("workByParty", () => {
  it("totals jobs and fees per client by currency", () => {
    const g = workByParty([
      row({}),
      row({ fee: 1000, currency: "ZiG", paid: true }),
      row({ clientName: "Moyo", partyType: "owner", status: "draft", invoiced: false }),
    ]);
    expect(g[0]).toMatchObject({ clientName: "CBZ Bank", jobs: 2, issued: 2 });
    expect(g[0].fees).toEqual({ USD: 300, ZiG: 1000 });
    expect(g[0].unpaid).toEqual({ USD: 300, ZiG: 0 });
    expect(g[1].unpaid).toEqual({ USD: 0, ZiG: 0 });
  });
});

describe("ageBucket", () => {
  it("buckets unpaid fees by age", () => {
    expect([0, 30, 31, 61, 91].map(ageBucket)).toEqual(["0-30", "0-30", "31-60", "61-90", "90+"]);
  });
});
