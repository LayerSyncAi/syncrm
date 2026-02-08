import { describe, it, expect } from "vitest";

// Mirror the scoring types from leadScoring.ts
interface Criterion {
  key: string;
  label: string;
  type: "boolean" | "threshold";
  weight: number;
  enabled: boolean;
  threshold?: number;
}

interface Lead {
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredAreas: string[];
  notes: string;
}

interface Activity {
  createdAt: number;
}

// Pure scoring function extracted from the backend logic
function computeScore(
  lead: Lead,
  activities: Activity[],
  criteria: Criterion[],
  now: number = Date.now()
): { totalScore: number; breakdown: Array<{ key: string; met: boolean; points: number }> } {
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const breakdown: Array<{ key: string; met: boolean; points: number }> = [];
  let totalScore = 0;

  for (const criterion of criteria) {
    if (!criterion.enabled) continue;

    let met = false;
    switch (criterion.key) {
      case "has_email":
        met = !!lead.email && lead.email.trim().length > 0;
        break;
      case "has_budget":
        met = lead.budgetMin !== undefined || lead.budgetMax !== undefined;
        break;
      case "has_preferred_areas":
        met = lead.preferredAreas.length > 0;
        break;
      case "has_notes":
        met = lead.notes.trim().length > 0;
        break;
      case "activity_count":
        met = activities.length >= (criterion.threshold || 0);
        break;
      case "budget_min":
        met = (lead.budgetMin || 0) >= (criterion.threshold || 0);
        break;
      case "recent_activity":
        met = activities.some((a) => a.createdAt >= sevenDaysAgo);
        break;
    }

    const points = met ? criterion.weight : 0;
    totalScore += points;
    breakdown.push({ key: criterion.key, met, points });
  }

  return { totalScore, breakdown };
}

const DEFAULT_CRITERIA: Criterion[] = [
  { key: "has_email", label: "Has email", type: "boolean", weight: 10, enabled: true },
  { key: "has_budget", label: "Has budget", type: "boolean", weight: 15, enabled: true },
  { key: "has_preferred_areas", label: "Has areas", type: "boolean", weight: 10, enabled: true },
  { key: "has_notes", label: "Has notes", type: "boolean", weight: 5, enabled: true },
  { key: "activity_count", label: "Activities", type: "threshold", weight: 20, enabled: true, threshold: 3 },
  { key: "budget_min", label: "Budget min", type: "threshold", weight: 15, enabled: true, threshold: 50000 },
  { key: "recent_activity", label: "Recent activity", type: "boolean", weight: 25, enabled: true },
];

