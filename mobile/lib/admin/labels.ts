/** Labels shared by the admin screens. */
export const AUDIT_CATEGORIES = [
  { value: "", label: "All" },
  { value: "auth", label: "Auth" },
  { value: "user", label: "User" },
  { value: "lead", label: "Lead" },
  { value: "property", label: "Property" },
  { value: "email", label: "Email" },
  { value: "system", label: "System" },
  { value: "stay", label: "SyncStay" },
  { value: "worth", label: "SyncWorth" },
  { value: "other", label: "Other" },
] as const;

export const EMAIL_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "dev_logged", label: "Dev (no API key)" },
] as const;

export const EMAIL_KINDS = [
  { value: "", label: "All kinds" },
  { value: "password_reset", label: "Password reset" },
  { value: "activity_pre_reminder", label: "Activity pre-reminder" },
  { value: "activity_overdue_reminder", label: "Activity overdue" },
  { value: "daily_digest", label: "Daily digest" },
] as const;

export type Scenario = "shared_deal" | "own_property_own_lead" | "company_property";

export const SCENARIO_LABELS: Record<Scenario, string> = {
  shared_deal: "Shared deal",
  own_property_own_lead: "Own property and own lead",
  company_property: "Company property",
};

export const SCENARIO_DESCRIPTIONS: Record<Scenario, string> = {
  shared_deal: "Property shared between two agents. Agent A holds the property, Agent B closes the deal with their lead.",
  own_property_own_lead: "Agent closes a deal using their own property listing and their own lead.",
  company_property: "Agent brings a lead to a company-listed property (no specific property agent).",
};
