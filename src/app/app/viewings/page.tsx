"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { FileSignature, Plus, Eye } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ViewingFormModal } from "@/components/viewings/viewing-form-modal";
import { ViewingFormView } from "@/components/viewings/viewing-form-view";

type ViewingRow = {
  _id: Id<"viewingForms">;
  clientName: string;
  propertyAddress: string;
  viewingDate: string;
  viewingTime?: string;
  status: "draft" | "completed";
  agentName: string;
  createdAt: number;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

export default function ViewingsPage() {
  const { isAdmin } = useRequireAuth();
  const [statusFilter, setStatusFilter] = React.useState<"" | "draft" | "completed">("");
  const [agentFilter, setAgentFilter] = React.useState<string>("");

  const agents = useQuery(api.users.listForAssignment);
  const forms = useQuery(api.viewingForms.listForOrg, {
    status: statusFilter || undefined,
    agentUserId: (agentFilter || undefined) as Id<"users"> | undefined,
  }) as ViewingRow[] | undefined;

  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewId, setViewId] = React.useState<Id<"viewingForms"> | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb items={[{ label: "Viewings" }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text">
            <FileSignature className="h-5 w-5 text-primary-ink" /> Viewing Forms
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {isAdmin
              ? "Signed proof-of-viewing records across the organisation."
              : "Your signed proof-of-viewing records."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Viewing Form
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
        {isAdmin && (
          <div className="w-56">
            <Select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">All agents</option>
              {agents?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {forms === undefined ? (
        <div className="py-12 text-center text-sm text-text-muted">Loading…</div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-2/20 py-16 text-center">
          <FileSignature className="mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-sm text-text-muted">No viewing forms found</p>
          <p className="mt-1 text-xs text-text-muted/60">
            Create one after showing a client a property to record proof of introduction.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <motion.div
              key={f._id}
              variants={rowVariants}
              initial="hidden"
              animate="show"
              className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border-strong bg-card-bg p-3 transition-colors hover:bg-surface-2/40"
              onClick={() => setViewId(f._id)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                <FileSignature className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{f.clientName}</p>
                <p className="truncate text-xs text-text-muted">
                  {f.propertyAddress} · {fmtDate(f.viewingDate)} · {f.agentName}
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
              <Eye className="h-4 w-4 text-text-muted md:opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.div>
          ))}
        </div>
      )}

      <ViewingFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {viewId && (
        <ViewingFormView open={Boolean(viewId)} formId={viewId} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}
