"use client";

import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { Tooltip } from "@/components/ui/tooltip";
import { Eye, ExternalLink, Trash2 } from "lucide-react";
import { useRequireAuth } from "@/hooks/useAuth";
import { DueDateRing } from "@/components/ui/due-date-ring";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlipCalendar } from "@/components/ui/flip-calendar";
import { activityToasts } from "@/lib/toast";

function AnimatedCounter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    mv.set(0);
    const controls = animate(mv, value, {
      duration: 1,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [mv, value]);

  useEffect(() => {
    const unsubscribe = mv.on("change", (v) => {
      if (ref.current) {
        ref.current.textContent = Math.round(v).toString();
      }
    });
    return unsubscribe;
  }, [mv]);

  return <span ref={ref}>{value}</span>;
}

const cardContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const cardItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

const TaskDetailModal = lazy(() =>
  import("@/components/tasks/task-detail-modal").then((m) => ({ default: m.TaskDetailModal }))
);

type TaskStatus = "todo" | "completed" | "all";
type ActivityType = "call" | "whatsapp" | "email" | "meeting" | "viewing" | "note" | "all";

const formatDateTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const activityTypeLabels: Record<string, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Meeting",
  viewing: "Viewing",
  note: "Note",
};

const getActivityTypeLabel = (type: string) => activityTypeLabels[type] || type;

const isTaskOverdue = (task: { status: string; scheduledAt?: number }) =>
  task.status === "todo" && !!task.scheduledAt && task.scheduledAt < Date.now();

// Animated checkmark SVG for completion celebration
function CelebrationCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-success">
      <path
        d="M5 12l5 5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-draw-in"
      />
    </svg>
  );
}

interface TaskActivity {
  _id: Id<"activities">;
  leadId?: Id<"leads">;
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
  lead: { _id: Id<"leads">; fullName: string; phone?: string } | null;
  assignedTo: { _id: Id<"users">; fullName?: string; name?: string; email?: string } | null;
}

