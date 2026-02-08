import { describe, it, expect } from "vitest";

// Types mirroring the schema
interface Lead {
  _id: string;
  fullName: string;
  phone: string;
  normalizedPhone: string;
  email?: string;
  source: string;
  interestType: string;
  preferredAreas: string[];
  notes: string;
  isArchived?: boolean;
  mergedIntoLeadId?: string;
}

interface Activity {
  _id: string;
  leadId: string;
  type: string;
  title: string;
}

interface MergeAudit {
  primaryLeadId: string;
  mergedLeadIds: string[];
  fieldResolutions: Array<{
    field: string;
    chosenValue: string;
    sourceLeadId: string;
  }>;
  mergedByUserId: string;
  mergedAt: number;
}

// In-memory simulation of merge logic
function mergeLeads(
  leads: Lead[],
  activities: Activity[],
  primaryId: string,
  mergedIds: string[],
  fieldResolutions: Array<{
    field: string;
    chosenValue: string;
    sourceLeadId: string;
  }>
): { leads: Lead[]; activities: Activity[]; audit: MergeAudit } {
  const updatedLeads = leads.map((lead) => ({ ...lead }));
  const updatedActivities = activities.map((a) => ({ ...a }));

  const primary = updatedLeads.find((l) => l._id === primaryId);
  if (!primary) throw new Error("Primary lead not found");

  // Apply field resolutions
  for (const res of fieldResolutions) {
    if (res.field === "fullName") primary.fullName = res.chosenValue;
    else if (res.field === "email") primary.email = res.chosenValue || undefined;
    else if (res.field === "phone") {
      primary.phone = res.chosenValue;
      primary.normalizedPhone = res.chosenValue.replace(/[^\d]/g, "");
    } else if (res.field === "notes") primary.notes = res.chosenValue;
    else if (res.field === "preferredAreas") {
      primary.preferredAreas = res.chosenValue
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
    }
  }

  // Move activities from merged leads to primary
  for (const activity of updatedActivities) {
    if (mergedIds.includes(activity.leadId)) {
      activity.leadId = primaryId;
    }
  }

  // Archive merged leads
  for (const lead of updatedLeads) {
    if (mergedIds.includes(lead._id)) {
      lead.isArchived = true;
      lead.mergedIntoLeadId = primaryId;
    }
  }

  const audit: MergeAudit = {
    primaryLeadId: primaryId,
    mergedLeadIds: mergedIds,
    fieldResolutions,
    mergedByUserId: "admin1",
    mergedAt: Date.now(),
  };

  return { leads: updatedLeads, activities: updatedActivities, audit };
}

describe("Lead Merge", () => {
  const testLeads: Lead[] = [
    {
      _id: "lead1",
      fullName: "John Doe",
      phone: "+263771234567",
      normalizedPhone: "263771234567",
      email: "john@example.com",
      source: "website",
      interestType: "buy",
      preferredAreas: ["Downtown"],
      notes: "Interested in 3BR",
    },
    {
      _id: "lead2",
      fullName: "J. Doe",
      phone: "+263779876543",
      normalizedPhone: "263779876543",
      email: "jdoe@example.com",
      source: "referral",
      interestType: "buy",
      preferredAreas: ["Suburbs"],
      notes: "Budget flexible",
    },
    {
      _id: "lead3",
      fullName: "Alice Smith",
      phone: "+263770001111",
      normalizedPhone: "263770001111",
      email: "alice@test.com",
      source: "facebook",
      interestType: "rent",
      preferredAreas: [],
      notes: "",
    },
  ];

  const testActivities: Activity[] = [
    { _id: "act1", leadId: "lead1", type: "call", title: "Initial call" },
    { _id: "act2", leadId: "lead2", type: "email", title: "Follow up email" },
    { _id: "act3", leadId: "lead2", type: "meeting", title: "Site visit" },
    { _id: "act4", leadId: "lead3", type: "call", title: "Inquiry call" },
  ];

  it("primary lead retains chosen field values", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2"],
      [
        { field: "fullName", chosenValue: "John Doe", sourceLeadId: "lead1" },
        { field: "email", chosenValue: "jdoe@example.com", sourceLeadId: "lead2" },
        { field: "notes", chosenValue: "Budget flexible", sourceLeadId: "lead2" },
      ]
    );

    const primary = result.leads.find((l) => l._id === "lead1")!;
    expect(primary.fullName).toBe("John Doe");
    expect(primary.email).toBe("jdoe@example.com");
    expect(primary.notes).toBe("Budget flexible");
    expect(primary.isArchived).toBeFalsy();
  });

  it("merged leads are archived with mergedIntoLeadId", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2"],
      []
    );

    const merged = result.leads.find((l) => l._id === "lead2")!;
    expect(merged.isArchived).toBe(true);
    expect(merged.mergedIntoLeadId).toBe("lead1");
  });

  it("activities are moved from merged leads to primary", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2"],
      []
    );

    const primaryActivities = result.activities.filter(
      (a) => a.leadId === "lead1"
    );
    // lead1 had 1 activity, lead2 had 2 activities, total 3 for primary
    expect(primaryActivities.length).toBe(3);

    // No activities should remain on lead2
    const mergedActivities = result.activities.filter(
      (a) => a.leadId === "lead2"
    );
    expect(mergedActivities.length).toBe(0);
  });

  it("unrelated leads are not affected", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2"],
      []
    );

    const unrelated = result.leads.find((l) => l._id === "lead3")!;
    expect(unrelated.isArchived).toBeFalsy();
    expect(unrelated.mergedIntoLeadId).toBeUndefined();

    const unrelatedActivities = result.activities.filter(
      (a) => a.leadId === "lead3"
    );
    expect(unrelatedActivities.length).toBe(1);
  });

  it("creates a proper audit trail", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2"],
      [
        { field: "fullName", chosenValue: "John Doe", sourceLeadId: "lead1" },
      ]
    );

    expect(result.audit.primaryLeadId).toBe("lead1");
    expect(result.audit.mergedLeadIds).toEqual(["lead2"]);
    expect(result.audit.fieldResolutions.length).toBe(1);
    expect(result.audit.mergedByUserId).toBe("admin1");
    expect(typeof result.audit.mergedAt).toBe("number");
  });

  it("merging multiple leads at once works", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2", "lead3"],
      []
    );

    const primary = result.leads.find((l) => l._id === "lead1")!;
    expect(primary.isArchived).toBeFalsy();

    const merged2 = result.leads.find((l) => l._id === "lead2")!;
    const merged3 = result.leads.find((l) => l._id === "lead3")!;
    expect(merged2.isArchived).toBe(true);
    expect(merged3.isArchived).toBe(true);
    expect(merged2.mergedIntoLeadId).toBe("lead1");
    expect(merged3.mergedIntoLeadId).toBe("lead1");

    // All activities should be on primary now
    const primaryActivities = result.activities.filter(
      (a) => a.leadId === "lead1"
    );
    expect(primaryActivities.length).toBe(4); // all 4 activities
  });

  it("preferredAreas resolution splits by comma", () => {
    const result = mergeLeads(
      testLeads,
      testActivities,
      "lead1",
      ["lead2"],
      [
        {
          field: "preferredAreas",
          chosenValue: "Downtown, Suburbs, Waterfront",
          sourceLeadId: "lead1",
        },
      ]
    );

    const primary = result.leads.find((l) => l._id === "lead1")!;
    expect(primary.preferredAreas).toEqual([
      "Downtown",
      "Suburbs",
      "Waterfront",
    ]);
  });
});
