// Pure, dependency-free access-control logic for property ownership and
// document/mandate privacy. Kept free of Convex ctx so it can be unit-tested
// directly (see src/__tests__/property-access.test.ts). The thin wrappers in
// helpers.ts add the database lookups (collaborator check) around these.

export type OwnershipType = "agent" | "multiple" | "company";

export interface OwnershipInput {
  ownershipType?: OwnershipType;
  ownerUserIds?: string[];
  createdByUserId?: string;
  orgId?: string;
}

export interface AccessUser {
  _id: string;
  role: "admin" | "agent";
  orgId?: string;
}

/**
 * Normalise a list of owner ids into a canonical ownership shape:
 *   []      -> company  (no individual agent owner)
 *   [a]     -> agent
 *   [a,b..] -> multiple (de-duplicated, order preserved)
 */
export function normalizeOwnership(ownerUserIds?: string[]): {
  ownershipType: OwnershipType;
  ownerUserIds: string[];
} {
  const unique = Array.from(new Set(ownerUserIds ?? []));
  if (unique.length === 0) return { ownershipType: "company", ownerUserIds: [] };
  if (unique.length === 1) return { ownershipType: "agent", ownerUserIds: unique };
  return { ownershipType: "multiple", ownerUserIds: unique };
}

/**
 * Resolve a single listing's ownership during bulk import: use its own
 * per-row assignment when present (even an empty array => company), otherwise
 * fall back to the batch default. Then normalise into an ownership shape.
 */
export function resolveListingOwnership(
  assignment: string[] | undefined,
  batchDefault: string[]
): { ownershipType: OwnershipType; ownerUserIds: string[] } {
  return normalizeOwnership(assignment ?? batchDefault);
}

/** True when the property has no ownership metadata yet (pre-migration). */
export function isUnmigrated(property: OwnershipInput): boolean {
  return (
    !property.ownershipType &&
    (property.ownerUserIds === undefined || property.ownerUserIds.length === 0)
  );
}

/** True when the user's org differs from the property's org (and both are set). */
function crossesOrg(property: OwnershipInput, user: AccessUser): boolean {
  return (
    !!property.orgId && !!user.orgId && property.orgId !== user.orgId
  );
}

/**
 * Can the user manage the property (edit, reassign ownership, manage
 * collaborators)? Admins and owners qualify; collaborators do not. This is a
 * pure decision — no collaborator lookup is needed.
 */
export function canManagePropertyPure(
  property: OwnershipInput | null,
  user: AccessUser
): boolean {
  if (!property) return false;
  if (crossesOrg(property, user)) return false;
  if (user.role === "admin") return true;
  if ((property.ownerUserIds ?? []).some((id) => id === user._id)) return true;
  if (isUnmigrated(property) && property.createdByUserId === user._id) return true;
  return false;
}

/**
 * Can the user see the property's PRIVATE data (documents, mandate info,
 * collaborator list)? `isCollaborator` is the result of the DB lookup the
 * caller performs; passing it in keeps this function pure.
 */
export function canAccessPropertyPrivatePure(
  property: OwnershipInput | null,
  user: AccessUser,
  isCollaborator: boolean
): boolean {
  if (!property) return false;
  if (crossesOrg(property, user)) return false;
  if (user.role === "admin") return true;
  if ((property.ownerUserIds ?? []).some((id) => id === user._id)) return true;
  if (isUnmigrated(property) && property.createdByUserId === user._id) return true;
  return isCollaborator;
}
