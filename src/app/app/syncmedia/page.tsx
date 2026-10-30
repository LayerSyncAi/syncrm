"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Megaphone, Palette, Plus, Trash2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { PhoneMainAction } from "@/components/ui/phone-main-action";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { BrochureThumb } from "@/components/syncmedia/BrochureStage";
import { getFormat } from "@/lib/syncmedia/formats";
import { getTemplate } from "@/lib/syncmedia/templates";
import { resolveBrandKit } from "@/lib/syncmedia/theme";
import { EMPTY_DOC, type BrochureDoc } from "@/lib/syncmedia/types";
import { syncMediaToasts } from "@/lib/toast";

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

export default function SyncMediaPage() {
  const { isAdmin } = useRequireAuth();
  const brochures = useQuery(api.syncmedia.listMine, {});
  const brandingRow = useQuery(api.branding.get, {});
  const removeBrochure = useMutation(api.syncmedia.remove);

  const brand = React.useMemo(() => resolveBrandKit(brandingRow), [brandingRow]);

  async function handleDelete(id: Id<"brochures">) {
    try {
      await removeBrochure({ id });
      syncMediaToasts.brochureDeleted();
    } catch (error) {
      syncMediaToasts.brochureDeleteFailed(
        error instanceof Error ? error.message : undefined
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DashboardHeader
        eyebrow="Studio"
        title="Brochures and posts"
        summary={
          brochures === undefined
            ? null
            : `${brochures.length ? `${brochures.length} draft${brochures.length === 1 ? "" : "s"}, private to you. ` : ""}Pick a listing, choose a layout, and download a post for WhatsApp and social, or a print-ready flyer.`
        }
        actions={
          <>
            {isAdmin ? (
              <Link href="/app/admin/branding">
                <Button variant="secondary">
                  <Palette className="h-4 w-4" /> Brand kit
                </Button>
              </Link>
            ) : null}
            <Link href="/app/syncmedia/new">
              <Button>
                <Plus className="h-4 w-4" /> New brochure
              </Button>
            </Link>
          </>
        }
      />

      {brochures === undefined ? (
        <ListSkeleton rows={3} />
      ) : brochures.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No brochures yet"
          description="Pick a property from your inventory, choose a layout, and download a post-ready image or a print-ready A4 flyer."
          action={
            <Link href="/app/syncmedia/new">
              <Button>
                <Plus className="h-4 w-4" /> Create your first brochure
              </Button>
            </Link>
          }
        />
      ) : (
        <motion.ul
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {brochures.map((brochure) => {
            // The stored ids are open strings, so a draft saved against a
            // format or layout this build no longer has still renders — the
            // getters fall back to the default rather than throwing.
            const preset = getFormat(brochure.formatKey as BrochureDoc["formatKey"]);
            const template = getTemplate(
              brochure.templateId as BrochureDoc["templateId"]
            );
            const doc: BrochureDoc = {
              ...EMPTY_DOC,
              ...brochure,
              formatKey: preset.key,
              templateId: template.id,
              themeId: brochure.themeId as BrochureDoc["themeId"],
              nudges: (brochure.nudges ?? []) as BrochureDoc["nudges"],
            };

            return (
              <motion.li
                key={brochure._id}
                variants={cardVariants}
                className="group relative overflow-hidden rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Link
                  href={
                    brochure.propertyId
                      ? `/app/syncmedia/new?propertyId=${brochure.propertyId}`
                      : "/app/syncmedia/new"
                  }
                  className="block"
                >
                  <div className="m-2 flex items-center justify-center rounded-[14px] bg-surface-2 p-4">
                    <BrochureThumb doc={doc} brand={brand} width={150} />
                  </div>
                  <div className="px-4 pb-4 pt-2">
                    <p className="truncate text-sm font-semibold text-text">
                      {brochure.title || "Untitled brochure"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      {template.name} · {preset.label}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(brochure._id)}
                  aria-label={`Delete ${brochure.title || "brochure"}`}
                  className="absolute right-4 top-4 cursor-pointer rounded-full bg-card-bg/90 p-1.5 text-text-muted opacity-100 shadow-sm transition hover:text-danger focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <PhoneMainAction label="New brochure" icon={Plus} href="/app/syncmedia/new" />
    </div>
  );
}
