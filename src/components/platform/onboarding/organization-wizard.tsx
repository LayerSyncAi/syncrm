"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { generateSlug } from "../../../../convex/platformLib";
import {
  demoOwnerEmail,
  onboardingErrors,
  type OnboardingField,
} from "../../../../convex/lib/onboardingRules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { animatedToast } from "@/components/ui/animated-toaster";
import { ModuleChecklist } from "@/components/hub/module-checklist";
import { ColorField } from "@/components/branding/color-field";
import { LogoSlot } from "@/components/branding/logo-slot";
import { MODULES, MODULE_ORDER, type ModuleKey } from "@/config/modules";
import { brand } from "@/config/brand";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { BrandPreview } from "./brand-preview";
import {
  PRIMARY_SUGGESTIONS,
  SIDEBAR_SUGGESTIONS,
  generatePassword,
  logoFileProblem,
  uploadToStorage,
  useDebounced,
} from "./shared";

type StepKey = "organisation" | "modules" | "branding" | "owner" | "review";

const STEPS: { key: StepKey; label: string; fields: OnboardingField[] }[] = [
  { key: "organisation", label: "Organisation", fields: ["name", "slug"] },
  { key: "modules", label: "Modules", fields: ["modules"] },
  { key: "branding", label: "Branding", fields: ["primaryColor", "sidebarColor"] },
  { key: "owner", label: "Owner", fields: ["ownerFullName", "ownerEmail", "password"] },
  { key: "review", label: "Review", fields: [] },
];

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
} as const;

type PickedLogo = { file: File; previewUrl: string };

interface Draft {
  name: string;
  slug: string;
  slugEdited: boolean;
  currency: "USD" | "ZiG";
  contactEmail: string;
  contactPhone: string;
  isDemo: boolean;
  modules: ModuleKey[];
  whiteLabel: boolean;
  primaryColor: string;
  sidebarColor: string;
  logo: PickedLogo | null;
  logoOnDark: PickedLogo | null;
  ownerFullName: string;
  ownerEmail: string;
  ownerEmailEdited: boolean;
  password: string;
  sendEmail: boolean;
}

function initialDraft(demo: boolean): Draft {
  return {
    name: "",
    slug: "",
    slugEdited: false,
    currency: "USD",
    contactEmail: "",
    contactPhone: "",
    isDemo: demo,
    modules: demo ? [...MODULE_ORDER] : ["crm"],
    whiteLabel: demo,
    primaryColor: "",
    sidebarColor: "",
    logo: null,
    logoOnDark: null,
    ownerFullName: demo ? "Demo Admin" : "",
    ownerEmail: "",
    ownerEmailEdited: false,
    password: generatePassword(),
    sendEmail: false,
  };
}

type Created = {
  orgId: Id<"organizations">;
  orgName: string;
  slug: string;
  ownerEmail: string;
  tempPassword: string;
  emailed: boolean;
};

/**
 * Platform onboarding: a five-step wizard that creates an organisation, its
 * modules, its branding and its first owner login in one go. Nothing is saved
 * (or uploaded) until "Create organisation" on the last step.
 */
