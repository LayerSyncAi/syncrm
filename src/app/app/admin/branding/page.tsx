"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ImagePlus, Loader2, Palette, Trash2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrochureStage } from "@/components/syncmedia/BrochureStage";
import {
  ACCENT_SUGGESTIONS,
  PAGE_STYLES,
  PAPER,
  resolveBrandKit,
} from "@/lib/syncmedia/theme";
import { EMPTY_DOC, type BrochureDoc, type PageStyle } from "@/lib/syncmedia/types";
import { syncMediaToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-f]{6}$/i;

/** Stand-in brochure so the admin judges the palette on the real thing. */
const PREVIEW_DOC: BrochureDoc = {
  ...EMPTY_DOC,
  templateId: "housestyle",
  title: "Four Bedroom Cluster",
  location: "Borrowdale, Harare",
  price: "$285,000",
  eyebrow: "FOR SALE",
  features: ["4 Bedrooms", "3 Bathrooms", "Double garage", "Borehole"],
  agentName: "Tendai Moyo",
  agentPhone: "+263 775 920 436",
  reference: "REF1564",
};

export default function BrandingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const branding = useQuery(api.branding.get, {});
  const saveBranding = useMutation(api.branding.save);
  const clearLogo = useMutation(api.branding.clearLogo);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [accent, setAccent] = React.useState("");
  const [pageStyle, setPageStyle] = React.useState<PageStyle>("cream");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState<null | "logo" | "logoOnDark">(null);

  const logoInput = React.useRef<HTMLInputElement>(null);
  const logoOnDarkInput = React.useRef<HTMLInputElement>(null);

  // Redirect non-admin users.
  React.useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  // Seed the form once the row lands. Keyed on the query result rather than
  // running on every render so an admin's half-typed accent isn't overwritten
  // by a reactive update from their own save.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!branding || seeded.current) return;
    seeded.current = true;
    const kit = resolveBrandKit(branding);
    setAccent(kit.accent);
    setPageStyle(kit.pageStyle);
    setContactPhone(kit.contactPhone);
    setContactEmail(kit.contactEmail);
    setWebsite(kit.website);
  }, [branding]);

  // The preview tracks the form, not the saved row, so the admin sees the
  // result of a colour before committing to it.
  const previewBrand = React.useMemo(
    () =>
      resolveBrandKit({
        ...branding,
        accent: HEX.test(accent) ? accent : undefined,
        pageStyle,
      }),
    [branding, accent, pageStyle]
  );

  async function uploadLogo(
    which: "logo" | "logoOnDark",
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      syncMediaToasts.brandingSaveFailed("That file is not an image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      syncMediaToasts.brandingSaveFailed("Logos must be 2 MB or smaller.");
      return;
    }

    setUploading(which);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = await response.json();
      // Store the storage id rather than a resolved URL, so the blob stays
      // deletable when the logo is later replaced.
      await saveBranding(
        which === "logo"
          ? { logoRef: storageId as string }
          : { logoOnDarkRef: storageId as string }
      );
      syncMediaToasts.brandingSaved();
    } catch (error) {
      syncMediaToasts.brandingSaveFailed(
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setUploading(null);
    }
  }

  async function handleSave() {
    if (!HEX.test(accent)) {
      syncMediaToasts.brandingSaveFailed("Accent must be a hex colour like #2a5925.");
      return;
    }
    setSaving(true);
    try {
      await saveBranding({
        accent,
        pageStyle,
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        website: website.trim(),
      });
      syncMediaToasts.brandingSaved();
    } catch (error) {
      syncMediaToasts.brandingSaveFailed(
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClearLogo(which: "logo" | "logoOnDark") {
    try {
      await clearLogo({ which });
      syncMediaToasts.brandingSaved();
    } catch (error) {
      syncMediaToasts.brandingSaveFailed(
        error instanceof Error ? error.message : undefined
      );
    }
  }

  if (authLoading || branding === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Branding" }]} />

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-text">
          <Palette className="h-5 w-5 text-primary-ink" /> Brand kit
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          The logo and colours every SyncMedia brochure is built from. Changing these
          affects new brochures across the organisation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Logos */}
          <section className="space-y-4 rounded-[12px] border border-border bg-card-bg p-4">
            <div>
              <h2 className="text-sm font-semibold text-text">Logo</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                PNG or SVG, up to 2 MB. Transparent backgrounds work best. Without one,
                brochures sign themselves with your organisation name.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <LogoSlot
                label="Main logo"
                hint="Used on light panels."
                url={branding.logoUrl}
                busy={uploading === "logo"}
                background="var(--surface-2)"
                onPick={() => logoInput.current?.click()}
                onClear={() => handleClearLogo("logo")}
              />
              <LogoSlot
                label="Light-on-dark variant"
                hint="Optional. Used where the logo sits on your accent colour."
                url={branding.logoOnDarkUrl}
                busy={uploading === "logoOnDark"}
                background={previewBrand.accent}
                onPick={() => logoOnDarkInput.current?.click()}
                onClear={() => handleClearLogo("logoOnDark")}
              />
            </div>

            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => uploadLogo("logo", e)}
            />
            <input
              ref={logoOnDarkInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => uploadLogo("logoOnDark", e)}
            />
          </section>

          {/* Colour */}
          <section className="space-y-4 rounded-[12px] border border-border bg-card-bg p-4">
            <div>
              <h2 className="text-sm font-semibold text-text">Colour</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                Pick an accent and a paper. Everything else on the brochure — text
                colours, tints, rules — is derived from these two so the type always
                stays readable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent">Accent colour</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent colour picker"
                  value={HEX.test(accent) ? accent : "#000000"}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-[10px] border border-border-strong bg-transparent p-1"
                />
                <Input
                  id="accent"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  placeholder="#2a5925"
                  maxLength={7}
                  error={accent.length > 0 && !HEX.test(accent)}
                  className="max-w-[140px] font-mono"
                />
                <div className="flex flex-wrap gap-1.5">
                  {ACCENT_SUGGESTIONS.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      onClick={() => setAccent(colour)}
                      aria-label={colour}
                      title={colour}
                      className={cn(
                        "h-7 w-7 cursor-pointer rounded-full border-2 transition",
                        accent.toLowerCase() === colour.toLowerCase()
                          ? "border-text"
                          : "border-border"
                      )}
                      style={{ backgroundColor: colour }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Paper</Label>
              <div className="flex flex-wrap gap-2">
                {PAGE_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setPageStyle(style)}
                    aria-pressed={pageStyle === style}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-[10px] border-2 px-3 py-2 text-sm font-medium transition",
                      pageStyle === style
                        ? "border-primary bg-row-hover text-text"
                        : "border-border text-text-muted hover:border-primary/40"
                    )}
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-border"
                      style={{ backgroundColor: PAPER[style].page }}
                    />
                    {PAPER[style].label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Contact defaults */}
          <section className="space-y-4 rounded-[12px] border border-border bg-card-bg p-4">
            <div>
              <h2 className="text-sm font-semibold text-text">Agency contact defaults</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                Offered to agents as a starting point. Each brochure keeps its own copy,
                so changing these never rewrites brochures already made.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="contactPhone">Phone</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+263 775 920 436"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactEmail">Email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="sales@agency.co.zw"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="agency.co.zw"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save brand kit"}
            </Button>
          </div>
        </div>

        {/* Live preview — a colour chip can't tell an admin whether their
            accent works, but the actual brochure can. */}
        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold text-text">Preview</h2>
          <div className="rounded-[12px] border border-border bg-surface-2 p-3">
            <BrochureStage
              doc={PREVIEW_DOC}
              brand={previewBrand}
              className="h-[420px] w-full"
            />
          </div>
          <p className="text-xs text-text-muted">
            Unsaved changes show here immediately.
          </p>
        </aside>
      </div>
    </div>
  );
}

function LogoSlot({
  label,
  hint,
  url,
  busy,
  background,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  url?: string;
  busy: boolean;
  background: string;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium text-text">{label}</p>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      <div
        className="flex h-24 items-center justify-center rounded-[10px] border border-border"
        style={{ backgroundColor: background }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="max-h-16 max-w-[80%] object-contain" />
        ) : (
          <span className="text-xs text-text-muted">Nothing uploaded</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onPick} disabled={busy}>
          <ImagePlus className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        </Button>
        {url ? (
          <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
