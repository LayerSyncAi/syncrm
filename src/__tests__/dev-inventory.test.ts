import { describe, it, expect } from "vitest";
import { compareStandNumbers, effectiveStatus, parseStandNumbers } from "../../convex/dev/lib";
import { userCanUseModule } from "../../convex/lib/modules";
import { sameDayNextMonth } from "../../convex/finance/lib";

describe("sameDayNextMonth", () => {
  it("keeps the day, or uses the month's last day when shorter", () => {
    expect(sameDayNextMonth("2026-10-29")).toBe("2026-11-29");
    expect(sameDayNextMonth("2026-01-31")).toBe("2026-02-28");
    expect(sameDayNextMonth("2027-12-15")).toBe("2028-01-15");
  });
});

describe("parseStandNumbers", () => {
  it("expands ranges and keeps prefixes", () => {
    expect(parseStandNumbers("1-3, A1-A3")).toEqual({ numbers: ["1", "2", "3", "A1", "A2", "A3"] });
  });

  it("keeps zero padding and accepts 'to'", () => {
    expect(parseStandNumbers("A01 to A03")).toEqual({ numbers: ["A01", "A02", "A03"] });
  });

  it("mixes single stands and drops duplicates", () => {
    expect(parseStandNumbers("7; 9, 12a, 7")).toEqual({ numbers: ["7", "9", "12a"] });
  });

  it("rejects what it cannot read", () => {
    expect(parseStandNumbers("10-2")).toEqual({ error: '"10-2" counts backwards' });
    expect(parseStandNumbers("")).toEqual({ error: "Enter at least one stand number" });
    expect("error" in parseStandNumbers("1-5000")).toBe(true);
    expect("error" in parseStandNumbers("stand #4!")).toBe(true);
  });
});

describe("stand order and reservations", () => {
  it("sorts the way people count", () => {
    expect(["10", "2", "A10", "A2", "1"].sort(compareStandNumbers)).toEqual(["1", "2", "10", "A2", "A10"]);
  });

  it("treats a lapsed reservation as available", () => {
    expect(effectiveStatus({ status: "reserved", reservedFor: { until: "2026-10-01" } }, "2026-10-29")).toBe("available");
    expect(effectiveStatus({ status: "reserved", reservedFor: { until: "2026-11-01" } }, "2026-10-29")).toBe("reserved");
    expect(effectiveStatus({ status: "reserved", reservedFor: {} }, "2026-10-29")).toBe("reserved");
    expect(effectiveStatus({ status: "sold" }, "2026-10-29")).toBe("sold");
  });
});

describe("SyncDev access", () => {
  const org = { enabledModules: ["crm", "dev"] as const };
  it("opens for every agent when the agency has it", () => {
    expect(userCanUseModule({ role: "agent", estateRoles: [] }, org, "dev")).toBe(true);
  });
  it("stays closed when the agency has not bought it", () => {
    expect(userCanUseModule({ role: "admin" }, { enabledModules: ["crm"] }, "dev")).toBe(false);
  });
});
