"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useRequireAuth } from "@/hooks/useAuth";

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

export default function TasksPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("all");
  const [typeFilter, setTypeFilter] = useState<ActivityType>("all");
  const [selectedTask, setSelectedTask] = useState<TaskActivity | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const tasks = useQuery(api.activities.listAllTasks, {
    status: statusFilter,
    type: typeFilter,
  });

  const handleViewTask = useCallback((task: TaskActivity) => {
    setSelectedTask(task);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSelectedTask(null);
  }, []);

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
    for (const t of tasks) {
      if (t.status === "todo") todo++;
      else if (t.status === "completed") completed++;
    }
    return { todoCount: todo, completedCount: completed };
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tasks</h2>
        <p className="text-sm text-text-muted">
          Manage and track your activities and tasks.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-text-muted uppercase tracking-wide">To Do</p>
          <p className="text-2xl font-semibold mt-1">{todoCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted uppercase tracking-wide">Completed</p>
          <p className="text-2xl font-semibold mt-1">{completedCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted uppercase tracking-wide">Total</p>
          <p className="text-2xl font-semibold mt-1">{tasks?.length ?? 0}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Status</label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus)}
              className="min-w-[140px]"
            >
              <option value="all">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="completed">Completed</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Activity Type</label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ActivityType)}
              className="min-w-[140px]"
            >
              <option value="all">All Types</option>
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="viewing">Viewing</option>
              <option value="note">Note</option>
            </Select>
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
          <tbody>
            {tasks.map((task) => (
              <TableRow key={task._id}>
                <TableCell className="whitespace-nowrap">
                  {task.scheduledAt
                    ? formatDateTime(task.scheduledAt)
                    : formatDateTime(task.createdAt)}
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
                      <p className="text-xs text-text-muted">{task.lead.phone}</p>
                    </div>
                  ) : (
                    <span className="text-text-muted">Unknown</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      task.status === "completed"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }
                  >
                    {task.status === "completed" ? "Completed" : "To Do"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => handleViewTask(task as TaskActivity)}
                    >
                      View Details
                    </Button>
                    {task.lead && (
                      <Link href={`/app/leads/${task.lead._id}`}>
                        <Button variant="ghost" className="h-8 px-3 text-xs">
                          Open Lead
                        </Button>
                      </Link>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {modalOpen && (
        <Suspense fallback={null}>
          <TaskDetailModal
            open={modalOpen}
            onClose={handleCloseModal}
            task={selectedTask}
          />
        </Suspense>
      )}
    </div>
  );
}
