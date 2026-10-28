/**
 * Sync Worth access rules (BRD Worth §3), enforced on the server:
 *  - director (org admin, not in Agent Mode): everything except issuing,
 *    which the BRD reserves for a registered signing valuer.
 *  - signing valuer: all jobs; reviews, approves or returns, issues.
 *  - valuer: jobs assigned to them; the full archive and comparables for
 *    research. Cannot issue.
 *  - valuations admin: logs instructions, assigns jobs, sends issued
 *    reports. Sees values, cannot change them.
 *  - accounts: fees and invoice status only, never values.
 * A person can hold several roles; capabilities are the union.
 */
import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { requireModuleUser } from "../lib/moduleAccess";
import type { EstateRole } from "../lib/modules";

type RoleHolder = {
  _id?: string;
  role: "admin" | "agent";
  agentMode?: boolean | null;
  estateRoles?: readonly EstateRole[] | null;
};

export type WorthCaps = {
  isDirector: boolean;
  /** Holds valuer, signing valuer or valuations admin. */
  isValuationStaff: boolean;
  /** Every job in the org, not just assigned ones. */
  seesAllJobs: boolean;
  seesValues: boolean;
  /** Archive and comparables. */
  seesEvidence: boolean;
  /** Log instructions, assign, hold, cancel, edit instruction details. */
  canManageJobs: boolean;
  /** Inspect, value and write up any job (not only assigned ones). */
  canWorkAnyJob: boolean;
  /** Inspect, value and write up jobs assigned to them. */
  canWorkAssigned: boolean;
  canReview: boolean;
  canIssue: boolean;
  canSendReports: boolean;
  /** Raise invoices and mark fees paid. */
  canManageFees: boolean;
  /** Change the agreed fee on a job. */
  canEditFee: boolean;
  /** Edit comparables and import spreadsheets. */
  canEditEvidence: boolean;
  /** Report wording, hold-until-paid and every valuer's profile. */
  canAdmin: boolean;
};

/** Pure capability union for a user's roles. */
export function worthCapabilities(user: RoleHolder): WorthCaps {
  const has = (r: EstateRole) => !!user.estateRoles?.includes(r);
  // Agent Mode narrows an admin to their own work, as everywhere else.
  const isDirector = user.role === "admin" && !user.agentMode;
  const valuer = has("valuer");
  const signing = has("signing_valuer");
  const vadmin = has("valuations_admin");
  const accounts = has("accounts");
  const isValuationStaff = valuer || signing || vadmin;
  return {
    isDirector,
    isValuationStaff,
    seesAllJobs: isDirector || signing || vadmin || accounts,
    seesValues: isDirector || valuer || signing || vadmin,
    seesEvidence: isDirector || valuer || signing || vadmin,
    canManageJobs: isDirector || signing || vadmin,
    canWorkAnyJob: isDirector || signing,
    canWorkAssigned: isDirector || signing || valuer,
    canReview: isDirector || signing,
    canIssue: signing,
    canSendReports: isDirector || signing || vadmin,
    canManageFees: isDirector || accounts,
    canEditFee: isDirector || vadmin || accounts,
    canEditEvidence: isDirector || valuer || signing,
    canAdmin: isDirector,
  };
}

type JobLike = Pick<Doc<"worthJobs">, "orgId" | "assignedValuerId" | "status">;

/** Whether the caller may open a job at all (pure). */
export function canSeeJobPure(caps: WorthCaps, userId: string, orgId: string, job: JobLike | null): boolean {
  if (!job || job.orgId !== orgId) return false;
  if (caps.seesAllJobs) return true;
  if (job.assignedValuerId === userId) return true;
  // Valuers research the full archive of issued work.
  return caps.seesEvidence && job.status === "issued";
}

/** Whether the caller may change the inspection, values and narrative (pure). */
export function canWorkJobPure(caps: WorthCaps, userId: string, job: JobLike): boolean {
  if (caps.canWorkAnyJob) return true;
  return caps.canWorkAssigned && job.assignedValuerId === userId;
}

export type WorthAccess = Awaited<ReturnType<typeof requireWorth>>;

export async function requireWorth(ctx: QueryCtx | MutationCtx) {
  const { user, org } = await requireModuleUser(ctx, "worth");
  return { user, org, orgId: user.orgId, caps: worthCapabilities(user) };
}

export function canSeeJob(access: WorthAccess, job: JobLike | null): boolean {
  return canSeeJobPure(access.caps, access.user._id, access.orgId, job);
}

/** Load a job the caller may see, or throw. */
export async function getVisibleJob(
  ctx: QueryCtx | MutationCtx,
  access: WorthAccess,
  id: Id<"worthJobs">
): Promise<Doc<"worthJobs">> {
  const job = await ctx.db.get(id);
  if (!job || !canSeeJob(access, job)) throw new ConvexError("Job not found");
  return job;
}

export function requireCap(access: WorthAccess, cap: keyof WorthCaps, message: string) {
  if (!access.caps[cap]) throw new ConvexError(message);
}

export function requireWorker(access: WorthAccess, job: JobLike) {
  if (!canWorkJobPure(access.caps, access.user._id, job)) {
    throw new ConvexError("Only the assigned valuer or a signing valuer can change this job");
  }
}

export function displayName(u: Pick<Doc<"users">, "fullName" | "name" | "email"> | null | undefined): string {
  return u?.fullName || u?.name || u?.email || "Unknown";
}
