import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  TRIAL_WARNING_DAYS,
  extendTrialEnd,
  isPaidPlan,
  planStatus,
  whiteLabelForPlan,
} from "../../convex/lib/plans";

const NOW = new Date(2026, 10, 19, 10, 0, 0).getTime();

describe("planStatus", () => {
  it("labels organisations without a plan", () => {
    expect(planStatus({}, NOW)).toMatchObject({ plan: null, label: "No plan set", endingSoon: false });
  });

  it.each([
    ["beta", "Beta tester"],
    ["standard", "Standard"],
    ["white_label", "White label"],
  ] as const)("%s has no end date", (plan, label) => {
    expect(planStatus({ plan }, NOW)).toMatchObject({ plan, label, detail: "", daysLeft: null, expired: false });
  });

  it("counts whole days left on a trial", () => {
    const s = planStatus({ plan: "trial", trialEndsAt: NOW + 20 * DAY_MS }, NOW);
    expect(s).toMatchObject({ daysLeft: 20, detail: "20 days left", tone: "info", endingSoon: false });
  });

  it("warns in the last week", () => {
    const s = planStatus({ plan: "trial", trialEndsAt: NOW + TRIAL_WARNING_DAYS * DAY_MS }, NOW);
    expect(s).toMatchObject({ endingSoon: true, tone: "warning", expired: false });
    expect(planStatus({ plan: "trial", trialEndsAt: NOW + 1 * DAY_MS }, NOW).detail).toBe("1 day left");
  });

  it("says 'Ends today' in the last hours", () => {
    expect(planStatus({ plan: "trial", trialEndsAt: NOW + 3 * 3600_000 }, NOW).detail).toBe("Ends today");
  });

  it("marks an ended trial", () => {
    const s = planStatus({ plan: "trial", trialEndsAt: NOW - 3 * DAY_MS }, NOW);
    expect(s).toMatchObject({ expired: true, endingSoon: true, tone: "danger", detail: "Ended 3 days ago" });
    expect(planStatus({ plan: "trial", trialEndsAt: NOW - 1000 }, NOW).detail).toBe("Ended today");
  });
});

describe("extendTrialEnd", () => {
  it("adds days to a running trial", () => {
    expect(extendTrialEnd(NOW + 5 * DAY_MS, 14, NOW)).toBe(NOW + 19 * DAY_MS);
  });

  it("counts from today once the trial has ended", () => {
    expect(extendTrialEnd(NOW - 10 * DAY_MS, 7, NOW)).toBe(NOW + 7 * DAY_MS);
    expect(extendTrialEnd(undefined, 7, NOW)).toBe(NOW + 7 * DAY_MS);
  });
});

describe("plans and the look", () => {
  it("lets paid plans decide white label", () => {
    expect(whiteLabelForPlan("white_label", false)).toBe(true);
    expect(whiteLabelForPlan("standard", true)).toBe(false);
  });

  it("keeps the current look for trial and beta", () => {
    expect(whiteLabelForPlan("trial", true)).toBe(true);
    expect(whiteLabelForPlan("beta", false)).toBe(false);
  });

  it("knows which plans are paid", () => {
    expect(["trial", "beta", "standard", "white_label", null].map((p) => isPaidPlan(p as never))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });
});
