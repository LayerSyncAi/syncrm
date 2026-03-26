"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { leadToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  GripVertical,
  User,
  Phone,
  Mail,
  TrendingUp,
  Clock,
  Trophy,
  XCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

interface KanbanStage {
  _id: Id<"pipelineStages">;
  name: string;
  order: number;
  isTerminal: boolean;
  terminalOutcome: "won" | "lost" | null;
}

interface KanbanLead {
  _id: Id<"leads">;
  contactId: Id<"contacts">;
  fullName: string;
  phone?: string;
  email?: string;
  interestType: string;
  score?: number;
  stageId: Id<"pipelineStages">;
  ownerName: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetCurrency?: string;
  closedAt?: number;
  closeReason?: string;
  updatedAt: number;
  lastActivityAt?: number;
}

interface KanbanBoardProps {
  stages: KanbanStage[];
  columns: Record<string, KanbanLead[]>;
  onSiblingResolution: (lead: KanbanLead) => void;
}

// ─── Touch drag state (shared via context to avoid prop drilling) ────

interface TouchDragState {
  leadId: string | null;
  overStageId: string | null;
  ghostPos: { x: number; y: number } | null;
  onTouchStart: (leadId: string, e: React.TouchEvent) => void;
}

const TouchDragContext = React.createContext<TouchDragState>({
  leadId: null,
  overStageId: null,
  ghostPos: null,
  onTouchStart: () => {},
});

// ─── Helpers ─────────────────────────────────────────────────────────

function formatBudget(min?: number, max?: number, currency?: string) {
  const cur = currency || "USD";
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toLocaleString();
  };
  if (min && max) return `${cur} ${fmt(min)} – ${fmt(max)}`;
  if (min) return `${cur} ${fmt(min)}+`;
  if (max) return `Up to ${cur} ${fmt(max)}`;
  return null;
}

function timeAgo(ts?: number) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function stageColor(stage: KanbanStage) {
  if (stage.isTerminal && stage.terminalOutcome === "won") return "text-success";
  if (stage.isTerminal && stage.terminalOutcome === "lost") return "text-danger";
  return "text-primary";
}

function stageBgAccent(stage: KanbanStage) {
  if (stage.isTerminal && stage.terminalOutcome === "won") return "bg-success/8";
  if (stage.isTerminal && stage.terminalOutcome === "lost") return "bg-danger/8";
  return "bg-primary/5";
}

function stageCountBg(stage: KanbanStage) {
  if (stage.isTerminal && stage.terminalOutcome === "won") return "bg-success/15 text-success";
  if (stage.isTerminal && stage.terminalOutcome === "lost") return "bg-danger/15 text-danger";
  return "bg-primary/15 text-primary";
}

function StageIcon({ stage }: { stage: KanbanStage }) {
  if (stage.isTerminal && stage.terminalOutcome === "won")
    return <Trophy className="h-3.5 w-3.5" />;
  if (stage.isTerminal && stage.terminalOutcome === "lost")
    return <XCircle className="h-3.5 w-3.5" />;
  return null;
}

// ─── Score Badge ─────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | undefined }) {
  if (score === undefined || score === null) return null;
  const color =
    score >= 70
      ? "bg-success/15 text-success"
      : score >= 40
        ? "bg-warning/15 text-warning"
        : "bg-danger/15 text-danger";
  const dotColor =
    score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {score}
    </span>
  );
}

// ─── Kanban Card ─────────────────────────────────────────────────────

