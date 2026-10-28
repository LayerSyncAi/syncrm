import { describe, it, expect } from "vitest";
import { canSeeJobPure, canWorkJobPure, worthCapabilities } from "../../convex/worth/access";
import type { EstateRole } from "../../convex/lib/modules";

const agent = (...roles: EstateRole[]) => ({ role: "agent" as const, estateRoles: roles });
const ORG = "org1";
const job = (over: Partial<{ assignedValuerId: string; status: string; orgId: string }> = {}) =>
  ({ orgId: ORG, assignedValuerId: "v1", status: "draft", ...over }) as never;

describe("worthCapabilities", () => {
  it("gives a director everything except issuing", () => {
    const c = worthCapabilities({ role: "admin" });
    expect(c.isDirector).toBe(true);
    expect(c.seesAllJobs && c.seesValues && c.canManageJobs && c.canReview && c.canManageFees && c.canAdmin).toBe(true);
    expect(c.canIssue).toBe(false);
  });

  it("treats an admin in Agent Mode as their roles only", () => {
    const c = worthCapabilities({ role: "admin", agentMode: true, estateRoles: ["valuer"] });
    expect(c.isDirector).toBe(false);
    expect(c.seesAllJobs).toBe(false);
    expect(c.canWorkAssigned).toBe(true);
  });

  it("lets a signing valuer see all jobs, review and issue", () => {
    const c = worthCapabilities(agent("signing_valuer"));
    expect(c.seesAllJobs && c.canReview && c.canIssue && c.canWorkAnyJob).toBe(true);
    expect(c.canManageFees).toBe(false);
  });

  it("limits a valuer to assigned work but opens evidence", () => {
    const c = worthCapabilities(agent("valuer"));
    expect(c.seesAllJobs).toBe(false);
    expect(c.seesEvidence).toBe(true);
    expect(c.canIssue || c.canReview || c.canManageJobs).toBe(false);
  });

  it("lets a valuations admin log, assign and send but not value", () => {
    const c = worthCapabilities(agent("valuations_admin"));
    expect(c.canManageJobs && c.canSendReports && c.seesValues).toBe(true);
    expect(c.canWorkAssigned || c.canWorkAnyJob || c.canIssue).toBe(false);
  });

  it("shows accounts fees and never values", () => {
    const c = worthCapabilities(agent("accounts"));
    expect(c.seesValues || c.seesEvidence).toBe(false);
    expect(c.canManageFees && c.canEditFee && c.seesAllJobs).toBe(true);
  });

  it("unions several roles", () => {
    const c = worthCapabilities(agent("valuer", "accounts"));
    expect(c.seesValues && c.canManageFees && c.canWorkAssigned).toBe(true);
    expect(c.canIssue).toBe(false);
  });
});

describe("job visibility", () => {
  const valuer = worthCapabilities(agent("valuer"));

  it("shows a valuer their own jobs and issued archive only", () => {
    expect(canSeeJobPure(valuer, "v1", ORG, job())).toBe(true);
    expect(canSeeJobPure(valuer, "v2", ORG, job())).toBe(false);
    expect(canSeeJobPure(valuer, "v2", ORG, job({ status: "issued" }))).toBe(true);
  });

  it("never crosses organisations", () => {
    const director = worthCapabilities({ role: "admin" });
    expect(canSeeJobPure(director, "u", ORG, job({ orgId: "other" }))).toBe(false);
    expect(canSeeJobPure(director, "u", ORG, null)).toBe(false);
  });

  it("lets only the assigned valuer or a signing valuer work a job", () => {
    expect(canWorkJobPure(valuer, "v1", job())).toBe(true);
    expect(canWorkJobPure(valuer, "v2", job())).toBe(false);
    expect(canWorkJobPure(worthCapabilities(agent("signing_valuer")), "x", job())).toBe(true);
    expect(canWorkJobPure(worthCapabilities(agent("valuations_admin")), "v1", job())).toBe(false);
  });
});
