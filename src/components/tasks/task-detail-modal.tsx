"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { activityToasts } from "@/lib/toast";

interface TaskActivity {
  _id: Id<"activities">;
  leadId: Id<"leads">;
  type: "call" | "whatsapp" | "email" | "meeting" | "viewing" | "note";
  title: string;
  description: string;
  scheduledAt?: number;
  completedAt?: number;
  status: "todo" | "completed";
  completionNotes?: string;
  assignedToUserId: Id<"users">;
  createdByUserId: Id<"users">;
  createdAt: number;
  updatedAt?: number;
  lead: { _id: Id<"leads">; fullName: string; phone: string } | null;
  assignedTo: { _id: Id<"users">; fullName?: string; name?: string; email?: string } | null;
}

interface TaskDetailModalProps {
  open: boolean;
  onClose: () => void;
  task: TaskActivity | null;
  onTaskUpdated?: () => void;
  onTaskCompleted?: (taskId: string) => void;
}

export function TaskDetailModal({ open, onClose, task, onTaskUpdated, onTaskCompleted }: TaskDetailModalProps) {
  const [completionNotes, setCompletionNotes] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [showCompleteForm, setShowCompleteForm] = useState(false);

  const markComplete = useMutation(api.activities.markComplete);
  const reopenTask = useMutation(api.activities.reopen);

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleMarkComplete = async () => {
    if (!task || !completionNotes.trim()) return;
    setIsCompleting(true);
    try {
      await markComplete({
        activityId: task._id,
        completionNotes: completionNotes.trim(),
      });
      activityToasts.completed(task.title);
      setCompletionNotes("");
      setShowCompleteForm(false);
      onTaskCompleted?.(task._id);
      onTaskUpdated?.();
      onClose();
    } catch (error) {
      console.error("Failed to mark task complete:", error);
      activityToasts.completeFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleReopen = async () => {
    if (!task) return;
    setIsReopening(true);
    try {
      await reopenTask({ activityId: task._id });
      activityToasts.reopened(task.title);
      onTaskUpdated?.();
    } catch (error) {
      console.error("Failed to reopen task:", error);
      activityToasts.reopenFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsReopening(false);
    }
  };

  if (!task) return null;

  const getActivityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      call: "Call",
      whatsapp: "WhatsApp",
      email: "Email",
      meeting: "Meeting",
      viewing: "Viewing",
      note: "Note",
    };
    return labels[type] || type;
  };

  return (
    <Modal
      open={open}
      title={task.title}
      description={`${getActivityTypeLabel(task.type)} activity`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div>
            {task.lead && (
              <Link href={`/app/leads/${task.lead._id}`}>
                <Button variant="secondary" onClick={onClose}>
                  Open Lead
                </Button>
              </Link>
            )}
          </div>
          <div className="flex gap-2">
            {task.status === "completed" ? (
              <Button
                variant="secondary"
                onClick={handleReopen}
                disabled={isReopening}
              >
                {isReopening ? "Reopening..." : "Reopen Task"}
              </Button>
            ) : showCompleteForm ? (
              <>
                <Button variant="secondary" onClick={() => setShowCompleteForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleMarkComplete}
                  disabled={isCompleting || !completionNotes.trim()}
                >
                  {isCompleting ? "Saving..." : "Save & Complete"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowCompleteForm(true)}>
                Mark Complete
              </Button>
            )}
          </div>
        </div>
      }
    >
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.05 }}
      >
        <div className="flex items-center gap-3">
          <Badge
            className={
              task.status === "completed"
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning"
            }
          >
            {task.status === "completed" ? "Completed" : "To Do"}
          </Badge>
          <Badge className="bg-info/10 text-info">
            {getActivityTypeLabel(task.type)}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Lead</Label>
            <Input
              value={task.lead ? `${task.lead.fullName}${task.lead.phone ? ` (${task.lead.phone})` : ""}` : "Unknown lead"}
              readOnly
            />
          </div>

          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Input
              value={task.assignedTo?.fullName || task.assignedTo?.name || task.assignedTo?.email || "Unassigned"}
              readOnly
            />
          </div>

          {task.scheduledAt && (
            <div className="space-y-2">
              <Label>Scheduled</Label>
              <Input value={formatDateTime(task.scheduledAt)} readOnly />
            </div>
          )}

          <div className="space-y-2">
            <Label>Created</Label>
            <Input value={formatDateTime(task.createdAt)} readOnly />
          </div>

          {task.completedAt && (
            <div className="space-y-2">
              <Label>Completed</Label>
              <Input value={formatDateTime(task.completedAt)} readOnly />
            </div>
          )}
        </div>

        {task.description && (
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={task.description} readOnly />
          </div>
        )}

        {task.status === "completed" && task.completionNotes && (
          <div className="space-y-2">
            <Label>Completion Notes</Label>
            <Textarea value={task.completionNotes} readOnly />
          </div>
        )}

        {showCompleteForm && task.status !== "completed" && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label>
              Completion Notes <span className="text-danger">*</span>
            </Label>
            <p className="text-xs text-text-muted">
              Describe what transpired or the next steps
            </p>
            <Textarea
              placeholder="Enter what happened or next steps..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        )}
      </motion.div>
    </Modal>
  );
}