describe("Lead Scoring", () => {
  const now = Date.now();

  it("scores a fully-qualified lead at maximum", () => {
    const lead: Lead = {
      email: "john@example.com",
      budgetMin: 100000,
      budgetMax: 200000,
      preferredAreas: ["Downtown"],
      notes: "Very interested",
    };
    const activities: Activity[] = [
      { createdAt: now - 1000 },
      { createdAt: now - 2000 },
      { createdAt: now - 3000 },
    ];

    const result = computeScore(lead, activities, DEFAULT_CRITERIA, now);
    expect(result.totalScore).toBe(100); // 10+15+10+5+20+15+25
    expect(result.breakdown.every((b) => b.met)).toBe(true);
  });

  it("scores an empty lead at zero", () => {
    const lead: Lead = {
      preferredAreas: [],
      notes: "",
    };

    const result = computeScore(lead, [], DEFAULT_CRITERIA, now);
    expect(result.totalScore).toBe(0);
    expect(result.breakdown.every((b) => !b.met)).toBe(true);
  });

  it("partial lead gets partial score", () => {
    const lead: Lead = {
      email: "john@example.com", // +10
      budgetMin: 30000, // below 50000 threshold
      preferredAreas: ["Area1"], // +10
      notes: "Some notes", // +5
    };

    const result = computeScore(lead, [], DEFAULT_CRITERIA, now);
    // has_email=10, has_budget=15 (budgetMin is set), has_areas=10, has_notes=5
    // activity_count=0 (no activities), budget_min=0 (30k<50k), recent_activity=0
    expect(result.totalScore).toBe(40);
  });

  it("disabled criteria are not counted", () => {
    const criteria = DEFAULT_CRITERIA.map((c) => ({
      ...c,
      enabled: c.key === "has_email",
    }));

    const lead: Lead = {
      email: "john@example.com",
      preferredAreas: ["Area1"],
      notes: "notes",
    };

    const result = computeScore(lead, [], criteria, now);
    // Only has_email is enabled (weight 10)
    expect(result.totalScore).toBe(10);
    expect(result.breakdown.length).toBe(1);
  });

  it("changing weight changes score", () => {
    const criteria = DEFAULT_CRITERIA.map((c) =>
      c.key === "has_email" ? { ...c, weight: 50 } : c
    );

    const lead: Lead = {
      email: "john@example.com",
      preferredAreas: [],
      notes: "",
    };

    const result = computeScore(lead, [], criteria, now);
    expect(result.totalScore).toBe(50); // only has_email matched at weight 50
  });

  it("threshold criterion only passes when value meets threshold", () => {
    const lead: Lead = {
      budgetMin: 49999,
      preferredAreas: [],
      notes: "",
    };

    const criteria = [
      { key: "budget_min", label: "Budget", type: "threshold" as const, weight: 15, enabled: true, threshold: 50000 },
    ];

    const below = computeScore(lead, [], criteria, now);
    expect(below.totalScore).toBe(0);

    const atThreshold = computeScore(
      { ...lead, budgetMin: 50000 },
      [],
      criteria,
      now
    );
    expect(atThreshold.totalScore).toBe(15);

    const above = computeScore(
      { ...lead, budgetMin: 100000 },
      [],
      criteria,
      now
    );
    expect(above.totalScore).toBe(15);
  });

  it("activity_count threshold works correctly", () => {
    const criteria = [
      { key: "activity_count", label: "Activities", type: "threshold" as const, weight: 20, enabled: true, threshold: 3 },
    ];
    const lead: Lead = { preferredAreas: [], notes: "" };

    const twoActivities = computeScore(
      lead,
      [{ createdAt: now }, { createdAt: now }],
      criteria,
      now
    );
    expect(twoActivities.totalScore).toBe(0);

    const threeActivities = computeScore(
      lead,
      [{ createdAt: now }, { createdAt: now }, { createdAt: now }],
      criteria,
      now
    );
    expect(threeActivities.totalScore).toBe(20);
  });

  it("recent_activity checks 7 day window", () => {
    const criteria = [
      { key: "recent_activity", label: "Recent", type: "boolean" as const, weight: 25, enabled: true },
    ];
    const lead: Lead = { preferredAreas: [], notes: "" };

    const recent = computeScore(
      lead,
      [{ createdAt: now - 1 * 24 * 60 * 60 * 1000 }],
      criteria,
      now
    );
    expect(recent.totalScore).toBe(25);

    const old = computeScore(
      lead,
      [{ createdAt: now - 8 * 24 * 60 * 60 * 1000 }],
      criteria,
      now
    );
    expect(old.totalScore).toBe(0);
  });

  it("recompute produces consistent results", () => {
    const lead: Lead = {
      email: "test@test.com",
      budgetMin: 75000,
      preferredAreas: ["Area"],
      notes: "Test",
    };
    const activities = [{ createdAt: now - 1000 }];

    const result1 = computeScore(lead, activities, DEFAULT_CRITERIA, now);
    const result2 = computeScore(lead, activities, DEFAULT_CRITERIA, now);

    expect(result1.totalScore).toBe(result2.totalScore);
    expect(result1.breakdown).toEqual(result2.breakdown);
  });
});
