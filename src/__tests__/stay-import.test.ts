import { describe, it, expect } from "vitest";
import { batches, parseDateCell, parseImportRows } from "../lib/stay/import";

const base = {
  "Landlord name": "Tendai Moyo",
  "Landlord phone": "+263 77 123 4567",
  "Property name": "12 Kings Road",
  "Property address": "12 Kings Road, Harare",
  "Property type (residential or commercial)": "residential",
  "Management fee %": 10,
};

const lease = {
  "Tenant name": "Rudo Chari",
  "Lease start": "2026-01-01",
  "Lease end": "2026-12-31",
  "Monthly rent": 450,
  "Currency (USD or ZiG)": "USD",
  "Rent due day (1 to 28)": 1,
  Deposit: 450,
};

describe("parseDateCell", () => {
  it("accepts ISO, day-first and Excel serial dates", () => {
    expect(parseDateCell("2026-03-05")).toBe("2026-03-05");
    expect(parseDateCell("05/03/2026")).toBe("2026-03-05");
    expect(parseDateCell(46023)).toBe("2026-01-01");
    expect(parseDateCell(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("rejects impossible dates and text", () => {
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("next week")).toBeNull();
    expect(parseDateCell("")).toBeNull();
  });
});

describe("parseImportRows", () => {
  it("groups units under one property, reading the landlord from the first row", () => {
    const { properties, errors } = parseImportRows([
      { ...base, Unit: "Flat 1", ...lease },
      { "Property name": "12 kings road", Unit: "Flat 2" },
    ]);
    expect(errors).toEqual([]);
    expect(properties).toHaveLength(1);
    const p = properties[0];
    expect(p.landlord.name).toBe("Tendai Moyo");
    expect(p.feePct).toBe(10);
    expect(p.units.map((u) => u.label)).toEqual(["Flat 1", "Flat 2"]);
    expect(p.units[0].lease).toMatchObject({ startDate: "2026-01-01", rent: 450, currency: "USD", dueDay: 1, deposit: 450 });
    expect(p.units[1].lease).toBeUndefined();
  });

  it("matches headers loosely and reads ZiG", () => {
    const { properties, errors } = parseImportRows([
      { "landlord name": "A", "property name": "P", unit: "1", "tenant name": "T", "lease start": "01/02/2026", "lease end": "31/01/2027", "monthly rent": "1,200", currency: "zig" },
    ]);
    expect(errors).toEqual([]);
    expect(properties[0].units[0].lease).toMatchObject({ rent: 1200, currency: "ZiG", startDate: "2026-02-01", endDate: "2027-01-31" });
  });

  it("reports bad rows with spreadsheet row numbers and keeps the rest", () => {
    const { properties, errors } = parseImportRows([
      { ...base, Unit: "Flat 1", ...lease },
      { "Property name": "12 Kings Road", Unit: "Flat 2", ...lease, "Rent due day (1 to 28)": 31 },
      { "Property name": "12 Kings Road", Unit: "Flat 3", ...lease, "Currency (USD or ZiG)": "ZAR" },
      { "Property name": "Other", Unit: "1" },
      { "Property name": "12 Kings Road", Unit: "Flat 1" },
    ]);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(errors[3].message).toMatch(/twice/);
    expect(properties).toHaveLength(1);
    expect(properties[0].units).toHaveLength(1);
  });

  it("rejects a lease that ends before it starts", () => {
    const { errors } = parseImportRows([{ ...base, Unit: "1", ...lease, "Lease end": "2025-12-01" }]);
    expect(errors[0].message).toMatch(/after lease start/);
  });

  it("skips blank lines", () => {
    const { properties, errors } = parseImportRows([{}, { "Property name": "" }, { ...base, Unit: "A" }]);
    expect(errors).toEqual([]);
    expect(properties).toHaveLength(1);
  });
});

describe("batches", () => {
  it("splits a list into fixed-size chunks", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