const KanbanCard = React.memo(function KanbanCard({
  lead,
  onDragStart,
  isDragging,
}: {
  lead: KanbanLead;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  isDragging: boolean;
}) {
  const router = useRouter();
  const touchDrag = React.useContext(TouchDragContext);
  const budget = formatBudget(lead.budgetMin, lead.budgetMax, lead.budgetCurrency);
  const activity = timeAgo(lead.lastActivityAt);
  const isTouchDragging = touchDrag.leadId === (lead._id as string);

  return (
    <motion.div
      layout
      layoutId={lead._id}
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: isDragging || isTouchDragging ? 0.4 : 1,
        y: 0,
        scale: isDragging || isTouchDragging ? 0.97 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      draggable
      onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, lead._id)}
      onClick={() => {
        // Don't navigate if we just finished a touch drag
        if (!touchDrag.leadId) router.push(`/app/leads/${lead._id}`);
      }}
      onTouchStart={(e) => touchDrag.onTouchStart(lead._id as string, e)}
      className={cn(
        "group relative cursor-grab rounded-[10px] border border-border bg-card-bg p-3 transition-all duration-150",
        "hover:border-border-strong hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
        "active:cursor-grabbing",
        (isDragging || isTouchDragging) && "ring-2 ring-primary/30"
      )}
    >
      {/* Drag handle */}
      <div className="absolute right-1.5 top-1.5 opacity-40 md:opacity-0 md:group-hover:opacity-40 transition-opacity">
        <GripVertical className="h-3.5 w-3.5 text-text-dim" />
      </div>

      {/* Name & Interest */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/app/leads/${lead._id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium text-text hover:text-primary transition-colors leading-snug line-clamp-1"
        >
          {lead.fullName}
        </Link>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            lead.interestType === "buy"
              ? "bg-primary/10 text-primary"
              : "bg-info/10 text-info"
          )}
        >
          {lead.interestType === "buy" ? "Buy" : "Rent"}
        </span>
      </div>

      {/* Contact info */}
      <div className="space-y-0.5 mb-2">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>

      {/* Footer row: score, budget, owner, activity */}
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <ScoreBadge score={lead.score} />
          {budget && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-text-dim">
              <TrendingUp className="h-3 w-3" />
              {budget}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {activity && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-text-dim">
              <Clock className="h-3 w-3" />
              {activity}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[10px] text-text-dim">
            <User className="h-3 w-3" />
            <span className="max-w-[60px] truncate">{lead.ownerName}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
});

// ─── Touch Ghost (floating card preview) ─────────────────────────────

function TouchGhost({ lead, pos }: { lead: KanbanLead; pos: { x: number; y: number } }) {
  return (
    <div
      className="fixed z-[9999] pointer-events-none w-[240px] rounded-[10px] border border-primary/40 bg-card-bg/95 p-3 shadow-xl backdrop-blur-sm"
      style={{
        left: pos.x - 120,
        top: pos.y - 30,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text truncate">{lead.fullName}</span>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            lead.interestType === "buy"
              ? "bg-primary/10 text-primary"
              : "bg-info/10 text-info"
          )}
        >
          {lead.interestType === "buy" ? "Buy" : "Rent"}
        </span>
      </div>
      <p className="text-[11px] text-text-muted mt-1 truncate">
        {lead.phone || lead.email || "No contact info"}
      </p>
    </div>
  );
}

// ─── Kanban Column ───────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  dragOverStageId,
  draggingLeadId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  stage: KanbanStage;
  leads: KanbanLead[];
  dragOverStageId: string | null;
  draggingLeadId: string | null;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDragOver: (e: React.DragEvent, stageId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, stageId: string) => void;
}) {
  const touchDrag = React.useContext(TouchDragContext);
  const isOver = dragOverStageId === (stage._id as string) ||
    touchDrag.overStageId === (stage._id as string);

  return (
    <div
      data-stage-id={stage._id as string}
      className={cn(
        "flex w-[280px] min-w-[280px] flex-col rounded-[12px] border transition-all duration-200",
        isOver
          ? "border-primary/40 bg-primary/5 shadow-[0_0_0_1px_rgba(236,164,0,0.15)]"
          : "border-border bg-surface-2"
      )}
      onDragOver={(e) => onDragOver(e, stage._id as string)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage._id as string)}
    >
      {/* Column header */}
      <div className={cn("flex items-center justify-between gap-2 rounded-t-[12px] px-3 py-2.5", stageBgAccent(stage))}>
        <div className="flex items-center gap-2 min-w-0">
          <StageIcon stage={stage} />
          <h3 className={cn("text-xs font-semibold uppercase tracking-wide truncate", stageColor(stage))}>
            {stage.name}
          </h3>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", stageCountBg(stage))}>
          {leads.length}
        </span>
      </div>

      {/* Drop indicator */}
      <AnimatePresence>
        {isOver && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 3, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-3 rounded-full bg-primary/50"
          />
        )}
      </AnimatePresence>

      {/* Cards list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-border/50 p-2 mb-2">
              <User className="h-4 w-4 text-text-dim" />
            </div>
            <p className="text-[11px] text-text-dim">No leads</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {leads.map((lead) => (
              <KanbanCard
                key={lead._id}
                lead={lead}
                onDragStart={onDragStart}
                isDragging={draggingLeadId === (lead._id as string)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Board ────────────────────────────────────────────────────

export function KanbanBoard({ stages, columns, onSiblingResolution }: KanbanBoardProps) {
  const moveStage = useMutation(api.leads.moveStage);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const sourceStageRef = useRef<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Touch drag state
  const [touchLeadId, setTouchLeadId] = useState<string | null>(null);
  const [touchOverStageId, setTouchOverStageId] = useState<string | null>(null);
  const [touchGhostPos, setTouchGhostPos] = useState<{ x: number; y: number } | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchActive = useRef(false);
  const touchScrollStartX = useRef(0);

  // Find the source stage for the lead being dragged
  const leadStageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [stageId, leads] of Object.entries(columns)) {
      for (const lead of leads) {
        map.set(lead._id as string, stageId);
      }
    }
    return map;
  }, [columns]);

  // Find a lead by ID across all columns
  const findLead = useCallback(
    (leadId: string): KanbanLead | undefined => {
      for (const leads of Object.values(columns)) {
        const found = leads.find((l) => (l._id as string) === leadId);
        if (found) return found;
      }
      return undefined;
    },
    [columns]
  );

  // ─── Shared drop logic ──────────────────────────────────────────

  const executeDrop = useCallback(
    async (leadId: string, targetStageId: string) => {
      const sourceStageId = leadStageMap.get(leadId);
      if (sourceStageId === targetStageId) return;

      const targetStage = stages.find((s) => (s._id as string) === targetStageId);
      if (!targetStage) return;

      const lead = findLead(leadId);
      if (!lead) return;
      if (lead.closedAt && lead.closeReason) {
        leadToasts.stageMoveFailed("This lead is already closed");
        return;
      }

      try {
        await moveStage({
          leadId: leadId as Id<"leads">,
          stageId: targetStageId as Id<"pipelineStages">,
        });
        leadToasts.stageMoved(targetStage.name);

        const isWon = targetStage.isTerminal && targetStage.terminalOutcome === "won";
        const isUnderContract = !targetStage.isTerminal && targetStage.name.toLowerCase() === "under contract";
        if (isWon || isUnderContract) {
          onSiblingResolution(lead);
        }
      } catch (error) {
        leadToasts.stageMoveFailed(
          error instanceof Error ? error.message : undefined
        );
      }
    },
    [leadStageMap, stages, moveStage, findLead, onSiblingResolution]
  );

  // ─── Desktop drag handlers ──────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, leadId: string) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", leadId);
      setDraggingLeadId(leadId);
      sourceStageRef.current = leadStageMap.get(leadId) ?? null;
    },
    [leadStageMap]
  );

  const handleDragOver = useCallback((e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStageId(stageId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStageId(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStageId: string) => {
      e.preventDefault();
      setDragOverStageId(null);
      const leadId = e.dataTransfer.getData("text/plain") || draggingLeadId;
      setDraggingLeadId(null);
      if (!leadId) return;
      sourceStageRef.current = null;
      await executeDrop(leadId, targetStageId);
    },
    [draggingLeadId, executeDrop]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingLeadId(null);
    setDragOverStageId(null);
    sourceStageRef.current = null;
  }, []);

  // ─── Touch drag handlers ────────────────────────────────────────

  // Detect which column is under a touch point
  const getStageAtPoint = useCallback((x: number, y: number): string | null => {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const stageEl = (el as HTMLElement).closest("[data-stage-id]");
      if (stageEl) return stageEl.getAttribute("data-stage-id");
    }
    return null;
  }, []);

  const handleTouchStart = useCallback((leadId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchActive.current = false;
    touchScrollStartX.current = boardRef.current?.scrollLeft ?? 0;
    // We store the leadId but don't activate drag mode yet — wait for movement
    setTouchLeadId(leadId);
  }, []);

  useEffect(() => {
    const DRAG_THRESHOLD = 10;

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchLeadId) return;
      const touch = e.touches[0];
      const start = touchStartPos.current;
      if (!start) return;

      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);

      if (!touchActive.current) {
        // If horizontal movement dominates and exceeds threshold, start drag
        if (dx > DRAG_THRESHOLD && dx > dy) {
          touchActive.current = true;
          e.preventDefault();
        } else if (dy > DRAG_THRESHOLD) {
          // Vertical scroll — cancel touch drag
          setTouchLeadId(null);
          touchStartPos.current = null;
          return;
        } else {
          return;
        }
      }

      e.preventDefault();
      setTouchGhostPos({ x: touch.clientX, y: touch.clientY });

      // Auto-scroll the board when near edges
      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        const edgeZone = 40;
        if (touch.clientX < rect.left + edgeZone) {
          board.scrollLeft -= 8;
        } else if (touch.clientX > rect.right - edgeZone) {
          board.scrollLeft += 8;
        }
      }

      // Detect column under finger
      const stageId = getStageAtPoint(touch.clientX, touch.clientY);
      setTouchOverStageId(stageId);
    };

    const handleTouchEnd = async () => {
      const leadId = touchLeadId;
      const targetStageId = touchOverStageId;
      const wasActive = touchActive.current;

      // Reset all touch state
      setTouchLeadId(null);
      setTouchOverStageId(null);
      setTouchGhostPos(null);
      touchStartPos.current = null;
      touchActive.current = false;

      if (wasActive && leadId && targetStageId) {
        await executeDrop(leadId, targetStageId);
      }
    };

    if (touchLeadId) {
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);
      document.addEventListener("touchcancel", handleTouchEnd);
    }

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [touchLeadId, touchOverStageId, executeDrop, getStageAtPoint]);

  // ─── Touch drag context value ───────────────────────────────────

  const touchDragValue = useMemo<TouchDragState>(
    () => ({
      leadId: touchActive.current ? touchLeadId : null,
      overStageId: touchOverStageId,
      ghostPos: touchGhostPos,
      onTouchStart: handleTouchStart,
    }),
    [touchLeadId, touchOverStageId, touchGhostPos, handleTouchStart]
  );

  // Find the lead being touch-dragged for the ghost
  const touchDragLead = touchLeadId ? findLead(touchLeadId) : null;

  return (
    <TouchDragContext.Provider value={touchDragValue}>
      <div
        ref={boardRef}
        className="flex gap-3 overflow-x-auto pb-4"
        onDragEnd={handleDragEnd}
      >
        {stages.map((stage) => (
          <KanbanColumn
            key={stage._id}
            stage={stage}
            leads={columns[stage._id as string] ?? []}
            dragOverStageId={dragOverStageId}
            draggingLeadId={draggingLeadId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Touch drag ghost */}
      {touchGhostPos && touchDragLead && (
        <TouchGhost lead={touchDragLead} pos={touchGhostPos} />
      )}
    </TouchDragContext.Provider>
  );
}
