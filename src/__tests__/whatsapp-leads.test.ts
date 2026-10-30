import { describe, it, expect } from "vitest";
import { internationalDigits, phoneVariants, pickOpenLead } from "../../convex/lib/whatsappLeads";

describe("internationalDigits", () => {
  it("keeps what WhatsApp gives", () => {
    expect(internationalDigits("263771234567")).toBe("263771234567");
    expect(internationalDigits("+263 77 123 4567")).toBe("263771234567");
  });

  it("adds the country code to local numbers", () => {
    expect(internationalDigits("077 123 4567")).toBe("263771234567");
    expect(internationalDigits("771234567")).toBe("263771234567");
  });

  it("does not put Zimbabwe's code on a foreign number", () => {
    expect(internationalDigits("27821234567")).toBe("27821234567");
    expect(internationalDigits("+44 7700 900123")).toBe("447700900123");
  });

  it("reads the 00 international prefix", () => {
    expect(internationalDigits("00263771234567")).toBe("263771234567");
  });
});

describe("phoneVariants", () => {
  it("covers every way a Zimbabwean number is typed", () => {
    expect(phoneVariants("263771234567").sort()).toEqual(
      ["00263771234567", "0771234567", "263771234567", "771234567"].sort()
    );
  });

  it("finds the same stored forms from a typed local number", () => {
    expect(phoneVariants("0771234567").sort()).toEqual(phoneVariants("263771234567").sort());
  });

  it("does not invent local forms for a foreign number", () => {
    expect(phoneVariants("27821234567").sort()).toEqual(["0027821234567", "27821234567"]);
  });

  it("drops anything too short to identify someone", () => {
    expect(phoneVariants("123")).toEqual([]);
  });
});

describe("pickOpenLead", () => {
  const lead = (ownerUserId: string, createdAt: number, extra = {}) => ({ ownerUserId, createdAt, ...extra });

  it("skips closed and archived leads", () => {
    expect(pickOpenLead([lead("a", 1, { closedAt: 5 }), lead("a", 2, { isArchived: true })], "a")).toBeNull();
  });

  it("prefers the caller's own lead over a newer colleague's", () => {
    const mine = lead("me", 1);
    expect(pickOpenLead([lead("other", 9), mine], "me")).toBe(mine);
  });

  it("otherwise takes the newest", () => {
    const newest = lead("other", 9);
    expect(pickOpenLead([lead("other", 1), newest], "me")).toBe(newest);
  });
});
