"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { FileSignature, Plus, Eye, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { viewingToasts } from "@/lib/toast";
import { ViewingFormModal, type ViewingFormPrefill } from "./viewing-form-modal";
import { ViewingFormView } from "./viewing-form-view";

type ViewingRow = {
  _id: Id<"viewingForms">;
  clientName: string;
  propertyAddress: string;
  viewingDate: string;
  viewingTime?: string;
  status: "draft" | "completed";
  agentName: string;
  clientSignatureUrl: string | null;
  createdAt: number;
};

interface ViewingFormsListProps {
  leadId?: Id<"leads">;
  propertyId?: Id<"properties">;
  contactId?: Id<"contacts">;
  prefill?: ViewingFormPrefill;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

export function ViewingFormsList({ leadId, propertyId, contactId, prefill }: ViewingFormsListProps) {
  const forms = useQuery(
    leadId
      ? api.viewingForms.listByLead
      : propertyId
        ? api.viewingForms.listByProperty
        : api.viewingForms.listByContact,
    leadId
      ? { leadId }
      : propertyId
        ? { propertyId }
        : contactId
          ? { contactId }
          : "skip"
  ) as ViewingRow[] | undefined;

  const removeForm = useMutation(api.viewingForms.remove);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<Id<"viewingForms"> | null>(null);
  const [viewId, setViewId] = React.useState<Id<"viewingForms"> | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ViewingRow | null>(null);

  const mergedPrefill: ViewingFormPrefill = {
    ...prefill,
    propertyId: propertyId ?? prefill?.propertyId,
    contactId: contactId ?? prefill?.contactId,
    leadId: leadId ?? prefill?.leadId,
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeForm({ formId: deleteTarget._id });
      viewingToasts.deleted();
    } catch (err) {
      viewingToasts.deleteFailed(err instanceof Error ? err.message : undefined);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <FileSignature className="h-4 w-4" />
          <span>Signed proof-of-viewing records</span>
        </div>
        <Button className="h-9 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Viewing Form
        </Button>
      </div>

      {forms === undefined ? (
        <div className="py-8 text-center text-sm text-text-muted">Loading…</div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-2/20 py-10 text-center">
          <FileSignature className="mb-2 h-8 w-8 text-text-muted/40" />
          <p className="text-sm text-text-muted">No viewing forms yet</p>
          <p className="mt-1 text-xs text-text-muted/60">
            Create one after showing a client a property to record proof of introduction.
          </p>
        </div>
      ) : (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2">
          {forms.map((f) => (
            <motion.div
              key={f._id}
              variants={rowVariants}
              className="group flex items-center gap-3 rounded-lg border border-border-strong bg-card-bg p-3 transition-colors hover:bg-surface-2/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                <FileSignature className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setViewId(f._id)}>
                <p className="truncate text-sm font-medium text-text">{f.clientName}</p>
                <p className="truncate text-xs text-text-muted">
                  {f.propertyAddress} · {fmtDate(f.viewingDate)}
                  {f.viewingTime ? ` ${f.viewingTime}` : ""} · {f.agentName}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  f.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {f.status === "completed" ? "Completed" : "Draft"}
              </span>
              <div className="flex items-center gap-1 md:opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => setViewId(f._id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
                  title="View"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(f)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create */}
      <ViewingFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        prefill={mergedPrefill}
      />

      {/* Edit */}
      <ViewingFormModal
        open={Boolean(editId)}
        formId={editId}
        onClose={() => setEditId(null)}
      />

      {/* View */}
      <AnimatePresence>
        {viewId && (
          <ViewingFormView
            open={Boolean(viewId)}
            formId={viewId}
            onClose={() => setViewId(null)}
            onEdit={() => {
              setEditId(viewId);
              setViewId(null);
            }}
          />
        )}
      </AnimatePresence>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete viewing form?"
        description={
          deleteTarget
            ? `The viewing form for "${deleteTarget.clientName}" will be permanently removed.`
            : ""
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
