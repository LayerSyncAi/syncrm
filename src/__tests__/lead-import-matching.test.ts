import { describe, it, expect } from "vitest";
import {
  matchAgent,
  parseInterestType,
  type AgentCandidate,
} from "../../convex/lib/leadImportMatching";

describe("parseInterestType", () => {
  it("reads the stored values", () => {
    expect(parseInterestType("rent")).toBe("rent");
    expect(parseInterestType("buy")).toBe("buy");
  });

  it("reads portal wordings for renting, in any case", () => {
    for (const v of ["Rent", "RENTING", "To Let", "to-let", "For Rent", "Rental", "Lease", " letting "]) {
      expect(parseInterestType(v)).toBe("rent");
    }
  });

  it("reads portal wordings for buying, in any case", () => {
    for (const v of ["Buy", "Buying", "For Sale", "for_sale", "Sale", "Purchase", "SALES"]) {
      expect(parseInterestType(v)).toBe("buy");
    }
  });

  it("reads longer phrases when only one side is named", () => {
    expect(parseInterestType("Residential Property To Let")).toBe("rent");
    expect(parseInterestType("House for sale in Borrowdale")).toBe("buy");
  });

  it("returns null instead of defaulting to buy", () => {
    expect(parseInterestType("")).toBeNull();
    expect(parseInterestType(undefined)).toBeNull();
    expect(parseInterestType("Commercial")).toBeNull();
    expect(parseInterestType("Rent or buy")).toBeNull();
    expect(parseInterestType("Valuation")).toBeNull();
  });
});

const agents: AgentCandidate[] = [
  { id: "u1", name: "John Moyo", email: "john.moyo@propertyshop.co.zw" },
  { id: "u2", name: "Tendai Chikwanha", email: "tendai@propertyshop.co.zw" },
  { id: "u3", name: "Rutendo Moyo", email: "rutendo@propertyshop.co.zw" },
  { id: "u4", name: "Johnathan Mutasa", email: "jm@propertyshop.co.zw" },
  { id: "u5", name: "Tatenda Banda", email: "tatenda@propertyshop.co.zw" },
];

const idOf = (raw: string) => {
  const m = matchAgent(raw, agents);
  return m.status === "matched" ? m.agentId : m.status;
};

describe("matchAgent", () => {
  it("matches the exact name regardless of case and spacing", () => {
    expect(idOf("John Moyo")).toBe("u1");
    expect(idOf("  john   MOYO ")).toBe("u1");
  });

  it("matches names written in a different order", () => {
    expect(idOf("Moyo John")).toBe("u1");
    expect(idOf("Moyo, John")).toBe("u1");
  });

  it("matches initials and shortened names", () => {
    expect(idOf("J. Moyo")).toBe("u1");
    expect(idOf("John M")).toBe("u1");
    expect(idOf("T Chikwanha")).toBe("u2");
    expect(idOf("Tendai")).toBe("u2");
    expect(idOf("Chikwanha")).toBe("u2");
  });

  it("prefers a whole-word match over a fragment", () => {
    // "John" is a whole word of John Moyo but only a fragment of Johnathan.
    expect(idOf("John")).toBe("u1");
  });

  it("matches by email", () => {
    expect(idOf("tendai@propertyshop.co.zw")).toBe("u2");
    expect(idOf("JOHN.MOYO@propertyshop.co.zw")).toBe("u1");
  });

  it("does not guess when more than one agent fits", () => {
    const m = matchAgent("Moyo", agents);
    expect(m.status).toBe("ambiguous");
    if (m.status === "ambiguous") {
      expect(m.candidates.sort()).toEqual(["John Moyo", "Rutendo Moyo"]);
    }
    expect(idOf("T. Moyo")).toBe("not_found");
    expect(idOf("T")).toBe("ambiguous");
  });

  it("reports unknown names", () => {
    expect(idOf("Peter Ncube")).toBe("not_found");
    expect(idOf("John Moyo Smith")).toBe("not_found");
  });

  it("treats a blank cell as empty", () => {
    expect(matchAgent("", agents)).toEqual({ status: "empty" });
    expect(matchAgent("   ", agents)).toEqual({ status: "empty" });
    expect(matchAgent(undefined, agents)).toEqual({ status: "empty" });
  });
});
