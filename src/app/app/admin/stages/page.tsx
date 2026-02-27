"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RightDrawer } from "@/components/common/right-drawer";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { stageToasts } from "@/lib/toast";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

/* ── Drag handle component ──────────────────────────── */
function DragHandle({ dragControls }: { dragControls: ReturnType<typeof useDragControls> }) {
  return (
    <button
      type="button"
      className="cursor-grab touch-none rounded p-1 text-text-muted transition-colors hover:bg-border hover:text-text active:cursor-grabbing"
      onPointerDown={(e) => dragControls.start(e)}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

/* ── Draggable stage row ──────────────────────────────── */
function StageRow({
  stage,
  index,
  onEdit,
  onDelete,
}: {
  stage: { _id: Id<"pipelineStages">; name: string; description?: string; action?: string; order: number; isTerminal: boolean; terminalOutcome: "won" | "lost" | null };
  index: number;
  onEdit: (id: Id<"pipelineStages">) => void;
  onDelete: (id: Id<"pipelineStages">) => void;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      as="tr"
      value={stage._id}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        background: "var(--card-bg)",
        zIndex: 50,
      }}
      layout
      className="h-11 border-b border-[rgba(148,163,184,0.1)] transition-colors duration-150 hover:bg-row-hover"
      style={{ position: "relative" }}
    >
      <TableCell className="w-12">
        <DragHandle dragControls={dragControls} />
      </TableCell>
      <TableCell className="font-mono text-sm">{index + 1}</TableCell>
      <TableCell className="font-medium">{stage.name}</TableCell>
      <TableCell className="hidden md:table-cell text-text-muted text-sm max-w-xs truncate">
        {stage.description || "—"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-text-muted text-sm max-w-xs truncate">
        {stage.action || "—"}
      </TableCell>
      <TableCell>
        {stage.isTerminal ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        {stage.terminalOutcome === "won" ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Won
          </span>
        ) : stage.terminalOutcome === "lost" ? (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Lost
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(stage._id)}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(stage._id)}
            title="Delete"
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </Reorder.Item>
  );
}

interface StageFormData {
  name: string;
  description: string;
  action: string;
  isTerminal: boolean;
  terminalOutcome: "won" | "lost" | null;
}

const defaultFormData: StageFormData = {
  name: "",
  description: "",
  action: "",
  isTerminal: false,
  terminalOutcome: null,
};

export default function StagesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Convex queries and mutations
  const stages = useQuery(api.stages.list);
  const createStage = useMutation(api.stages.adminCreate);
  const updateStage = useMutation(api.stages.adminUpdate);
  const deleteStage = useMutation(api.stages.adminDelete);
  const reorderStages = useMutation(api.stages.adminReorder);
  const seedStages = useMutation(api.stages.seedDefaultsIfEmpty);

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Id<"pipelineStages"> | null>(
    null
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<Id<"pipelineStages"> | null>(
    null
  );
  const [formData, setFormData] = useState<StageFormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reordering, setReordering] = useState<Id<"pipelineStages"> | null>(null);
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  // Keep local order in sync with server data
  useEffect(() => {
    if (stages) {
      const sorted = [...stages].sort((a, b) => a.order - b.order);
      setLocalOrder(sorted.map((s) => s._id));
    }
  }, [stages]);

  // Seed default stages on mount if empty
  useEffect(() => {
    if (stages !== undefined && stages.length === 0) {
      seedStages();
    }
  }, [stages, seedStages]);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Access denied for non-admins
  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Admins only.</p>
      </div>
    );
  }

  const openCreateDrawer = () => {
    setEditingStage(null);
    setFormData(defaultFormData);
    setError(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (stageId: Id<"pipelineStages">) => {
    const stage = stages?.find((s) => s._id === stageId);
    if (stage) {
      setEditingStage(stageId);
      setFormData({
        name: stage.name,
        description: stage.description || "",
        action: stage.action || "",
        isTerminal: stage.isTerminal,
        terminalOutcome: stage.terminalOutcome,
      });
      setError(null);
      setDrawerOpen(true);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingStage(null);
    setFormData(defaultFormData);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Stage name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingStage) {
        await updateStage({
          stageId: editingStage,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          action: formData.action.trim() || undefined,
          order: stages?.find((s) => s._id === editingStage)?.order || 1,
          isTerminal: formData.isTerminal,
          terminalOutcome: formData.isTerminal ? formData.terminalOutcome : null,
        });
      } else {
        const maxOrder = stages?.reduce((max, s) => Math.max(max, s.order), 0) || 0;
        await createStage({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          action: formData.action.trim() || undefined,
          order: maxOrder + 1,
          isTerminal: formData.isTerminal,
          terminalOutcome: formData.isTerminal ? formData.terminalOutcome : null,
        });
      }
      if (editingStage) {
        stageToasts.updated(formData.name.trim());
      } else {
        stageToasts.created(formData.name.trim());
      }
      closeDrawer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save stage";
      setError(msg);
      stageToasts.saveFailed(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!stageToDelete) return;

    setIsSubmitting(true);
    setError(null);

    const stageName = stages?.find((s) => s._id === stageToDelete)?.name || "Stage";
    try {
      await deleteStage({ stageId: stageToDelete });
      stageToasts.deleted(stageName);
      setDeleteConfirmOpen(false);
      setStageToDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete stage";
      setError(msg);
      stageToasts.deleteFailed(msg);
      setDeleteConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirm = (stageId: Id<"pipelineStages">) => {
    setStageToDelete(stageId);
    setDeleteConfirmOpen(true);
  };

  const handleDragReorder = async (newOrder: string[]) => {
    setLocalOrder(newOrder);
    // Persist to backend
    setReordering("__dragging__" as Id<"pipelineStages">);
    try {
      await reorderStages({
        orderedStageIds: newOrder as Id<"pipelineStages">[],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reorder stages";
      setError(msg);
      stageToasts.reorderFailed(msg);
      // Revert to server order
      if (stages) {
        const sorted = [...stages].sort((a, b) => a.order - b.order);
        setLocalOrder(sorted.map((s) => s._id));
      }
    } finally {
      setReordering(null);
    }
  };

  // Build sorted stages from localOrder
  const stageMap = new Map((stages || []).map((s) => [s._id, s]));
  const sortedStages = localOrder
    .map((id) => stageMap.get(id as Id<"pipelineStages">))
    .filter(Boolean) as NonNullable<typeof stages>[number][];
  const stageToDeleteName = stages?.find((s) => s._id === stageToDelete)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Stages</h2>
          <p className="text-sm text-text-muted">
            Configure ordering, descriptions, actions, and terminal outcomes.
          </p>
        </div>
        <button
          onClick={openCreateDrawer}
          className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
        >
          <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
            <Plus className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary" />
          </span>
          <span className="text-sm font-medium">Add stage</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {stages === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : sortedStages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
          <p className="text-sm text-text-muted mb-4">
            No pipeline stages configured
          </p>
          <Button onClick={openCreateDrawer}>
            <Plus className="mr-2 h-4 w-4" />
            Add your first stage
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="hidden lg:table-cell">Action</TableHead>
                <TableHead className="w-24">Terminal</TableHead>
                <TableHead className="w-24">Outcome</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <Reorder.Group
              as="tbody"
              axis="y"
              values={localOrder}
              onReorder={handleDragReorder}
            >
              {sortedStages.map((stage, index) => (
                <StageRow
                  key={stage._id}
                  stage={stage}
                  index={index}
                  onEdit={openEditDrawer}
                  onDelete={openDeleteConfirm}
                />
              ))}
            </Reorder.Group>
          </Table>
        </div>
      )}

      {/* Create/Edit Drawer */}
      <RightDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingStage ? "Edit Stage" : "Create Stage"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editingStage ? "Save Changes" : "Create Stage"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && drawerOpen && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Stage Name *</Label>
            <Input
              placeholder="e.g., New Lead, Qualified, Closed"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe what this stage represents..."
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Recommended Action</Label>
            <Textarea
              placeholder="What should be done when a lead is in this stage?"
              value={formData.action}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, action: e.target.value }))
              }
              rows={2}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isTerminal"
                checked={formData.isTerminal}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    isTerminal: e.target.checked,
                    terminalOutcome: e.target.checked ? "won" : null,
                  }))
                }
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="isTerminal" className="cursor-pointer">
                This is a terminal stage (deal ends here)
              </Label>
            </div>

            {formData.isTerminal && (
              <div className="space-y-2 pt-2">
                <Label>Terminal Outcome</Label>
                <Select
                  value={formData.terminalOutcome || "won"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      terminalOutcome: e.target.value as "won" | "lost",
                    }))
                  }
                >
                  <option value="won">Won (Success)</option>
                  <option value="lost">Lost (Did not convert)</option>
                </Select>
              </div>
            )}
          </div>
        </div>
      </RightDrawer>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        title="Delete Stage"
        description={`Are you sure you want to delete "${stageToDeleteName}"?`}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setStageToDelete(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setStageToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="attention-shake"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete Stage
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          This action cannot be undone. If any leads are assigned to this stage,
          you will not be able to delete it.
        </p>
      </Modal>
    </div>
  );
}