export default function TasksPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const pagination = usePagination(50);
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("all");
  const [typeFilter, setTypeFilter] = useState<ActivityType>("all");
  const [selectedTask, setSelectedTask] = useState<TaskActivity | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [celebratingIds, setCelebratingIds] = useState<Set<string>>(new Set());
  const [deletingTask, setDeletingTask] = useState<TaskActivity | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const removeTask = useMutation(api.activities.remove);
  const createStandaloneTask = useMutation(api.activities.createStandalone);

  // New task creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskType, setNewTaskType] = useState<"call" | "whatsapp" | "email" | "meeting" | "viewing" | "note">("meeting");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskScheduledAt, setNewTaskScheduledAt] = useState<Date | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const resetCreateForm = useCallback(() => {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskScheduledAt(null);
    setNewTaskType("meeting");
  }, []);

  const handleCreateTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    setIsCreatingTask(true);
    try {
      await createStandaloneTask({
        type: newTaskType,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        scheduledAt: newTaskScheduledAt ? newTaskScheduledAt.getTime() : undefined,
      });
      activityToasts.created(newTaskTitle.trim());
      setShowCreateModal(false);
      resetCreateForm();
    } catch (error) {
      console.error("Failed to create task:", error);
      activityToasts.createFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsCreatingTask(false);
    }
  }, [createStandaloneTask, newTaskType, newTaskTitle, newTaskDescription, newTaskScheduledAt, resetCreateForm]);

  // Reset to first page when filters change
  useEffect(() => {
    pagination.resetPage();
  }, [statusFilter, typeFilter]);

  const tasksResult = useQuery(api.activities.listAllTasks, {
    status: statusFilter,
    type: typeFilter,
    page: pagination.page > 0 ? pagination.page : undefined,
    pageSize: pagination.pageSize !== 50 ? pagination.pageSize : undefined,
  });

  const tasks = useMemo(() => {
    if (!tasksResult) return undefined;
    return (tasksResult as any).items ?? (Array.isArray(tasksResult) ? tasksResult : []);
  }, [tasksResult]);
  const totalCount = (tasksResult as any)?.totalCount ?? tasks?.length ?? 0;
  const hasMore = (tasksResult as any)?.hasMore ?? false;

  const handleViewTask = useCallback((task: TaskActivity) => {
    setSelectedTask(task);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSelectedTask(null);
  }, []);

  const handleTaskCompleted = useCallback((taskId: string) => {
    setCelebratingIds((prev) => new Set([...prev, taskId]));
    setTimeout(() => {
      setCelebratingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 1600);
  }, []);

  const handleOpenDeleteModal = useCallback((task: TaskActivity) => {
    setDeletingTask(task);
    setDeleteConfirmText("");
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setDeletingTask(null);
    setDeleteConfirmText("");
  }, []);

  const handleDeleteTask = useCallback(async () => {
    if (!deletingTask || deleteConfirmText !== deletingTask.title) return;
    setIsDeletingTask(true);
    try {
      await removeTask({ activityId: deletingTask._id });
      activityToasts.deleted(deletingTask.title);
      handleCloseDeleteModal();
    } catch (error) {
      console.error("Failed to delete task:", error);
      activityToasts.deleteFailed(error instanceof Error ? error.message : undefined);
    } finally {
      setIsDeletingTask(false);
    }
  }, [deletingTask, deleteConfirmText, removeTask, handleCloseDeleteModal]);

  const handleTaskDeleted = useCallback((taskId: string) => {
    handleCloseModal();
  }, [handleCloseModal]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const { todoCount, completedCount } = useMemo(() => {
    if (!tasks) return { todoCount: 0, completedCount: 0 };
    let todo = 0;
    let completed = 0;
    for (const t of tasks as any[]) {
      if (t.status === "todo") todo++;
      else if (t.status === "completed") completed++;
    }
    return { todoCount: todo, completedCount: completed };
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Tasks</h2>
          <p className="text-sm text-text-muted">
            Manage and track your activities and tasks.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
        >
          <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary"
            >
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-sm font-medium">New Task</span>
        </button>
      </div>

      <motion.div
        variants={cardContainerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 md:grid-cols-3"
      >
        <motion.div variants={cardItemVariants} whileHover={{ scale: 1.02, boxShadow: "0 8px 25px rgba(0,0,0,0.1)" }}>
          <Card className="p-4">
            <p className="text-xs text-text-muted uppercase tracking-wide">To Do</p>
            <p className="text-2xl font-semibold mt-1"><AnimatedCounter value={todoCount} /></p>
          </Card>
        </motion.div>
        <motion.div variants={cardItemVariants} whileHover={{ scale: 1.02, boxShadow: "0 8px 25px rgba(0,0,0,0.1)" }}>
          <Card className="p-4">
            <p className="text-xs text-text-muted uppercase tracking-wide">Completed</p>
            <p className="text-2xl font-semibold mt-1"><AnimatedCounter value={completedCount} /></p>
          </Card>
        </motion.div>
        <motion.div variants={cardItemVariants} whileHover={{ scale: 1.02, boxShadow: "0 8px 25px rgba(0,0,0,0.1)" }}>
          <Card className="p-4">
            <p className="text-xs text-text-muted uppercase tracking-wide">Total</p>
            <p className="text-2xl font-semibold mt-1"><AnimatedCounter value={totalCount} /></p>
          </Card>
        </motion.div>
      </motion.div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Status</label>
            <StaggeredDropDown
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as TaskStatus)}
              className="min-w-[140px]"
              options={[
                { value: "all", label: "All Statuses" },
                { value: "todo", label: "To Do" },
                { value: "completed", label: "Completed" },
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Activity Type</label>
            <StaggeredDropDown
              value={typeFilter}
              onChange={(val) => setTypeFilter(val as ActivityType)}
              className="min-w-[140px]"
              options={[
                { value: "all", label: "All Types" },
                { value: "call", label: "Call" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "email", label: "Email" },
                { value: "meeting", label: "Meeting" },
                { value: "viewing", label: "Viewing" },
                { value: "note", label: "Note" },
              ]}
            />
          </div>
        </div>
      </Card>

      {tasks === undefined ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">No tasks found matching your filters.</p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHead>Date/Time</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </tr>
          </thead>
          <motion.tbody variants={listVariants} initial="hidden" animate="show">
            {tasks.map((task: TaskActivity) => {
              const overdue = isTaskOverdue(task);
              const celebrating = celebratingIds.has(task._id);
              return (
              <motion.tr
                key={task._id}
                variants={rowVariants}
                initial="hidden"
                animate="show"
                layout
                className={`group h-11 border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover hover:shadow-[inset_3px_0_0_var(--primary)] ${
                  overdue ? "overdue-pulse" : ""
                } ${celebrating ? "celebration-glow" : ""}`}
              >
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {/* Due date proximity ring */}
                    {task.status === "todo" && task.scheduledAt && (
                      <DueDateRing scheduledAt={task.scheduledAt} createdAt={task.createdAt} />
                    )}
                    <span className={overdue ? "overdue-breathe text-danger font-medium" : ""}>
                      {task.scheduledAt
                        ? formatDateTime(task.scheduledAt)
                        : formatDateTime(task.createdAt)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-text-muted line-clamp-1">
                        {task.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className="bg-info/10 text-info">
                    {getActivityTypeLabel(task.type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {task.lead ? (
                    <div>
                      <p className="font-medium">{task.lead.fullName}</p>
                      {task.lead.phone && <p className="text-xs text-text-muted">{task.lead.phone}</p>}
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Standalone</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {/* Celebration checkmark or normal status badge */}
                  {celebrating ? (
                    <div className="flex items-center gap-2">
                      <CelebrationCheck />
                      <span className="text-xs font-medium text-success">Done!</span>
                    </div>
                  ) : (
                    <Badge
                      className={
                        task.status === "completed"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }
                    >
                      {task.status === "completed" ? "Completed" : "To Do"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Tooltip content="View Details">
                      <Button
                        variant="secondary"
                        className="action-btn h-9 w-9 p-0 md:opacity-0 md:translate-x-3 md:scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out"
                        style={{ transitionDelay: "0ms" }}
                        onClick={() => handleViewTask(task as TaskActivity)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    {task.lead && (
                      <Tooltip content="Open Lead">
                        <Link href={`/app/leads/${task.lead._id}`} onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            className="action-btn h-9 w-9 p-0 md:opacity-0 md:translate-x-3 md:scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out"
                            style={{ transitionDelay: "50ms" }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </Tooltip>
                    )}
                    <Tooltip content="Delete Task">
                      <Button
                        variant="secondary"
                        className="action-btn h-9 w-9 p-0 md:opacity-0 md:translate-x-3 md:scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out text-danger hover:bg-danger/10"
                        style={{ transitionDelay: "100ms" }}
                        onClick={() => handleOpenDeleteModal(task as TaskActivity)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </TableCell>
              </motion.tr>
              );
            })}
          </motion.tbody>
        </Table>
      )}

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={totalCount}
        hasMore={hasMore}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
      />

      <AnimatePresence>
        {modalOpen && (
          <Suspense fallback={null}>
            <TaskDetailModal
              open={modalOpen}
              onClose={handleCloseModal}
              task={selectedTask}
              onTaskCompleted={handleTaskCompleted}
              onTaskDeleted={handleTaskDeleted}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Create standalone task modal */}
      <Modal
        open={showCreateModal}
        title="New Task"
        description="Create a standalone task not linked to any lead."
        onClose={() => { setShowCreateModal(false); resetCreateForm(); }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowCreateModal(false); resetCreateForm(); }} disabled={isCreatingTask}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={isCreatingTask || !newTaskTitle.trim()}>
              {isCreatingTask ? "Creating..." : "Create Task"}
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <StaggeredDropDown
                value={newTaskType}
                onChange={(val) => setNewTaskType(val as typeof newTaskType)}
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
              <Input
                placeholder="e.g. Site visit, Team meeting, Follow-up call"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Schedule</Label>
            <FlipCalendar
              value={newTaskScheduledAt}
              onChange={setNewTaskScheduledAt}
              showTime
              placeholder="Schedule date/time (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              placeholder="Add details about this task..."
              rows={3}
            />
          </div>
        </motion.div>
      </Modal>

      <Modal
        open={deletingTask !== null}
        title="Delete Task"
        description="This action cannot be undone"
        onClose={handleCloseDeleteModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleCloseDeleteModal}>Cancel</Button>
            <Button
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={deleteConfirmText !== (deletingTask?.title ?? "") || isDeletingTask}
              onClick={handleDeleteTask}
            >
              {isDeletingTask ? "Deleting..." : "Delete task"}
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
          <p className="text-sm text-text-muted">
            To confirm, type <span className="font-semibold text-text">{deletingTask?.title}</span> below:
          </p>
          <Input
            placeholder="Type the task name to confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
        </motion.div>
      </Modal>
    </div>
  );
}
