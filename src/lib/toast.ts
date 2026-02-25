import { toast, ExternalToast } from "sonner";

// ─────────────────────────────────────────────────────────
// Centralized toast notification config for SynCRM
//
// HOW TO CUSTOMIZE:
//
// 1. Change text: Edit the `message` or `description` for any toast below.
//
// 2. Change styling (e.g., red background for errors):
//    Add a `style` property to the options object:
//      style: { background: "#fee2e2", borderColor: "#fca5a5" }
//
// 3. Change duration: Add `duration: 5000` (in ms) to any toast options.
//
// 4. Change position per-toast: Add `position: "bottom-center"` etc.
//
// 5. Add custom class names: Add `className: "my-custom-class"` to options.
//
// Each section below groups toasts by feature area.
// ─────────────────────────────────────────────────────────

// ── Shared option presets ─────────────────────────────────
// Reuse these in any toast call to keep styling consistent.
// Edit these to globally change the look of success/error/info toasts.

export const successStyle: ExternalToast = {
  style: { background: "#f0fdf4", borderColor: "#86efac", color: "#166534"},
};

export const errorStyle: ExternalToast = {
    style: { background: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b" },
};

export const infoStyle: ExternalToast = {
  style: { background: "#ecfeff", borderColor: "#67e8f9", color: "#155e75" },
};

export const warningStyle: ExternalToast = {
    style: { background: "#fffbeb", borderColor: "#fbbf24", color: "#92400e" },
};

export const loadingStyle: ExternalToast = {
  style: { background: "#eef2ff", borderColor: "#818cf8", color: "#3730a3" },
};

// ── Auth ──────────────────────────────────────────────────

export const authToasts = {
  loginFailed: (detail?: string) =>
    toast.error("Sign in failed", {
      description: detail || "Invalid email or password.",
      ...errorStyle,
    }),

  signupFailed: (detail?: string) =>
    toast.error("Account creation failed", {
      description: detail || "Could not create account. Please try again.",
      ...errorStyle,
    }),

  signupSuccess: () =>
    toast.success("Account created", {
      description: "Welcome to SynCRM! Setting up your workspace...",
      ...successStyle,
    }),

  passwordResetRequested: (email: string) =>
    toast.success("Reset email sent", {
      description: `If an account exists for ${email}, you'll receive instructions shortly.`,
      ...successStyle,
    }),

  passwordResetFailed: (detail?: string) =>
    toast.error("Reset request failed", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  passwordResetSuccess: () =>
    toast.success("Password reset successful", {
      description: "You can now sign in with your new password.",
      ...successStyle,
    }),

  passwordResetError: (detail?: string) =>
    toast.error("Password reset failed", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  forceChangeSuccess: () =>
    toast.success("Password changed", {
      description: "Your password has been updated. Redirecting...",
      ...successStyle,
    }),

  forceChangeFailed: (detail?: string) =>
    toast.error("Password change failed", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Leads ─────────────────────────────────────────────────

export const leadToasts = {
  created: (name?: string) =>
    toast.success("Lead created", {
      description: name ? `${name} has been added to the pipeline.` : "New lead added to the pipeline.",
      ...successStyle,
    }),

  createFailed: (detail?: string) =>
    toast.error("Failed to create lead", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  stageMoved: (stageName: string) =>
    toast.success("Stage updated", {
      description: `Lead moved to "${stageName}".`,
      ...successStyle,
    }),

  stageMoveFailed: (detail?: string) =>
    toast.error("Stage update failed", {
      description: detail || "Could not move lead to new stage.",
      ...errorStyle,
    }),

  notesSaved: () =>
    toast.success("Notes saved", {
      description: "Lead notes have been updated.",
      ...successStyle,
    }),

  notesSaveFailed: (detail?: string) =>
    toast.error("Failed to save notes", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Activities ────────────────────────────────────────────

export const activityToasts = {
  created: (title: string) =>
    toast.success("Activity logged", {
      description: `"${title}" has been added to the timeline.`,
      ...successStyle,
    }),

  createFailed: (detail?: string) =>
    toast.error("Failed to log activity", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  completed: (title: string) =>
    toast.success("Activity completed", {
      description: `"${title}" has been marked as complete.`,
      ...successStyle,
    }),

  completeFailed: (detail?: string) =>
    toast.error("Failed to complete activity", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  reopened: (title: string) =>
    toast.success("Task reopened", {
      description: `"${title}" has been moved back to To Do.`,
      ...successStyle,
    }),

  reopenFailed: (detail?: string) =>
    toast.error("Failed to reopen task", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Contacts ──────────────────────────────────────────────

export const contactToasts = {
  created: (name: string) =>
    toast.success("Contact created", {
      description: `${name} has been added to your contacts.`,
      ...successStyle,
    }),

  updated: (name: string) =>
    toast.success("Contact updated", {
      description: `${name}'s details have been saved.`,
      ...successStyle,
    }),

  saveFailed: (detail?: string) =>
    toast.error("Failed to save contact", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  deleted: (name: string) =>
    toast.success("Contact deleted", {
      description: `${name} has been removed.`,
      ...successStyle,
    }),

  deleteFailed: (detail?: string) =>
    toast.error("Failed to delete contact", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Properties ────────────────────────────────────────────

export const propertyToasts = {
  created: (title: string) =>
    toast.success("Property created", {
      description: `"${title}" has been added to the inventory.`,
      ...successStyle,
    }),

  createFailed: (detail?: string) =>
    toast.error("Failed to create property", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  updated: (title: string) =>
    toast.success("Property updated", {
      description: `"${title}" details have been saved.`,
      ...successStyle,
    }),

  updateFailed: (detail?: string) =>
    toast.error("Failed to update property", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  deleted: (title: string) =>
    toast.success("Property deleted", {
      description: `"${title}" has been removed.`,
      ...successStyle,
    }),

  deleteFailed: (detail?: string) =>
    toast.error("Failed to delete property", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  attached: (count: number) =>
    toast.success(
      count === 1 ? "Property attached" : `${count} properties attached`,
      {
        description: "The properties have been linked to this lead.",
        ...successStyle,
      }
    ),

  attachFailed: (detail?: string) =>
    toast.error("Failed to attach property", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  detached: () =>
    toast.success("Property removed", {
      description: "The property has been unlinked from this lead.",
      ...successStyle,
    }),

  detachFailed: (detail?: string) =>
    toast.error("Failed to remove property", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  suggested: () =>
    toast.success("Property suggested", {
      description: "The property has been suggested for this lead.",
      ...successStyle,
    }),

  suggestFailed: (detail?: string) =>
    toast.error("Failed to suggest property", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Pipeline Stages ───────────────────────────────────────

export const stageToasts = {
  created: (name: string) =>
    toast.success("Stage created", {
      description: `"${name}" has been added to the pipeline.`,
      ...successStyle,
    }),

  updated: (name: string) =>
    toast.success("Stage updated", {
      description: `"${name}" has been saved.`,
      ...successStyle,
    }),

  saveFailed: (detail?: string) =>
    toast.error("Failed to save stage", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  deleted: (name: string) =>
    toast.success("Stage deleted", {
      description: `"${name}" has been removed from the pipeline.`,
      ...successStyle,
    }),

  deleteFailed: (detail?: string) =>
    toast.error("Failed to delete stage", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  reorderFailed: (detail?: string) =>
    toast.error("Failed to reorder stages", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Lead Scoring ──────────────────────────────────────────

export const scoringToasts = {
  configSaved: () =>
    toast.success("Scoring config saved", {
      description: "Lead scoring criteria have been updated.",
      ...successStyle,
    }),

  configSaveFailed: (detail?: string) =>
    toast.error("Failed to save config", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),

  recomputeStarted: () =>
    toast.info("Recomputing scores...", {
      description: "All lead scores are being recalculated.",
      ...infoStyle,
    }),

  recomputeComplete: (count?: number) =>
    toast.success("Scores recomputed", {
      description: count
        ? `${count} lead scores have been updated.`
        : "All lead scores have been updated.",
      ...successStyle,
    }),

  recomputeFailed: (detail?: string) =>
    toast.error("Recompute failed", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Roles ─────────────────────────────────────────────────

export const roleToasts = {
  promoted: (name: string) =>
    toast.success("User promoted", {
      description: `${name} has been promoted to Admin.`,
      ...successStyle,
    }),

  demoted: (name: string) =>
    toast.success("User demoted", {
      description: `${name} has been changed to Agent.`,
      ...successStyle,
    }),

  changeFailed: (detail?: string) =>
    toast.error("Role change failed", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Import / Export / Merge ───────────────────────────────

export const importToasts = {
  started: (rowCount: number) =>
    toast.info("Import started", {
      description: `Importing ${rowCount} rows...`,
      ...loadingStyle,
    }),

  complete: (created: number, updated: number, skipped: number, failed: number) =>
    toast.success("Import complete", {
      description: `Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
      ...successStyle,
    }),

  failed: (detail?: string) =>
    toast.error("Import failed", {
      description: detail || "Something went wrong during import.",
      ...errorStyle,
    }),
};

export const exportToasts = {
  started: (format: string) =>
    toast.info(`Exporting ${format}...`, {
      description: "Your file is being generated.",
      ...loadingStyle,
    }),

  complete: (format: string, count: number) =>
    toast.success(`${format} exported`, {
      description: `${count} leads have been exported.`,
      ...successStyle,
    }),

  failed: (detail?: string) =>
    toast.error("Export failed", {
      description: detail || "Something went wrong during export.",
      ...errorStyle,
    }),
};

export const mergeToasts = {
  complete: () =>
    toast.success("Leads merged", {
      description: "Leads have been merged successfully. Activities and properties moved to primary lead.",
      ...successStyle,
    }),

  failed: (detail?: string) =>
    toast.error("Merge failed", {
      description: detail || "Something went wrong during merge.",
      ...errorStyle,
    }),
};

// ── Bulk Matching ─────────────────────────────────────────

export const bulkMatchToasts = {
  attached: (count: number) =>
    toast.success(`${count} properties suggested`, {
      description: "The matched properties have been linked to their leads.",
      ...successStyle,
    }),

  attachFailed: (detail?: string) =>
    toast.error("Bulk suggestion failed", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};

// ── Locations ─────────────────────────────────────────────

export const locationToasts = {
  created: (name: string) =>
    toast.success("Location added", {
      description: `"${name}" is now available as a preferred area.`,
      ...successStyle,
    }),

  createFailed: (detail?: string) =>
    toast.error("Failed to add location", {
      description: detail || "Something went wrong. Please try again.",
      ...errorStyle,
    }),
};
