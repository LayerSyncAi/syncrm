"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Textarea } from "@/components/ui/textarea";
import { FlipCalendar } from "@/components/ui/flip-calendar";

const timelineContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const timelineItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const isActivityOverdue = (a: { status: string; scheduledAt?: number }) =>
  a.status === "todo" && !!a.scheduledAt && a.scheduledAt < Date.now();

function DueDateRing({ scheduledAt, createdAt }: { scheduledAt: number; createdAt: number }) {
  const now = Date.now();
  const total = scheduledAt - createdAt;
  const elapsed = now - createdAt;
  const progress = total > 0 ? Math.min(Math.max(elapsed / total, 0), 1) : 1;
  const r = 9;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const color = progress >= 1 ? "var(--danger)" : progress >= 0.75 ? "var(--warning)" : "var(--info)";

  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 11 11)" className="transition-all duration-700" />
    </svg>
  );
}

function CelebrationCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-success">
      <path d="M5 12l5 5L19 7" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" className="check-draw-in" />
    </svg>
  );
}

interface Activity {
  _id: Id<"activities">;
  title: string;
  description: string;
  type: string;
  status: string;
  scheduledAt?: number;
  createdAt: number;
  completedAt?: number;
  completionNotes?: string;
}

const TimelineItem = React.memo(function TimelineItem({
  activity,
  celebrating,
  onMarkComplete,
}: {
  activity: Activity;
  celebrating: boolean;
  onMarkComplete: (id: Id<"activities">) => void;
}) {
  const overdue = isActivityOverdue(activity);

  return (
    <motion.div
      variants={timelineItemVariants}
      layout
      whileHover={{ y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`rounded-[10px] border border-border-strong bg-card-bg/40 p-4 ${
        overdue ? "overdue-pulse" : ""
      } ${celebrating ? "celebration-glow" : ""}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{activity.title}</span>
        <div className="flex items-center gap-2">
          <Badge className="bg-info/10 text-info capitalize">{activity.type}</Badge>
          {celebrating ? (
            <div className="flex items-center gap-1.5">
              <CelebrationCheck />
              <span className="text-xs font-medium text-success">Done!</span>
            </div>
          ) : (
            <Badge className={activity.status === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
              {activity.status === "completed" ? "Completed" : "To Do"}
            </Badge>
          )}
        </div>
      </div>
      {activity.description && <p className="mt-2 text-sm text-text-muted">{activity.description}</p>}
      {activity.status === "completed" && activity.completionNotes && (
        <div className="mt-3 rounded-md border border-success/20 bg-success/5 p-2">
          <p className="text-xs text-text-muted mb-1">Completion notes:</p>
          <p className="text-sm">{activity.completionNotes}</p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {activity.status === "todo" && activity.scheduledAt && (
            <DueDateRing scheduledAt={activity.scheduledAt} createdAt={activity.createdAt} />
          )}
          <span className={overdue ? "overdue-breathe text-danger font-medium" : ""}>
            {activity.scheduledAt
              ? `Scheduled: ${formatDateTime(activity.scheduledAt)}`
              : `Created: ${formatDateTime(activity.createdAt)}`}
          </span>
          {activity.completedAt && <span>· Completed: {formatDateTime(activity.completedAt)}</span>}
        </div>
        {activity.status !== "completed" && (
          <Button variant="secondary" onClick={() => onMarkComplete(activity._id)}>
            Mark complete
          </Button>
        )}
      </div>
    </motion.div>
  );
});

interface ActivityTimelineProps {
  leadId: Id<"leads">;
  activities: Activity[] | undefined;
  onCreateActivity: (data: {
    type: "call" | "whatsapp" | "email" | "meeting" | "viewing" | "note";
    title: string;
    description: string;
    scheduledAt?: number;
  }) => Promise<void>;
  onMarkComplete: (activityId: Id<"activities">, notes: string) => Promise<void>;
}

export const ActivityTimeline = React.memo(function ActivityTimeline({
  leadId,
  activities,
  onCreateActivity,
  onMarkComplete,
}: ActivityTimelineProps) {
  const [activityType, setActivityType] = useState<"call" | "whatsapp" | "email" | "meeting" | "viewing" | "note">("call");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityScheduledAt, setActivityScheduledAt] = useState<Date | null>(null);
  const [isSavingActivity, setIsSavingActivity] = useState(false);

  const [completingActivityId, setCompletingActivityId] = useState<Id<"activities"> | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  const [celebratingIds, setCelebratingIds] = useState<Set<string>>(new Set());

  const handleCreateActivity = useCallback(async () => {
    if (!activityTitle.trim()) return;
    setIsSavingActivity(true);
    try {
      await onCreateActivity({
        type: activityType,
        title: activityTitle.trim(),
        description: activityDescription.trim(),
        scheduledAt: activityScheduledAt ? activityScheduledAt.getTime() : undefined,
      });
      setActivityTitle("");
      setActivityDescription("");
      setActivityScheduledAt(null);
    } finally {
      setIsSavingActivity(false);
    }
  }, [onCreateActivity, activityType, activityTitle, activityDescription, activityScheduledAt]);

  const handleOpenCompleteModal = useCallback((activityId: Id<"activities">) => {
    setCompletingActivityId(activityId);
    setCompletionNotes("");
  }, []);

  const handleCloseCompleteModal = useCallback(() => {
    setCompletingActivityId(null);
    setCompletionNotes("");
  }, []);

  const handleMarkComplete = useCallback(async () => {
    if (!completingActivityId || !completionNotes.trim()) return;
    setIsMarkingComplete(true);
    try {
      await onMarkComplete(completingActivityId, completionNotes.trim());
      const cid = completingActivityId;
      setCelebratingIds((prev) => new Set([...prev, cid]));
      setTimeout(() => {
        setCelebratingIds((prev) => {
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
      }, 1600);
      handleCloseCompleteModal();
    } finally {
      setIsMarkingComplete(false);
    }
  }, [completingActivityId, completionNotes, onMarkComplete, handleCloseCompleteModal]);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Log activity</h3>
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <StaggeredDropDown
                    value={activityType}
                    onChange={(val) => setActivityType(val as typeof activityType)}
                    options={[
                      { value: "call", label: "Call" },
                      { value: "whatsapp", label: "WhatsApp" },
                      { value: "email", label: "Email" },
                      { value: "meeting", label: "Meeting" },
                      { value: "viewing", label: "Viewing" },
                      { value: "note", label: "Note" },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Title <span className="text-danger">*</span>
                  </Label>
                  <Input placeholder="Title" value={activityTitle} onChange={(e) => setActivityTitle(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Schedule</Label>
                <FlipCalendar value={activityScheduledAt} onChange={setActivityScheduledAt} showTime placeholder="Schedule date/time (optional)" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={activityDescription} onChange={(e) => setActivityDescription(e.target.value)} placeholder="Description..." />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreateActivity} disabled={isSavingActivity || !activityTitle.trim()}>
                  {isSavingActivity ? "Saving..." : "Save activity"}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Timeline</h3>
          {activities === undefined ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-text-muted text-sm py-4">No activities yet.</p>
          ) : (
            <motion.div variants={timelineContainerVariants} initial="hidden" animate="show" className="space-y-4">
              {activities.map((activity) => (
                <TimelineItem
                  key={activity._id}
                  activity={activity}
                  celebrating={celebratingIds.has(activity._id)}
                  onMarkComplete={handleOpenCompleteModal}
                />
              ))}
            </motion.div>
          )}
        </Card>
      </div>

      <Modal
        open={completingActivityId !== null}
        title="Complete Activity"
        description="Add notes about what transpired or the next steps"
        onClose={handleCloseCompleteModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleCloseCompleteModal}>Cancel</Button>
            <Button onClick={handleMarkComplete} disabled={isMarkingComplete || !completionNotes.trim()}>
              {isMarkingComplete ? "Saving..." : "Mark Complete"}
            </Button>
          </div>
        }
      >
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.1 }}
        >
          <div className="space-y-2">
            <Label>Completion Notes <span className="text-danger">*</span></Label>
            <Textarea
              placeholder="Describe what happened or what the next steps are..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-text-muted">These notes will be visible in the timeline and on the tasks page.</p>
          </div>
        </motion.div>
      </Modal>
    </>
  );
});