export function OrganizationWizard({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(demo));
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState<Set<StepKey>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [showPassword, setShowPassword] = useState(true);
  const [opening, setOpening] = useState(false);

  const logoInput = useRef<HTMLInputElement>(null);
  const logoOnDarkInput = useRef<HTMLInputElement>(null);

  const generateLogoUploadUrl = useMutation(api.onboarding.generateLogoUploadUrl);
  const createOrganization = useAction(api.onboarding.createOrganization);
  const setViewOrg = useMutation(api.platform.setViewOrg);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // The web address follows the name until someone edits it by hand; a demo
  // owner's sign-in follows the web address the same way.
  const setName = (name: string) =>
    setDraft((d) => {
      const slug = d.slugEdited ? d.slug : generateSlug(name);
      return {
        ...d,
        name,
        slug,
        ownerEmail: d.isDemo && !d.ownerEmailEdited ? demoOwnerEmail(slug) : d.ownerEmail,
      };
    });
  const setSlug = (raw: string) =>
    setDraft((d) => {
      const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
      return {
        ...d,
        slug,
        slugEdited: true,
        ownerEmail: d.isDemo && !d.ownerEmailEdited ? demoOwnerEmail(slug) : d.ownerEmail,
      };
    });

  // Release the object URLs behind the logo previews.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const pickLogo = (which: "logo" | "logoOnDark", file: File | undefined) => {
    if (!file) return;
    const problem = logoFileProblem(file);
    if (problem) {
      animatedToast.error("Can't use that file", { description: problem });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    previews.current.push(previewUrl);
    update({ [which]: { file, previewUrl } } as Partial<Draft>);
  };

  // Live availability checks (debounced so typing doesn't hammer the server).
  const debouncedSlug = useDebounced(draft.slug);
  const debouncedEmail = useDebounced(draft.ownerEmail.trim().toLowerCase());
  const availability = useQuery(api.onboarding.checkAvailability, {
    slug: debouncedSlug || undefined,
    email: debouncedEmail || undefined,
  });

  const errors = useMemo(() => {
    const e = onboardingErrors({
      name: draft.name,
      slug: draft.slug,
      modules: draft.modules,
      primaryColor: draft.primaryColor || undefined,
      sidebarColor: draft.sidebarColor || undefined,
      ownerFullName: draft.ownerFullName,
      ownerEmail: draft.ownerEmail,
      password: draft.password,
    });
    if (!e.slug && availability?.slugTaken && debouncedSlug === draft.slug) {
      e.slug = "That web address is already taken";
    }
    if (!e.ownerEmail && availability?.emailProblem && debouncedEmail === draft.ownerEmail.trim().toLowerCase()) {
      e.ownerEmail = availability.emailProblem;
    }
    if (!draft.password) e.password = "Set a temporary password";
    return e;
  }, [draft, availability, debouncedSlug, debouncedEmail]);

  const step = STEPS[stepIndex];
  const stepHasErrors = (s: (typeof STEPS)[number]) => s.fields.some((f) => errors[f]);
  const errorFor = (field: OnboardingField) => (attempted.has(step.key) ? errors[field] : undefined);

  const goNext = () => {
    setAttempted((a) => new Set(a).add(step.key));
    if (stepHasErrors(step)) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const goTo = (index: number) => {
    // Only backwards, or forwards over steps that are already valid.
    if (index > stepIndex && STEPS.slice(stepIndex, index).some(stepHasErrors)) {
      setAttempted((a) => new Set(a).add(step.key));
      return;
    }
    setStepIndex(index);
  };

  const handleCreate = async () => {
    const firstBad = STEPS.findIndex(stepHasErrors);
    if (firstBad !== -1) {
      setAttempted(new Set(STEPS.map((s) => s.key)));
      setStepIndex(firstBad);
      return;
    }
    setSubmitting(true);
    try {
      const getUrl = () => generateLogoUploadUrl({});
      const logoStorageId = draft.logo
        ? ((await uploadToStorage(draft.logo.file, getUrl)) as Id<"_storage">)
        : undefined;
      const logoOnDarkStorageId = draft.logoOnDark
        ? ((await uploadToStorage(draft.logoOnDark.file, getUrl)) as Id<"_storage">)
        : undefined;
      const result = await createOrganization({
        name: draft.name.trim(),
        slug: draft.slug,
        defaultCurrency: draft.currency,
        contactEmail: draft.contactEmail.trim() || undefined,
        contactPhone: draft.contactPhone.trim() || undefined,
        isDemo: draft.isDemo,
        modules: draft.modules,
        whiteLabel: draft.whiteLabel,
        logoStorageId,
        logoOnDarkStorageId,
        primaryColor: draft.primaryColor || undefined,
        sidebarColor: draft.sidebarColor || undefined,
        ownerFullName: draft.ownerFullName.trim(),
        ownerEmail: draft.ownerEmail.trim(),
        password: draft.password,
        sendEmail: draft.sendEmail,
      });
      setCreated(result);
      animatedToast.success(`${result.orgName} is ready`);
    } catch (err) {
      animatedToast.error("Could not create the organisation", { description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <DoneScreen
        created={created}
        opening={opening}
        onOpen={async () => {
          setOpening(true);
          try {
            await setViewOrg({ orgId: created.orgId });
            router.push("/app/hub");
          } catch (err) {
            animatedToast.error("Could not open organisation", { description: getErrorMessage(err) });
            setOpening(false);
          }
        }}
        onBack={() => router.push("/app/platform")}
        onAnother={() => {
          setCreated(null);
          setDraft(initialDraft(demo));
          setStepIndex(0);
          setAttempted(new Set());
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/platform" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" /> Platform
          </Link>
          <h1 className="mt-1 text-h1 text-text">{demo ? "New demo organisation" : "New organisation"}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Set up the agency, its modules and look, and its first login. Nothing is saved until you press Create.
          </p>
        </div>
        {draft.isDemo && (
          <Badge variant="info" className="gap-1">
            <FlaskConical className="h-3.5 w-3.5" /> Demo
          </Badge>
        )}
      </div>

      {/* Step indicator: a compact progress bar on phones, clickable pills from sm up */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-text">{step.label}</span>
          <span className="text-text-muted">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={cn("h-1.5 flex-1 rounded-full", i <= stepIndex ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
      </div>
      <ol className="hidden flex-wrap gap-2 sm:flex" aria-label="Steps">
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const currentStep = i === stepIndex;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={currentStep ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  currentStep
                    ? "border-primary-600 bg-primary-soft font-medium text-primary-ink"
                    : done
                      ? "border-border bg-card-bg text-text hover:bg-surface-2"
                      : "border-border bg-card-bg text-text-muted hover:bg-surface-2"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    currentStep || done ? "bg-primary text-primary-foreground" : "bg-surface-2 text-text-muted"
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step.key} variants={stepVariants} initial="initial" animate="animate" exit="exit">
          {step.key === "organisation" && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Organisation</h2>
                <p className="text-sm text-text-muted">The agency&apos;s name and the basics its reports and invoices use.</p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Organisation name" htmlFor="org-name" error={errorFor("name")} className="sm:col-span-2">
                  <Input
                    id="org-name"
                    autoFocus
                    value={draft.name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Chas Everett"
                    error={!!errorFor("name")}
                  />
                </Field>
                <Field
                  label="Web address (slug)"
                  htmlFor="org-slug"
                  hint="Identifies the organisation on the Platform page."
                  error={errorFor("slug") ?? (availability?.slugTaken && debouncedSlug === draft.slug ? "That web address is already taken" : undefined)}
                >
                  <Input
                    id="org-slug"
                    value={draft.slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="chas-everett"
                    className="font-mono"
                    error={!!errorFor("slug")}
                  />
                </Field>
                <Field label="Currency" htmlFor="org-currency">
                  <Select
                    id="org-currency"
                    value={draft.currency}
                    onChange={(e) => update({ currency: e.target.value as Draft["currency"] })}
                  >
                    <option value="USD">USD</option>
                    <option value="ZiG">ZiG</option>
                  </Select>
                </Field>
                <Field label="Agency email (optional)" htmlFor="org-email">
                  <Input
                    id="org-email"
                    type="email"
                    value={draft.contactEmail}
                    onChange={(e) => update({ contactEmail: e.target.value })}
                    placeholder="info@chaseverett.co.zw"
                  />
                </Field>
                <Field label="Agency phone (optional)" htmlFor="org-phone">
                  <Input
                    id="org-phone"
                    value={draft.contactPhone}
                    onChange={(e) => update({ contactPhone: e.target.value })}
                    placeholder="+263 77 000 0000"
                  />
                </Field>
                <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={draft.isDemo}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        isDemo: e.target.checked,
                        ownerEmail: e.target.checked && !d.ownerEmailEdited ? demoOwnerEmail(d.slug) : d.ownerEmailEdited ? d.ownerEmail : "",
                      }))
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-text">This is a demo organisation</span>
                    <span className="block text-xs text-text-muted">
                      Tagged Demo on the Platform page, for sales demos and testing. Delete it when you&apos;re done.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
          )}

          {step.key === "modules" && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Modules</h2>
                <p className="text-sm text-text-muted">
                  What the agency can use. You can change this any time from the Platform page.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ModuleChecklist value={draft.modules} onChange={(modules) => update({ modules })} />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => update({ modules: [...MODULE_ORDER] })}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => update({ modules: [] })}>
                    Clear
                  </Button>
                </div>
                {errorFor("modules") && <p className="text-xs text-danger">{errorFor("modules")}</p>}
              </CardContent>
            </Card>
          )}

          {step.key === "branding" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold">Branding</h2>
                  <p className="text-sm text-text-muted">
                    Their logo and colours. These also become the agency&apos;s brand kit for SyncMedia brochures and PDFs.
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={draft.whiteLabel}
                      onChange={(e) => update({ whiteLabel: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm font-medium text-text">White label</span>
                      <span className="block text-xs text-text-muted">
                        When ticked, their logo, colours and name replace the SyncEstate look once their people sign in.
                        Untick to keep the normal SyncEstate look.
                      </span>
                    </span>
                  </label>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LogoSlot
                      label="Logo"
                      hint="For light backgrounds. PNG or SVG, up to 2 MB."
                      url={draft.logo?.previewUrl}
                      busy={false}
                      background="#ffffff"
                      onPick={() => logoInput.current?.click()}
                      onClear={() => update({ logo: null })}
                    />
                    <LogoSlot
                      label="Logo for dark backgrounds (optional)"
                      hint="A light version for the sidebar. Without it the logo sits on a white chip."
                      url={draft.logoOnDark?.previewUrl}
                      busy={false}
                      background={draft.sidebarColor || "#0f1419"}
                      onPick={() => logoOnDarkInput.current?.click()}
                      onClear={() => update({ logoOnDark: null })}
                    />
                    <input
                      ref={logoInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        pickLogo("logo", e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <input
                      ref={logoOnDarkInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        pickLogo("logoOnDark", e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <ColorField
                    id="primary-color"
                    label="Primary colour"
                    hint="Buttons, highlights and links. Leave empty to keep SyncEstate green."
                    value={draft.primaryColor}
                    onChange={(primaryColor) => update({ primaryColor })}
                    suggestions={PRIMARY_SUGGESTIONS}
                    placeholder={brand.colors.primary}
                    error={errorFor("primaryColor")}
                  />
                  <ColorField
                    id="sidebar-color"
                    label="Sidebar colour (optional)"
                    hint="Must be dark so the menu text stays readable. Leave empty for SyncEstate's charcoal."
                    value={draft.sidebarColor}
                    onChange={(sidebarColor) => update({ sidebarColor })}
                    suggestions={SIDEBAR_SUGGESTIONS}
                    placeholder={brand.colors.sidebar}
                    error={errorFor("sidebarColor")}
                  />
                </CardContent>
              </Card>
              <aside className="min-w-0 space-y-2 xl:sticky xl:top-20 xl:self-start">
                <p className="text-xs font-medium uppercase tracking-wide text-text-dim">
                  What they&apos;ll see{draft.whiteLabel ? "" : " (SyncEstate look)"}
                </p>
                <BrandPreview
                  name={draft.name}
                  whiteLabel={draft.whiteLabel}
                  primary={draft.primaryColor || undefined}
                  sidebar={draft.sidebarColor || undefined}
                  logoUrl={draft.logo?.previewUrl}
                  logoOnDarkUrl={draft.logoOnDark?.previewUrl}
                />
                {!draft.whiteLabel && (
                  <p className="text-xs text-text-muted">
                    Not white-labelled: the logo and colour are still saved for brochures and PDFs.
                  </p>
                )}
              </aside>
            </div>
          )}

          {step.key === "owner" && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Owner login</h2>
                <p className="text-sm text-text-muted">
                  The first admin of the organisation. They sign in on the normal sign-in page and must choose their own
                  password straight away. They can then add the rest of their team.
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="owner-name" error={errorFor("ownerFullName")}>
                  <Input
                    id="owner-name"
                    value={draft.ownerFullName}
                    onChange={(e) => update({ ownerFullName: e.target.value })}
                    placeholder="Tendai Moyo"
                    error={!!errorFor("ownerFullName")}
                  />
                </Field>
                <Field
                  label="Email (their sign-in)"
                  htmlFor="owner-email"
                  hint={draft.isDemo ? "Demo logins don't need a real mailbox." : undefined}
                  error={
                    errorFor("ownerEmail") ??
                    (availability?.emailProblem && debouncedEmail === draft.ownerEmail.trim().toLowerCase()
                      ? availability.emailProblem
                      : undefined)
                  }
                >
                  <Input
                    id="owner-email"
                    type="email"
                    value={draft.ownerEmail}
                    onChange={(e) => update({ ownerEmail: e.target.value, ownerEmailEdited: true })}
                    placeholder="tendai@chaseverett.co.zw"
                    error={!!errorFor("ownerEmail")}
                  />
                </Field>
                <Field
                  label="Temporary password"
                  htmlFor="owner-password"
                  hint="At least 8 characters. Shown again after creating, so you can share it."
                  error={errorFor("password")}
                  className="sm:col-span-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative max-w-xs flex-1">
                      <Input
                        id="owner-password"
                        type={showPassword ? "text" : "password"}
                        value={draft.password}
                        onChange={(e) => update({ password: e.target.value })}
                        className="pr-10 font-mono"
                        autoComplete="new-password"
                        error={!!errorFor("password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => update({ password: generatePassword() })}>
                      <RefreshCw className="h-3.5 w-3.5" /> Generate
                    </Button>
                  </div>
                </Field>
                <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border p-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={draft.sendEmail}
                    onChange={(e) => update({ sendEmail: e.target.checked })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-text">Email these login details to the owner</span>
                    <span className="block text-xs text-text-muted">
                      Sends the sign-in link, email and temporary password. Leave unticked to share them yourself.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
          )}

          {step.key === "review" && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Review</h2>
                <p className="text-sm text-text-muted">Check everything, then create the organisation.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReviewRow title="Organisation" onEdit={() => setStepIndex(0)}>
                  <p className="font-medium text-text">
                    {draft.name} {draft.isDemo && <Badge variant="info">Demo</Badge>}
                  </p>
                  <p className="break-all font-mono text-xs text-text-muted">{draft.slug}</p>
                  <p className="text-xs text-text-muted">
                    {draft.currency}
                    {draft.contactEmail ? ` · ${draft.contactEmail}` : ""}
                    {draft.contactPhone ? ` · ${draft.contactPhone}` : ""}
                  </p>
                </ReviewRow>
                <ReviewRow title="Modules" onEdit={() => setStepIndex(1)}>
                  <div className="flex flex-wrap gap-1">
                    {draft.modules.map((k) => (
                      <Badge key={k} variant="secondary">{MODULES[k].name}</Badge>
                    ))}
                  </div>
                </ReviewRow>
                <ReviewRow title="Branding" onEdit={() => setStepIndex(2)}>
                  <p className="text-sm text-text">
                    {draft.whiteLabel ? "White label: their logo and colours in the app" : "SyncEstate look in the app"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                    <Swatch label="Primary" value={draft.primaryColor} />
                    <Swatch label="Sidebar" value={draft.sidebarColor} />
                    <span>{draft.logo ? "Logo added" : "No logo"}{draft.logoOnDark ? " · dark-background logo added" : ""}</span>
                  </div>
                </ReviewRow>
                <ReviewRow title="Owner" onEdit={() => setStepIndex(3)}>
                  <p className="font-medium text-text">{draft.ownerFullName}</p>
                  <p className="break-all text-xs text-text-muted">{draft.ownerEmail}</p>
                  <p className="text-xs text-text-muted">
                    Temporary password set{draft.sendEmail ? " · emailed to them" : " · you'll share it"}
                  </p>
                </ReviewRow>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => (stepIndex === 0 ? router.push("/app/platform") : setStepIndex(stepIndex - 1))}>
          <ArrowLeft className="h-4 w-4" /> {stepIndex === 0 ? "Cancel" : "Back"}
        </Button>
        {step.key === "review" ? (
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {submitting ? "Creating…" : "Create organisation"}
          </Button>
        ) : (
          <Button onClick={goNext}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function ReviewRow({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[10px] border border-border p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-dim">{title}</p>
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

function Swatch({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-3.5 w-3.5 rounded-full border border-border"
        style={{ backgroundColor: value || "transparent" }}
      />
      {label}: {value || "default"}
    </span>
  );
}

function DoneScreen({
  created,
  opening,
  onOpen,
  onBack,
  onAnother,
}: {
  created: Created;
  opening: boolean;
  onOpen: () => void;
  onBack: () => void;
  onAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const signInUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const details = `Sign in: ${signInUrl}\nEmail: ${created.ownerEmail}\nTemporary password: ${created.tempPassword}\n\nYou'll be asked to choose your own password when you first sign in.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      animatedToast.error("Couldn't copy", { description: "Select the details and copy them by hand." });
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h1 className="mt-3 text-h1 text-text">{created.orgName} is ready</h1>
        <p className="mt-1 text-sm text-text-muted">
          {created.emailed
            ? "The login details were emailed to the owner. They're below too."
            : "Share these login details with the owner. They're shown only here."}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2">
            <dt className="text-text-muted">Sign in at</dt>
            <dd className="break-all font-mono">{signInUrl}</dd>
            <dt className="text-text-muted">Email</dt>
            <dd className="break-all font-mono">{created.ownerEmail}</dd>
            <dt className="text-text-muted">Temporary password</dt>
            <dd className="font-mono">{created.tempPassword}</dd>
          </dl>
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy login details"}
          </Button>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onOpen} disabled={opening}>
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Open organisation
        </Button>
        <Button variant="secondary" onClick={onAnother}>
          Create another
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back to Platform
        </Button>
      </div>
    </div>
  );
}
