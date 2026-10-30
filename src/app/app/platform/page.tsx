"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { Building2, Eye, Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { MODULES, MODULE_ORDER, type ModuleKey } from "@/config/modules";

const formatDate = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

const formatCount = (n: number, cap: number) => (n > cap ? `${cap}+` : String(n));

type OrgRow = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  createdAt: number;
  deletingAt?: number;
  counts: { users: number; leads: number; contacts: number; properties: number };
  countCap: number;
  lastActivityAt: number | null;
  isViewing: boolean;
  enabledModules: ModuleKey[];
};

/**
 * Platform (LayerSync staff) overview: every organisation on this deployment,
 * read-only access into any of them, platform admin management and
 * organisation deletion. Only renders for `isPlatformAdmin` accounts.
 */
export default function PlatformPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  const orgs = useQuery(api.platform.listOrganizations, isPlatformAdmin ? {} : "skip");
  const admins = useQuery(api.platform.listPlatformAdmins, isPlatformAdmin ? {} : "skip");

  const setViewOrg = useMutation(api.platform.setViewOrg);
  const exitViewOrg = useMutation(api.platform.exitViewOrg);
  const grantPlatformAdmin = useAction(api.platform.grantPlatformAdmin);
  const revokePlatformAdmin = useMutation(api.platform.revokePlatformAdmin);
  const purgeOrganization = useMutation(api.platform.purgeOrganization);
  const setOrgModules = useMutation(api.hub.setOrgModules);

  const [search, setSearch] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [modulesTarget, setModulesTarget] = useState<OrgRow | null>(null);
  const [modulesDraft, setModulesDraft] = useState<ModuleKey[]>([]);
  const [isSavingModules, setIsSavingModules] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantName, setGrantName] = useState("");
  const [isGranting, setIsGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ _id: Id<"users">; email: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleSaveModules = async () => {
    if (!modulesTarget) return;
    setIsSavingModules(true);
    try {
      await setOrgModules({ orgId: modulesTarget._id, modules: modulesDraft });
      animatedToast.success(`Modules updated for ${modulesTarget.name}`);
      setModulesTarget(null);
    } catch (err) {
      animatedToast.error("Could not update modules", { description: getErrorMessage(err) });
    } finally {
      setIsSavingModules(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user && !user.isPlatformAdmin) {
      router.replace("/app/hub");
    }
  }, [authLoading, user, router]);

  const filteredOrgs = useMemo(() => {
    if (!orgs) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
  }, [orgs, search]);

  const viewingOrg = orgs?.find((o) => o.isViewing) ?? null;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  if (!user || !user.isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Platform staff only.</p>
      </div>
    );
  }

  const handleOpen = async (org: OrgRow) => {
    setOpeningId(org._id);
    try {
      await setViewOrg({ orgId: org._id });
      router.push("/app/dashboard");
    } catch (error) {
      animatedToast.error("Could not open organisation", { description: getErrorMessage(error) });
      setOpeningId(null);
    }
  };

  const handleExit = async () => {
    try {
      await exitViewOrg();
      animatedToast.success("Left organisation view");
    } catch (error) {
      animatedToast.error("Could not exit organisation view", { description: getErrorMessage(error) });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await purgeOrganization({ orgId: deleteTarget._id, confirmSlug: deleteConfirm.trim() });
      animatedToast.success("Deletion started", {
        description: `"${deleteTarget.name}" and all of its data are being removed in the background.`,
      });
      setDeleteTarget(null);
      setDeleteConfirm("");
    } catch (error) {
      animatedToast.error("Could not delete organisation", { description: getErrorMessage(error) });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGrant = async () => {
    if (!grantEmail.trim()) return;
    setIsGranting(true);
    setGrantResult(null);
    try {
      const result = await grantPlatformAdmin({
        email: grantEmail.trim(),
        fullName: grantName.trim() || undefined,
      });
      if (result.alreadyAdmin) {
        setGrantResult(`${grantEmail.trim()} is already a platform admin.`);
      } else if (result.created) {
        setGrantResult(
          `Account created for ${grantEmail.trim()}. Temporary password: ${result.tempPasswordHint} — they must change it on first sign-in.`
        );
      } else {
        setGrantResult(`${grantEmail.trim()} now has platform access.`);
      }
      animatedToast.success("Platform admin granted");
      setGrantEmail("");
      setGrantName("");
    } catch (error) {
      animatedToast.error("Could not grant platform access", { description: getErrorMessage(error) });
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await revokePlatformAdmin({ userId: revokeTarget._id });
      animatedToast.success("Platform access revoked", { description: revokeTarget.email });
      setRevokeTarget(null);
    } catch (error) {
      animatedToast.error("Could not revoke platform access", { description: getErrorMessage(error) });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text">Platform</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every organisation on this deployment. Open one to inspect it read-only, without a user
            account inside it.
          </p>
        </div>
        {viewingOrg && (
          <div className="flex items-center gap-3 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Eye className="h-4 w-4" />
            <span>
              Viewing <strong>{viewingOrg.name}</strong>
            </span>
            <Button variant="secondary" size="sm" onClick={() => router.push("/app/dashboard")}>
              Go to it
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExit}>
              Exit
            </Button>
          </div>
        )}
      </div>

      {/* Organisations */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="h-4 w-4 text-text-muted" />
              Organisations {orgs ? `(${orgs.length})` : ""}
            </h2>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or slug..."
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrgs === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary-ink" />
            </div>
          ) : filteredOrgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No organisations match.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Modules</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead className="text-right">Properties</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrgs.map((org) => (
                    <TableRow key={org._id} className={org.deletingAt ? "opacity-60" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium text-text">{org.name}</p>
                            <p className="text-xs text-text-muted">{org.slug}</p>
                          </div>
                          {org.deletingAt && <Badge variant="danger">Deleting…</Badge>}
                          {org.isViewing && !org.deletingAt && <Badge variant="warning">Viewing</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          disabled={!!org.deletingAt}
                          onClick={() => {
                            setModulesTarget(org);
                            setModulesDraft(org.enabledModules);
                          }}
                          className="flex max-w-[220px] flex-wrap gap-1 text-left"
                          title="Change modules"
                        >
                          {org.enabledModules.length === 0 ? (
                            <Badge variant="neutral">None</Badge>
                          ) : (
                            org.enabledModules.map((k) => (
                              <Badge key={k} variant="secondary">{MODULES[k].name}</Badge>
                            ))
                          )}
                        </button>
                      </TableCell>
                      <TableCell>{formatDate(org.createdAt)}</TableCell>
                      <TableCell className="text-right">{formatCount(org.counts.users, org.countCap)}</TableCell>
                      <TableCell className="text-right">{formatCount(org.counts.leads, org.countCap)}</TableCell>
                      <TableCell className="text-right">{formatCount(org.counts.contacts, org.countCap)}</TableCell>
                      <TableCell className="text-right">{formatCount(org.counts.properties, org.countCap)}</TableCell>
                      <TableCell>{formatDate(org.lastActivityAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!!org.deletingAt || openingId === org._id}
                            onClick={() => handleOpen(org)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            {openingId === org._id ? "Opening..." : "Open"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!!org.deletingAt || org.isViewing}
                            title={org.isViewing ? "Exit the organisation view first" : "Delete this organisation and all of its data"}
                            onClick={() => {
                              setDeleteTarget(org);
                              setDeleteConfirm("");
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform admins */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-text-muted" />
            Platform admins
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Separate accounts for LayerSync staff. They are not members of any organisation and never
            appear in a client&apos;s user list.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="person@layersync.ai"
                inputMode="email"
              />
            </div>
            <div className="space-y-2">
              <Label>Name (new accounts)</Label>
              <Input value={grantName} onChange={(e) => setGrantName(e.target.value)} placeholder="Full name" />
            </div>
            <Button onClick={handleGrant} disabled={isGranting || !grantEmail.trim()}>
              <UserPlus className="mr-2 h-4 w-4" />
              {isGranting ? "Granting..." : "Grant access"}
            </Button>
          </div>
          {grantResult && (
            <div className="rounded-[10px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {grantResult}
            </div>
          )}
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(admins ?? []).map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      {a.fullName || "—"} {a.isMe && <span className="text-xs text-text-muted">(you)</span>}
                    </TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>
                      <Badge variant={a.isActive ? "success" : "neutral"}>{a.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(a.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {!a.isMe && a.isActive && (
                        <Button size="sm" variant="secondary" onClick={() => setRevokeTarget({ _id: a._id, email: a.email })}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete organisation modal */}
      <Modal
        open={!!deleteTarget}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete organisation"}
        description="This permanently removes the organisation, every user login in it, and all of its leads, contacts, properties, documents, activities and settings. There is no undo."
        onClose={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || !deleteTarget || deleteConfirm.trim() !== deleteTarget.slug}
            >
              {isDeleting ? "Starting..." : "Delete organisation"}
            </Button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              This will delete{" "}
              <strong>
                {formatCount(deleteTarget.counts.users, deleteTarget.countCap)} users,{" "}
                {formatCount(deleteTarget.counts.leads, deleteTarget.countCap)} leads,{" "}
                {formatCount(deleteTarget.counts.contacts, deleteTarget.countCap)} contacts and{" "}
                {formatCount(deleteTarget.counts.properties, deleteTarget.countCap)} properties
              </strong>
              . Nothing is exported first.
            </p>
            <div className="space-y-2">
              <Label>
                Type <code className="rounded bg-surface-2 px-1">{deleteTarget.slug}</code> to confirm
              </Label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={deleteTarget.slug}
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modules modal */}
      <Modal
        open={!!modulesTarget}
        title="Modules"
        description={modulesTarget ? `Choose what ${modulesTarget.name} can open.` : undefined}
        onClose={() => {
          if (!isSavingModules) setModulesTarget(null);
        }}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModulesTarget(null)} disabled={isSavingModules}>
              Cancel
            </Button>
            <Button onClick={handleSaveModules} disabled={isSavingModules}>
              {isSavingModules ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {MODULE_ORDER.map((k) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={modulesDraft.includes(k)}
                onChange={() =>
                  setModulesDraft((prev) => (prev.includes(k) ? prev.filter((m) => m !== k) : [...prev, k]))
                }
                className="h-4 w-4 rounded border-border"
              />
              <span className="font-medium">{MODULES[k].name}</span>
              <span className="text-xs text-text-muted">{MODULES[k].tagline}</span>
            </label>
          ))}
        </div>
      </Modal>

      {/* Revoke modal */}
      <Modal
        open={!!revokeTarget}
        title="Revoke platform access?"
        description={revokeTarget ? `${revokeTarget.email} will lose platform access and be signed out. The account is deactivated.` : undefined}
        onClose={() => {
          if (!isRevoking) setRevokeTarget(null);
        }}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={isRevoking}>
              {isRevoking ? "Revoking..." : "Revoke"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">You can grant access again later by email.</p>
      </Modal>
    </div>
  );
}
