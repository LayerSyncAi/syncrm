import { describe, it, expect } from "vitest";
import { deriveOrgTheme, inkFor, orgInitials, orgThemeCss } from "../lib/org-theme";
import { contrastRatio, parseHex } from "../lib/color";
import { brand } from "../config/brand";

const WHITE = "#ffffff";

describe("deriveOrgTheme", () => {
  it("falls back to the SyncEstate colours when nothing (or garbage) is given", () => {
    for (const input of [{}, { primary: null, sidebar: null }, { primary: "blue", sidebar: "#12" }]) {
      const t = deriveOrgTheme(input);
      expect(t.primary).toBe(brand.colors.primary);
      expect(t.sidebar).toBe(brand.colors.sidebar);
    }
  });

  it.each(["#1f5fad", "#9bd83d", "#ca8a04", "#7c3aed", "#ffffff", "#000000", "#0f766e"])(
    "keeps every derived shade readable for primary %s",
    (primary) => {
      const t = deriveOrgTheme({ primary });
      // Text on a filled primary button.
      expect(contrastRatio(t.primaryForeground, t.primary)).toBeGreaterThanOrEqual(3);
      // Links / active labels on white cards and the content background.
      expect(contrastRatio(t.primaryInk, WHITE)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.primaryInk, brand.colors.background)).toBeGreaterThanOrEqual(4.5);
      for (const hex of Object.values(t)) expect(parseHex(hex)).not.toBeNull();
    }
  );

  it("uses a dark enough primary as its own ink", () => {
    expect(inkFor("#1f5fad")).toBe("#1f5fad");
  });

  it("darkens a light primary for text", () => {
    const ink = inkFor("#9bd83d");
    expect(ink).not.toBe("#9bd83d");
    expect(contrastRatio(ink, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("puts light text on a dark sidebar", () => {
    const t = deriveOrgTheme({ sidebar: "#0b2545" });
    expect(contrastRatio(t.sidebarForeground, t.sidebar)).toBeGreaterThanOrEqual(4.5);
    expect(t.sidebarHover).not.toBe(t.sidebar);
  });
});

describe("orgThemeCss", () => {
  it("overrides the brand custom properties on :root", () => {
    const css = orgThemeCss(deriveOrgTheme({ primary: "#1f5fad", sidebar: "#0b2545" }));
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).toContain("--brand-primary:#1f5fad;");
    expect(css).toContain("--brand-sidebar:#0b2545;");
    expect(css).toContain("--brand-primary-ink:");
    expect(css).toContain("--brand-primary-foreground:");
    // Nothing that could break out of the <style> element.
    expect(css).not.toMatch(/[<>]/);
  });
});

describe("orgInitials", () => {
  it.each([
    ["Chas Everett", "CE"],
    ["  chas   everett realty ", "CE"],
    ["Pam", "PA"],
    ["", "?"],
  ])("%s → %s", (name, expected) => {
    expect(orgInitials(name)).toBe(expected);
  });
});
