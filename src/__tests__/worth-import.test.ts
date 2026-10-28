import { describe, it, expect } from "vitest";
import { chunk, mapHeaders, parseSheet, TEMPLATE_EXAMPLE, TEMPLATE_HEADERS, toIsoDate } from "../lib/worth/import";

describe("mapHeaders", () => {
  it("matches the template and loose variants", () => {
    const m = mapHeaders([...TEMPLATE_HEADERS]);
    expect(m.kind).toBe(0);
    expect(m.propertyType).toBe(4);
    expect(m.landSizeM2).toBe(5);
    expect(m.price).toBe(8);
    expect(mapHeaders(["Land Size (m²)", "Erf size"]).landSizeM2).toBe(0);
    expect(mapHeaders(["Market value", "FSV"]).forcedSaleValue).toBe(1);
  });
});

describe("toIsoDate", () => {
  it("reads ISO, day-first and Excel serial dates", () => {
    expect(toIsoDate("2026-03-14")).toBe("2026-03-14");
    expect(toIsoDate("14/03/2026")).toBe("2026-03-14");
    expect(toIsoDate(46095)).toBe("2026-03-14");
    expect(toIsoDate(new Date(Date.UTC(2026, 2, 14)))).toBe("2026-03-14");
    expect(toIsoDate("31/02/2026")).toBe(null);
    expect(toIsoDate("soon")).toBe(null);
  });
});

describe("parseSheet", () => {
  it("imports the template example", () => {
    const { rows, errors, missing } = parseSheet([[...TEMPLATE_HEADERS], TEMPLATE_EXAMPLE]);
    expect(missing).toEqual([]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      kind: "sale",
      address: "12 Glenara Avenue",
      suburb: "Highlands",
      landSizeM2: 2000,
      buildingSizeM2: 320,
      price: 285000,
      currency: "USD",
      date: "2026-03-14",
    });
  });

  it("reports bad rows, skips blank ones and infers rentals", () => {
    const sheet = [
      ["Address", "Suburb", "Date", "Price", "Rent", "Currency"],
      ["1 A Road", "Avondale", "2026-01-02", "", "800", "USD"],
      ["", "", "", "", "", ""],
      ["2 B Road", "", "2026-01-02", "1000", "", "USD"],
      ["3 C Road", "Belgravia", "2026-01-02", "1000", "", "GBP"],
      ["4 D Road", "Belgravia", "2026-01-02", "ZiG 1,500,000", "", "zig"],
    ];
    const { rows, errors } = parseSheet(sheet, "valuation");
    expect(rows.map((r) => [r.rowNumber, r.kind, r.currency])).toEqual([
      [2, "rental", "USD"],
      [6, "valuation", "ZiG"],
    ]);
    expect(rows[1].price).toBe(1_500_000);
    expect(errors).toEqual([
      { rowNumber: 4, message: "suburb is missing" },
      { rowNumber: 5, message: "currency must be USD or ZiG" },
    ]);
  });

  it("names missing required columns", () => {
    expect(parseSheet([["Address", "Notes"]]).missing).toEqual(["suburb", "date", "price"]);
  });

  it("chunks for batched upload", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
