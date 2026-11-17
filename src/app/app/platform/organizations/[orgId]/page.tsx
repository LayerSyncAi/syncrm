"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, Copy, Eye, KeyRound, Loader2, Save } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { animatedToast } from "@/components/ui/animated-toaster";
import { ModuleChecklist } from "@/components/hub/module-checklist";
import { ColorField } from "@/components/branding/color-field";
import { LogoSlot } from "@/components/branding/logo-slot";
import { BrandPreview } from "@/components/platform/onboarding/brand-preview";
import {
  PRIMARY_SUGGESTIONS,
  SIDEBAR_SUGGESTIONS,
  generatePassword,
  logoFileProblem,
  uploadToStorage,
} from "@/components/platform/onboarding/shared";
import { isDarkEnoughForSidebar, isHexColor, SIDEBAR_TOO_LIGHT } from "../../../../../../convex/lib/onboardingRules";
import type { ModuleKey } from "@/config/modules";
import { brand } from "@/config/brand";
import { getErrorMessage } from "@/lib/errors";

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Platform → Edit organisation: name and flags, white label and branding,
 * modules, and a fresh temporary password for any of its admins.
 */
export default function EditOrganizationPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId as Id<"organizations">;
  const { user, isLoading: authLoading } = useAuth();
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  const org = useQuery(api.onboarding.getOrganization, isPlatformAdmin ? { orgId } : "skip");
  const updateOrganization = useMutation(api.onboarding.updateOrganization);
  const generateLogoUploadUrl = useMutation(api.onboarding.generateLogoUploadUrl);
  const setOrgModules = useMutation(api.hub.setOrgModules);
  const setViewOrg = useMutation(api.platform.setViewOrg);
  const resetMemberPassword = useAction(api.onboarding.resetMemberPassword);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ZiG">("USD");
  const [isDemo, setIsDemo] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("");
  const [sidebarColor, setSidebarColor] = useState("");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [saving, setSaving] = useState<null | "details" | "colours" | "modules" | "whiteLabel">(null);
  const [uploading, setUploading] = useState<null | "logo" | "logoOnDark">(null);
  const [opening, setOpening] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ _id: Id<"users">; email: string; fullName: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [issued, setIssued] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const logoInput = useRef<HTMLInputElement>(null);
  const logoOnDarkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && user && !user.isPlatformAdmin) router.replace("/app/hub");
  }, [authLoading, user, router]);

  // Seed the form once, so a reactive update after saving doesn't overwrite typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (!org || seeded.current) return;
    seeded.current = true;
    setName(org.name);
    setCurrency(org.defaultCurrency ?? "USD");
    setIsDemo(org.isDemo);
    setPrimaryColor(org.primaryColor ?? "");
    setSidebarColor(org.sidebarColor ?? "");
    setModules(org.enabledModules);
  }, [org]);

  if (authLoading || org === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }
  if (org === null) {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="text-text-muted">This organisation no longer exists.</p>
        <Link href="/app/platform" className="text-sm text-primary-ink underline">
          Back to Platform
        </Link>
      </div>
    );
  }

  const run = async (key: NonNullable<typeof saving>, fn: () => Promise<unknown>, success: string) => {
    setSaving(key);
    try {
      await fn();
      animatedToast.success(success);
    } catch (err) {
      animatedToast.error("Could not save", { description: getErrorMessage(err) });
    } finally {
      setSaving(null);
    }
  };

  const primaryError = primaryColor && !isHexColor(primaryColor) ? "Use a hex colour such as #1f5fad" : undefined;
  const sidebarError = sidebarColor
    ? !isHexColor(sidebarColor)
      ? "Use a hex colour such as #0f1419"
      : !isDarkEnoughForSidebar(sidebarColor)
        ? SIDEBAR_TOO_LIGHT
        : undefined
    : undefined;

  const uploadLogo = async (which: "logo" | "logoOnDark", file: File | undefined) => {
    if (!file) return;
    const problem = logoFileProblem(file);
    if (problem) {
      animatedToast.error("Can't use that file", { description: problem });
      return;
    }
    setUploading(which);
    try {
      const storageId = (await uploadToStorage(file, () => generateLogoUploadUrl({}))) as Id<"_storage">;
      await updateOrganization({ orgId, [which]: storageId });
      animatedToast.success("Logo updated");
    } catch (err) {
      animatedToast.error("Could not upload the logo", { description: getErrorMessage(err) });
    } finally {
      setUploading(null);
    }
  };

  const issuePassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const result = await resetMemberPassword({ orgId, userId: resetTarget._id, password: resetPassword || undefined });
      setIssued(result);
      setResetTarget(null);
    } catch (err) {
      animatedToast.error("Could not set the password", { description: getErrorMessage(err) });
    } finally {
      setResetting(false);
    }
  };

  const signInUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/platform" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" /> Platform
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-h1 text-text">
            {org.name}
            {org.isDemo && <Badge variant="info">Demo</Badge>}
            {org.whiteLabel && <Badge variant="default">White label</Badge>}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            <span className="font-mono">{org.slug}</span> · created {formatDate(org.createdAt)}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={opening || !!org.deletingAt}
          onClick={async () => {
            setOpening(true);
            try {
              await setViewOrg({ orgId });
              router.push("/app/hub");
            } catch (err) {
              animatedToast.error("Could not open organisation", { description: getErrorMessage(err) });
              setOpening(false);
            }
          }}
        >
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Open organisation
        </Button>
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Details</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="org-name">Organisation name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-currency">Currency</Label>
            <Select id="org-currency" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "ZiG")}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-[10px] border border-border p-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={isDemo}
              onChange={(e) => setIsDemo(e.target.checked)}
            />
            <span className="text-sm text-text">Demo organisation</span>
          </label>
          <div className="sm:col-span-2">
            <Button
              size="sm"
              disabled={saving === "details" || !name.trim()}
              onClick={() =>
                run("details", () => updateOrganization({ orgId, name, isDemo, defaultCurrency: currency }), "Details saved")
              }
            >
              {saving === "details" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Branding</h2>
            <p className="text-sm text-text-muted">
              Also the agency&apos;s brand kit for brochures and PDFs; their admins can change the logo and colour too.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={org.whiteLabel}
                disabled={saving === "whiteLabel"}
                onChange={(e) =>
                  run(
                    "whiteLabel",
                    () => updateOrganization({ orgId, whiteLabel: e.target.checked }),
                    e.target.checked ? "White label on" : "White label off"
                  )
                }
              />
              <span>
                <span className="block text-sm font-medium text-text">White label</span>
                <span className="block text-xs text-text-muted">
                  Their logo, colours and name replace the SyncEstate look for everyone in the organisation. Takes
                  effect immediately.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LogoSlot
                label="Logo"
                hint="For light backgrounds. PNG or SVG, up to 2 MB."
                url={org.logoUrl}
                busy={uploading === "logo"}
                background="#ffffff"
                onPick={() => logoInput.current?.click()}
                onClear={() => run("colours", () => updateOrganization({ orgId, logo: null }), "Logo removed")}
              />
              <LogoSlot
                label="Logo for dark backgrounds"
                hint="A light version for the sidebar."
                url={org.logoOnDarkUrl}
                busy={uploading === "logoOnDark"}
                background={org.sidebarColor || "#0f1419"}
                onPick={() => logoOnDarkInput.current?.click()}
                onClear={() => run("colours", () => updateOrganization({ orgId, logoOnDark: null }), "Logo removed")}
              />
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  uploadLogo("logo", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={logoOnDarkInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  uploadLogo("logoOnDark", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            <ColorField
              id="primary-color"
              label="Primary colour"
              value={primaryColor}
              onChange={setPrimaryColor}
              suggestions={PRIMARY_SUGGESTIONS}
              placeholder={brand.colors.primary}
              error={primaryError}
            />
            <ColorField
              id="sidebar-color"
              label="Sidebar colour"
              hint="Must be dark so the menu text stays readable."
              value={sidebarColor}
              onChange={setSidebarColor}
              suggestions={SIDEBAR_SUGGESTIONS}
              placeholder={brand.colors.sidebar}
              error={sidebarError}
            />
            <Button
              size="sm"
              disabled={saving === "colours" || !!primaryError || !!sidebarError}
              onClick={() =>
                run(
                  "colours",
                  () =>
                    updateOrganization({
                      orgId,
                      primaryColor: primaryColor || null,
                      sidebarColor: sidebarColor || null,
                    }),
                  "Colours saved"
                )
              }
            >
              {saving === "colours" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save colours
            </Button>
          </CardContent>
        </Card>
        <aside className="min-w-0 space-y-2 xl:sticky xl:top-20 xl:self-start">
          <p className="text-xs font-medium uppercase tracking-wide text-text-dim">What they see</p>
          <BrandPreview
            name={name || org.name}
            whiteLabel={org.whiteLabel}
            primary={isHexColor(primaryColor) ? primaryColor : undefined}
            sidebar={isHexColor(sidebarColor) ? sidebarColor : undefined}
            logoUrl={org.logoUrl}
            logoOnDarkUrl={org.logoOnDarkUrl}
          />
        </aside>
      </div>

      {/* Modules */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Modules</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <ModuleChecklist value={modules} onChange={setModules} />
          <Button
            size="sm"
            disabled={saving === "modules" || modules.length === 0}
            onClick={() => run("modules", () => setOrgModules({ orgId, modules }), "Modules updated")}
          >
            {saving === "modules" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save modules
          </Button>
          {modules.length === 0 && <p className="text-xs text-danger">Pick at least one module</p>}
        </CardContent>
      </Card>

      {/* Admin logins */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Admin logins</h2>
          <p className="text-sm text-text-muted">
            If the owner is locked out or never received their details, issue a new temporary password. They must change
            it when they sign in.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {org.admins.length === 0 ? (
            <p className="text-sm text-text-muted">No admins in this organisation.</p>
          ) : (
            org.admins.map((a) => (
              <div key={a._id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border p-3">
                <div className="min-w-0">
                  <p className="font-medium text-text">{a.fullName || a.email}</p>
                  <p className="text-xs text-text-muted">
                    {a.email}
                    {a.mustChangePassword ? " · hasn't set their own password yet" : ""}
                    {!a.isActive ? " · deactivated" : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setResetTarget({ _id: a._id, email: a.email, fullName: a.fullName });
                    setResetPassword(generatePassword());
                  }}
                >
                  <KeyRound className="h-3.5 w-3.5" /> New temporary password
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="New temporary password"
        description={resetTarget ? `For ${resetTarget.fullName || resetTarget.email}. Their current password stops working.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button onClick={issuePassword} disabled={resetting || resetPassword.length < 8}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Set password
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">Temporary password</Label>
          <Input
            id="reset-password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            className="font-mono"
            autoComplete="new-password"
          />
          <p className="text-xs text-text-muted">At least 8 characters.</p>
        </div>
      </Modal>

      <Modal
        open={!!issued}
        onClose={() => setIssued(null)}
        title="Password set"
        description="Share these details with them. They're shown only here."
        footer={<Button onClick={() => setIssued(null)}>Done</Button>}
      >
        {issued && (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2">
              <dt className="text-text-muted">Sign in at</dt>
              <dd className="break-all font-mono">{signInUrl}</dd>
              <dt className="text-text-muted">Email</dt>
              <dd className="break-all font-mono">{issued.email}</dd>
              <dt className="text-text-muted">Temporary password</dt>
              <dd className="font-mono">{issued.tempPassword}</dd>
            </dl>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `Sign in: ${signInUrl}\nEmail: ${issued.email}\nTemporary password: ${issued.tempPassword}`
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  animatedToast.error("Couldn't copy");
                }
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy login details"}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
