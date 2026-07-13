import { describe, it, expect } from "vitest";
import {
  normalizeOwnership,
  resolveListingOwnership,
  canManagePropertyPure,
  canAccessPropertyPrivatePure,
  isUnmigrated,
  type AccessUser,
  type OwnershipInput,
} from "../../convex/propertyAccessLib";

const admin: AccessUser = { _id: "admin1", role: "admin", orgId: "org1" };
const ownerAgent: AccessUser = { _id: "agentA", role: "agent", orgId: "org1" };
const otherAgent: AccessUser = { _id: "agentB", role: "agent", orgId: "org1" };
const foreignAgent: AccessUser = { _id: "agentX", role: "agent", orgId: "org2" };

describe("normalizeOwnership", () => {
  it("empty/undefined => company", () => {
    expect(normalizeOwnership()).toEqual({
      ownershipType: "company",
      ownerUserIds: [],
    });
    expect(normalizeOwnership([])).toEqual({
      ownershipType: "company",
      ownerUserIds: [],
    });
  });

  it("single id => agent", () => {
    expect(normalizeOwnership(["a"])).toEqual({
      ownershipType: "agent",
      ownerUserIds: ["a"],
    });
  });

  it("multiple ids => multiple, de-duplicated", () => {
    expect(normalizeOwnership(["a", "b", "a"])).toEqual({
      ownershipType: "multiple",
      ownerUserIds: ["a", "b"],
    });
  });
});

describe("resolveListingOwnership (bulk import per-row vs default)", () => {
  it("no per-row assignment falls back to the batch default", () => {
    expect(resolveListingOwnership(undefined, [])).toEqual({
      ownershipType: "company",
      ownerUserIds: [],
    });
    expect(resolveListingOwnership(undefined, ["a"])).toEqual({
      ownershipType: "agent",
      ownerUserIds: ["a"],
    });
    expect(resolveListingOwnership(undefined, ["a", "b"])).toEqual({
      ownershipType: "multiple",
      ownerUserIds: ["a", "b"],
    });
  });

  it("a per-row assignment overrides the default", () => {
    // Row pinned to agents X+Y while the batch default is company.
    expect(resolveListingOwnership(["x", "y"], [])).toEqual({
      ownershipType: "multiple",
      ownerUserIds: ["x", "y"],
    });
    // Row pinned to company while the batch default is an agent.
    expect(resolveListingOwnership([], ["a"])).toEqual({
      ownershipType: "company",
      ownerUserIds: [],
    });
  });

  it("mixed batch: A->X, B->X+Y, C->company in one pass", () => {
    const batchDefault: string[] = [];
    const A = resolveListingOwnership(["X"], batchDefault);
    const B = resolveListingOwnership(["X", "Y"], batchDefault);
    const C = resolveListingOwnership(undefined, batchDefault);
    expect(A.ownerUserIds).toEqual(["X"]);
    expect(B.ownerUserIds).toEqual(["X", "Y"]);
    expect(C.ownershipType).toBe("company");
  });
});

describe("isUnmigrated", () => {
  it("true when no ownershipType and no owners", () => {
    expect(isUnmigrated({ createdByUserId: "x" })).toBe(true);
  });
  it("false once ownershipType is set", () => {
    expect(isUnmigrated({ ownershipType: "company", ownerUserIds: [] })).toBe(
      false
    );
  });
});

describe("canManagePropertyPure", () => {
  const agentOwned: OwnershipInput = {
    ownershipType: "agent",
    ownerUserIds: ["agentA"],
    orgId: "org1",
  };

  it("admins can manage anything in their org", () => {
    expect(canManagePropertyPure(agentOwned, admin)).toBe(true);
    expect(
      canManagePropertyPure(
        { ownershipType: "company", ownerUserIds: [], orgId: "org1" },
        admin
      )
    ).toBe(true);
  });

  it("owners can manage", () => {
    expect(canManagePropertyPure(agentOwned, ownerAgent)).toBe(true);
  });

  it("non-owner agents cannot manage", () => {
    expect(canManagePropertyPure(agentOwned, otherAgent)).toBe(false);
  });

  it("company-owned: agents cannot manage, only admins", () => {
    const company: OwnershipInput = {
      ownershipType: "company",
      ownerUserIds: [],
      orgId: "org1",
    };
    expect(canManagePropertyPure(company, ownerAgent)).toBe(false);
    expect(canManagePropertyPure(company, admin)).toBe(true);
  });

  it("un-migrated property: creator can manage", () => {
    const legacy: OwnershipInput = { createdByUserId: "agentA", orgId: "org1" };
    expect(canManagePropertyPure(legacy, ownerAgent)).toBe(true);
    expect(canManagePropertyPure(legacy, otherAgent)).toBe(false);
  });

  it("cross-org access is denied even for admins", () => {
    const foreignAdmin: AccessUser = {
      _id: "admin2",
      role: "admin",
      orgId: "org2",
    };
    expect(canManagePropertyPure(agentOwned, foreignAdmin)).toBe(false);
  });
});

describe("canAccessPropertyPrivatePure", () => {
  const multiOwned: OwnershipInput = {
    ownershipType: "multiple",
    ownerUserIds: ["agentA", "agentB"],
    orgId: "org1",
  };
  const company: OwnershipInput = {
    ownershipType: "company",
    ownerUserIds: [],
    orgId: "org1",
  };

  it("admins always have access (in org)", () => {
    expect(canAccessPropertyPrivatePure(company, admin, false)).toBe(true);
  });

  it("any of the multiple owners has access", () => {
    expect(canAccessPropertyPrivatePure(multiOwned, ownerAgent, false)).toBe(
      true
    );
    expect(canAccessPropertyPrivatePure(multiOwned, otherAgent, false)).toBe(
      true
    );
  });

  it("non-owner without collaborator grant is denied", () => {
    const single: OwnershipInput = {
      ownershipType: "agent",
      ownerUserIds: ["agentA"],
      orgId: "org1",
    };
    expect(canAccessPropertyPrivatePure(single, otherAgent, false)).toBe(false);
  });

  it("collaborator grant unlocks access for a non-owner", () => {
    const single: OwnershipInput = {
      ownershipType: "agent",
      ownerUserIds: ["agentA"],
      orgId: "org1",
    };
    expect(canAccessPropertyPrivatePure(single, otherAgent, true)).toBe(true);
  });

  it("company-owned: non-collaborator agents are denied; collaborators allowed", () => {
    expect(canAccessPropertyPrivatePure(company, ownerAgent, false)).toBe(false);
    expect(canAccessPropertyPrivatePure(company, ownerAgent, true)).toBe(true);
  });

  it("cross-org agents are denied even with a (stale) collaborator flag", () => {
    expect(canAccessPropertyPrivatePure(multiOwned, foreignAgent, true)).toBe(
      false
    );
  });

  it("un-migrated property: creator retains access", () => {
    const legacy: OwnershipInput = { createdByUserId: "agentA", orgId: "org1" };
    expect(canAccessPropertyPrivatePure(legacy, ownerAgent, false)).toBe(true);
    expect(canAccessPropertyPrivatePure(legacy, otherAgent, false)).toBe(false);
  });
});
