import { describe, it, expect } from "vitest";
import { addMonths, inspectionDueState } from "../../convex/stay/inspections";
import { needsLandlordApproval, shapeMaintenanceRequest } from "../../convex/stay/maintenance";
import { conditionChange, formatDay, pairRooms } from "../lib/stay-ops/labels";

describe("addMonths", () => {
  it("adds months across a year end", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-10-31", 4)).toBe("2028-02-29");
  });
});

describe("inspectionDueState", () => {
  it("flags overdue, due soon and not due", () => {
    expect(inspectionDueState("2026-10-01", "2026-10-28")).toBe("overdue");
    expect(inspectionDueState("2026-10-28", "2026-10-28")).toBe("due_soon");
    expect(inspectionDueState("2026-11-27", "2026-10-28")).toBe("due_soon");
    expect(inspectionDueState("2026-12-01", "2026-10-28")).toBeNull();
    expect(inspectionDueState(undefined, "2026-10-28")).toBeNull();
  });
});

describe("needsLandlordApproval", () => {
  it("needs approval only above a set threshold", () => {
    expect(needsLandlordApproval(501, 500)).toBe(true);
    expect(needsLandlordApproval(500, 500)).toBe(false);
    expect(needsLandlordApproval(10000, undefined)).toBe(false);
    expect(needsLandlordApproval(10000, 0)).toBe(false);
  });
});

describe("pairRooms and conditionChange", () => {
  it("pairs by name ignoring case and keeps unmatched rooms", () => {
    const out = [{ name: "Kitchen" }, { name: "Garage" }];
    const inn = [{ name: "kitchen" }, { name: "Bedroom" }];
    const rows = pairRooms(out, inn);
    expect(rows.map((r) => r.name)).toEqual(["Kitchen", "Garage", "Bedroom"]);
    expect(rows[0].in).toEqual({ name: "kitchen" });
    expect(rows[1].in).toBeNull();
    expect(rows[2].out).toBeNull();
  });
  it("compares condition", () => {
    expect(conditionChange("good", "damaged")).toBe("worse");
    expect(conditionChange("poor", "good")).toBe("better");
    expect(conditionChange("fair", "fair")).toBe("same");
    expect(conditionChange(undefined, "fair")).toBe("unknown");
  });
  it("formats a day", () => {
    expect(formatDay("2026-03-05")).toBe("5 Mar 2026");
  });
});

describe("shapeMaintenanceRequest", () => {
  it("adds labels and counts photos", () => {
    const row = {
      _id: "m1",
      title: "Tap",
      description: "Leaks",
      status: "in_progress",
      raisedVia: "staff",
      unitId: "u1",
      stayPropertyId: "p1",
      photos: ["a", "b"],
      createdAt: 1,
      updatedAt: 2,
    } as never;
    const s = shapeMaintenanceRequest(row, { unitLabel: "Flat 1", propertyTitle: "Block A" });
    expect(s.statusLabel).toBe("In progress");
    expect(s.photoCount).toBe(2);
    expect(s.photoUrls).toEqual([]);
  });
});
