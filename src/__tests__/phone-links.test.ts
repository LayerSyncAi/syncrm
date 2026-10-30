import { describe, it, expect } from "vitest";
import { telHref, whatsAppHref } from "../lib/phone";

describe("telHref", () => {
  it("dials local numbers with the country code", () => {
    expect(telHref("077 123 4567")).toBe("tel:+263771234567");
  });

  it("keeps international numbers as they are", () => {
    expect(telHref("+27 82 123 4567")).toBe("tel:+27821234567");
  });

  it("still dials short numbers it can't normalise", () => {
    expect(telHref("112")).toBe("tel:112");
  });

  it("returns null without a number", () => {
    expect(telHref("")).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});

describe("whatsAppHref", () => {
  it("adds the country code to local numbers", () => {
    // wa.me needs the full international number, so "077..." alone fails.
    expect(whatsAppHref("077 123 4567")).toBe("https://wa.me/263771234567");
  });

  it("strips the plus and spacing from international numbers", () => {
    expect(whatsAppHref("+263 92 837 2642")).toBe("https://wa.me/263928372642");
  });

  it("returns null when the number can't be read", () => {
    expect(whatsAppHref("12")).toBeNull();
    expect(whatsAppHref(null)).toBeNull();
  });
});
