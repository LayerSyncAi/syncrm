import { describe, expect, it } from "vitest";
import { randomPassword } from "../../convex/lib/authReconcile";
import { generateSlug } from "../../convex/platformLib";

describe("randomPassword", () => {
  it("is 12 characters from the readable alphabet", () => {
    const pw = randomPassword();
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]+$/);
  });

  it("differs per call, so no two logins share a temporary password", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomPassword()));
    expect(seen.size).toBe(200);
  });
});

describe("generateSlug", () => {
  it("lower-cases and hyphenates an agency name", () => {
    expect(generateSlug("Oasis Properties & Co.")).toBe("oasis-properties-co");
  });

  it("trims stray hyphens and caps the length", () => {
    expect(generateSlug("  --Jawitz--  ")).toBe("jawitz");
    expect(generateSlug("a".repeat(80))).toHaveLength(50);
  });
});
