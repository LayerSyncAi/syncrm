import { animatedToast } from "@/components/ui/animated-toaster";

// ─────────────────────────────────────────────────────────
// Centralized toast notification config for SynCRM
//
// Uses AnimatedToaster for custom entrance animations per type:
//   - Success: slides in from right with SVG check draw
//   - Error: drops from top with X shake
//   - Info: fades in from center with i pulse
//   - Warning: slides in from right
//
// Each toast has a progress bar that pauses on hover.
// ─────────────────────────────────────────────────────────

// ── Auth ──────────────────────────────────────────────────

export const authToasts = {
  loginFailed: (detail?: string) =>
    animatedToast.error("Sign in failed", {
      description: detail || "Invalid email or password.",
    }),

  signupFailed: (detail?: string) =>
    animatedToast.error("Account creation failed", {
      description: detail || "Could not create account. Please try again.",
    }),

  signupSuccess: () =>
    animatedToast.success("Account created", {
      description: "Welcome to SynCRM! Setting up your workspace...",
    }),

  passwordResetRequested: (email: string) =>
    animatedToast.success("Reset email sent", {
      description: `If an account exists for ${email}, you'll receive instructions shortly.`,
    }),

  passwordResetFailed: (detail?: string) =>
    animatedToast.error("Reset request failed", {
      description: detail || "Something went wrong. Please try again.",
    }),

  passwordResetSuccess: () =>
    animatedToast.success("Password reset successful", {
      description: "You can now sign in with your new password.",
    }),

  passwordResetError: (detail?: string) =>
    animatedToast.error("Password reset failed", {
      description: detail || "Something went wrong. Please try again.",
    }),

  forceChangeSuccess: () =>
    animatedToast.success("Password changed", {
      description: "Your password has been updated. Redirecting...",
    }),

  forceChangeFailed: (detail?: string) =>
    animatedToast.error("Password change failed", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Leads ─────────────────────────────────────────────────

export const leadToasts = {
  created: (name?: string) =>
    animatedToast.success("Lead created", {
      description: name ? `${name} has been added to the pipeline.` : "New lead added to the pipeline.",
    }),

  createFailed: (detail?: string) =>
    animatedToast.error("Failed to create lead", {
      description: detail || "Something went wrong. Please try again.",
    }),

  stageMoved: (stageName: string) =>
    animatedToast.success("Stage updated", {
      description: `Lead moved to "${stageName}".`,
    }),

  stageMoveFailed: (detail?: string) =>
    animatedToast.error("Stage update failed", {
      description: detail || "Could not move lead to new stage.",
    }),

  notesSaved: () =>
    animatedToast.success("Notes saved", {
      description: "Lead notes have been updated.",
    }),

  notesSaveFailed: (detail?: string) =>
    animatedToast.error("Failed to save notes", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Activities ────────────────────────────────────────────

export const activityToasts = {
  created: (title: string) =>
    animatedToast.success("Activity logged", {
      description: `"${title}" has been added to the timeline.`,
    }),

  createFailed: (detail?: string) =>
    animatedToast.error("Failed to log activity", {
      description: detail || "Something went wrong. Please try again.",
    }),

  completed: (title: string) =>
    animatedToast.success("Activity completed", {
      description: `"${title}" has been marked as complete.`,
    }),

  completeFailed: (detail?: string) =>
    animatedToast.error("Failed to complete activity", {
      description: detail || "Something went wrong. Please try again.",
    }),

  reopened: (title: string) =>
    animatedToast.success("Task reopened", {
      description: `"${title}" has been moved back to To Do.`,
    }),

  reopenFailed: (detail?: string) =>
    animatedToast.error("Failed to reopen task", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Contacts ──────────────────────────────────────────────

export const contactToasts = {
  created: (name: string) =>
    animatedToast.success("Contact created", {
      description: `${name} has been added to your contacts.`,
    }),

  updated: (name: string) =>
    animatedToast.success("Contact updated", {
      description: `${name}'s details have been saved.`,
    }),

  saveFailed: (detail?: string) =>
    animatedToast.error("Failed to save contact", {
      description: detail || "Something went wrong. Please try again.",
    }),

  deleted: (name: string) =>
    animatedToast.success("Contact deleted", {
      description: `${name} has been removed.`,
    }),

  deleteFailed: (detail?: string) =>
    animatedToast.error("Failed to delete contact", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Properties ────────────────────────────────────────────

export const propertyToasts = {
  created: (title: string) =>
    animatedToast.success("Property created", {
      description: `"${title}" has been added to the inventory.`,
    }),

  createFailed: (detail?: string) =>
    animatedToast.error("Failed to create property", {
      description: detail || "Something went wrong. Please try again.",
    }),

  updated: (title: string) =>
    animatedToast.success("Property updated", {
      description: `"${title}" details have been saved.`,
    }),

  updateFailed: (detail?: string) =>
    animatedToast.error("Failed to update property", {
      description: detail || "Something went wrong. Please try again.",
    }),

  deleted: (title: string) =>
    animatedToast.success("Property deleted", {
      description: `"${title}" has been removed.`,
    }),

  deleteFailed: (detail?: string) =>
    animatedToast.error("Failed to delete property", {
      description: detail || "Something went wrong. Please try again.",
    }),

  attached: (count: number) =>
    animatedToast.success(
      count === 1 ? "Property attached" : `${count} properties attached`,
      {
        description: "The properties have been linked to this lead.",
      }
    ),

  attachFailed: (detail?: string) =>
    animatedToast.error("Failed to attach property", {
      description: detail || "Something went wrong. Please try again.",
    }),

  detached: () =>
    animatedToast.success("Property removed", {
      description: "The property has been unlinked from this lead.",
    }),

  detachFailed: (detail?: string) =>
    animatedToast.error("Failed to remove property", {
      description: detail || "Something went wrong. Please try again.",
    }),

  suggested: () =>
    animatedToast.success("Property suggested", {
      description: "The property has been suggested for this lead.",
    }),

  suggestFailed: (detail?: string) =>
    animatedToast.error("Failed to suggest property", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Pipeline Stages ───────────────────────────────────────

export const stageToasts = {
  created: (name: string) =>
    animatedToast.success("Stage created", {
      description: `"${name}" has been added to the pipeline.`,
    }),

  updated: (name: string) =>
    animatedToast.success("Stage updated", {
      description: `"${name}" has been saved.`,
    }),

  saveFailed: (detail?: string) =>
    animatedToast.error("Failed to save stage", {
      description: detail || "Something went wrong. Please try again.",
    }),

  deleted: (name: string) =>
    animatedToast.success("Stage deleted", {
      description: `"${name}" has been removed from the pipeline.`,
    }),

  deleteFailed: (detail?: string) =>
    animatedToast.error("Failed to delete stage", {
      description: detail || "Something went wrong. Please try again.",
    }),

  reorderFailed: (detail?: string) =>
    animatedToast.error("Failed to reorder stages", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Lead Scoring ──────────────────────────────────────────

export const scoringToasts = {
  configSaved: () =>
    animatedToast.success("Scoring config saved", {
      description: "Lead scoring criteria have been updated.",
    }),

  configSaveFailed: (detail?: string) =>
    animatedToast.error("Failed to save config", {
      description: detail || "Something went wrong. Please try again.",
    }),

  recomputeStarted: () =>
    animatedToast.info("Recomputing scores...", {
      description: "All lead scores are being recalculated.",
    }),

  recomputeComplete: (count?: number) =>
    animatedToast.success("Scores recomputed", {
      description: count
        ? `${count} lead scores have been updated.`
        : "All lead scores have been updated.",
    }),

  recomputeFailed: (detail?: string) =>
    animatedToast.error("Recompute failed", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Roles ─────────────────────────────────────────────────

export const roleToasts = {
  promoted: (name: string) =>
    animatedToast.success("User promoted", {
      description: `${name} has been promoted to Admin.`,
    }),

  demoted: (name: string) =>
    animatedToast.success("User demoted", {
      description: `${name} has been changed to Agent.`,
    }),

  changeFailed: (detail?: string) =>
    animatedToast.error("Role change failed", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Import / Export / Merge ───────────────────────────────

export const importToasts = {
  started: (rowCount: number) =>
    animatedToast.info("Import started", {
      description: `Importing ${rowCount} rows...`,
    }),

  complete: (created: number, updated: number, skipped: number, failed: number) =>
    animatedToast.success("Import complete", {
      description: `Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
    }),

  failed: (detail?: string) =>
    animatedToast.error("Import failed", {
      description: detail || "Something went wrong during import.",
    }),
};

export const exportToasts = {
  started: (format: string) =>
    animatedToast.info(`Exporting ${format}...`, {
      description: "Your file is being generated.",
    }),

  complete: (format: string, count: number) =>
    animatedToast.success(`${format} exported`, {
      description: `${count} leads have been exported.`,
    }),

  failed: (detail?: string) =>
    animatedToast.error("Export failed", {
      description: detail || "Something went wrong during export.",
    }),
};

export const mergeToasts = {
  complete: () =>
    animatedToast.success("Leads merged", {
      description: "Leads have been merged successfully. Activities and properties moved to primary lead.",
    }),

  failed: (detail?: string) =>
    animatedToast.error("Merge failed", {
      description: detail || "Something went wrong during merge.",
    }),
};

// ── Bulk Matching ─────────────────────────────────────────

export const bulkMatchToasts = {
  attached: (count: number) =>
    animatedToast.success(`${count} properties suggested`, {
      description: "The matched properties have been linked to their leads.",
    }),

  attachFailed: (detail?: string) =>
    animatedToast.error("Bulk suggestion failed", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Documents ─────────────────────────────────────────────

export const documentToasts = {
  uploaded: (name: string) =>
    animatedToast.success("Document uploaded", {
      description: `"${name}" has been uploaded.`,
    }),

  uploadFailed: (detail?: string) =>
    animatedToast.error("Upload failed", {
      description: detail || "Something went wrong. Please try again.",
    }),

  deleted: (name: string) =>
    animatedToast.success("Document deleted", {
      description: `"${name}" has been removed.`,
    }),

  deleteFailed: (detail?: string) =>
    animatedToast.error("Failed to delete document", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Property Sharing ─────────────────────────────────────

export const propertyShareToasts = {
  shared: (propertyTitle: string, agentName: string) =>
    animatedToast.success("Property shared", {
      description: `"${propertyTitle}" has been shared with ${agentName}.`,
    }),

  shareFailed: (detail?: string) =>
    animatedToast.error("Failed to share property", {
      description: detail || "Something went wrong. Please try again.",
    }),

  cancelled: () =>
    animatedToast.success("Share cancelled", {
      description: "The property share has been cancelled.",
    }),

  cancelFailed: (detail?: string) =>
    animatedToast.error("Failed to cancel share", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Commissions ──────────────────────────────────────────

export const commissionToasts = {
  configCreated: (name: string) =>
    animatedToast.success("Commission config created", {
      description: `"${name}" has been added.`,
    }),

  configUpdated: (name: string) =>
    animatedToast.success("Commission config updated", {
      description: `"${name}" has been saved.`,
    }),

  configDeleted: (name: string) =>
    animatedToast.success("Commission config deleted", {
      description: `"${name}" has been removed.`,
    }),

  configSaveFailed: (detail?: string) =>
    animatedToast.error("Failed to save commission config", {
      description: detail || "Something went wrong. Please try again.",
    }),

  configDeleteFailed: (detail?: string) =>
    animatedToast.error("Failed to delete commission config", {
      description: detail || "Something went wrong. Please try again.",
    }),

  statusUpdated: (status: string) =>
    animatedToast.success("Commission status updated", {
      description: `Commission marked as ${status}.`,
    }),

  statusUpdateFailed: (detail?: string) =>
    animatedToast.error("Failed to update commission status", {
      description: detail || "Something went wrong. Please try again.",
    }),
};

// ── Locations ─────────────────────────────────────────────

export const locationToasts = {
  created: (name: string) =>
    animatedToast.success("Location added", {
      description: `"${name}" is now available as a preferred area.`,
    }),

  createFailed: (detail?: string) =>
    animatedToast.error("Failed to add location", {
      description: detail || "Something went wrong. Please try again.",
    }),
};
