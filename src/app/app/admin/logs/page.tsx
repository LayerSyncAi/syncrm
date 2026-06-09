"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  ScrollText,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "audit" | "email";

type AuditCategory =
  | "auth"
  | "user"
  | "lead"
  | "property"
  | "email"
  | "system"
  | "other";

type EmailStatus = "sent" | "failed" | "dev_logged";

const AUDIT_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All categories" },
  { value: "auth", label: "Auth" },
  { value: "user", label: "User" },
  { value: "lead", label: "Lead" },
  { value: "property", label: "Property" },
  { value: "email", label: "Email" },
  { value: "system", label: "System" },
  { value: "other", label: "Other" },
];

const EMAIL_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "dev_logged", label: "Dev (no API key)" },
];

const EMAIL_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All kinds" },
  { value: "password_reset", label: "Password reset" },
  { value: "activity_pre_reminder", label: "Activity pre-reminder" },
  { value: "activity_overdue_reminder", label: "Activity overdue" },
  { value: "daily_digest", label: "Daily digest" },
];

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function LogsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [tab, setTab] = useState<Tab>("email");
  const [auditCategory, setAuditCategory] = useState<string>("");
  const [emailStatus, setEmailStatus] = useState<string>("");
  const [emailKind, setEmailKind] = useState<string>("");
  const [emailSearch, setEmailSearch] = useState<string>("");

  const summary = useQuery(api.logs.adminLogsSummary);
  const auditLogs = useQuery(api.logs.adminListAuditLogs, {
    category: (auditCategory || undefined) as AuditCategory | undefined,
    limit: 200,
  });
  const emailLogs = useQuery(api.logs.adminListEmailLogs, {
    status: (emailStatus || undefined) as EmailStatus | undefined,
    kind: emailKind || undefined,
    search: emailSearch.trim() || undefined,
    limit: 200,
  });

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  const auditLoading = auditLogs === undefined;
  const emailLoading = emailLogs === undefined;

  const tabs = useMemo(
    () =>
      [
        { id: "email" as const, label: "Email logs", icon: Mail },
        { id: "audit" as const, label: "Audit trail", icon: ScrollText },
      ],
    []
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-h1">Logs</h1>
        <p className="text-sm text-text-muted">
          Audit trail of user activity and a timestamped log of every email
          triggered from the system.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          icon={<Mail className="h-4 w-4" />}
          label="Emails (last 24h)"
          value={summary ? summary.emails24h : "—"}
        />
        <SummaryCard
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          label="Failed emails (24h)"
          value={summary ? summary.failedEmails24h : "—"}
          tone={summary && summary.failedEmails24h > 0 ? "danger" : "default"}
        />
        <SummaryCard
          icon={<Activity className="h-4 w-4" />}
          label="Audit events (24h)"
          value={summary ? summary.audits24h : "—"}
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="Recent events (total)"
          value={summary ? summary.auditCount + summary.emailCount : "—"}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-primary-600"
                  : "text-text-muted hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="logs-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Email tab */}
      {tab === "email" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full max-w-xs">
              <Input
                placeholder="Search by recipient, subject, kind…"
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
              />
            </div>
            <div className="w-48">
              <StaggeredDropDown
                value={emailStatus}
                onChange={(v) => setEmailStatus(v)}
                options={EMAIL_STATUS_OPTIONS}
              />
            </div>
            <div className="w-56">
              <StaggeredDropDown
                value={emailKind}
                onChange={(v) => setEmailKind(v)}
                options={EMAIL_KIND_OPTIONS}
              />
            </div>
          </div>

          {emailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : !emailLogs || emailLogs.length === 0 ? (
            <EmptyState
              icon={<Mail className="h-6 w-6 text-text-muted" />}
              title="No emails recorded yet"
              hint="Email events will appear here as soon as the system sends a message."
            />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Timestamp</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-40">Kind</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailLogs.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="align-top">
                        <div className="text-xs font-mono">
                          {formatTimestamp(row.createdAt)}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {timeAgo(row.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <EmailStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="align-top text-xs text-text-muted break-all">
                        {row.from}
                      </TableCell>
                      <TableCell className="align-top text-xs break-all">
                        {row.to}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm">{row.subject}</div>
                        {row.error && (
                          <div className="mt-1 text-[11px] text-red-600 break-words">
                            {row.error}
                          </div>
                        )}
                        {row.messageId && row.status === "sent" && (
                          <div className="mt-1 text-[10px] font-mono text-text-muted break-all">
                            id: {row.messageId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-xs text-text-muted">
                        {row.kind}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Audit tab */}
      {tab === "audit" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <StaggeredDropDown
                value={auditCategory}
                onChange={(v) => setAuditCategory(v)}
                options={AUDIT_CATEGORY_OPTIONS}
              />
            </div>
          </div>

          {auditLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-6 w-6 text-text-muted" />}
              title="No audit events yet"
              hint="User actions like login, role changes, and password resets will appear here."
            />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Timestamp</TableHead>
                    <TableHead className="w-28">Category</TableHead>
                    <TableHead className="w-48">Actor</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="align-top">
                        <div className="text-xs font-mono">
                          {formatTimestamp(row.createdAt)}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {timeAgo(row.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="secondary">{row.category}</Badge>
                      </TableCell>
                      <TableCell className="align-top text-xs">
                        {row.actorLabel || "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm">{row.description}</div>
                        <div className="mt-1 text-[11px] font-mono text-text-muted">
                          {row.action}
                          {row.targetLabel ? ` → ${row.targetLabel}` : ""}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "danger"
          ? "border-red-200 bg-red-50/40"
          : "border-border bg-background"
      )}
    >
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "danger" ? "text-red-600" : "text-text"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmailStatusBadge({ status }: { status: EmailStatus }) {
  if (status === "sent") {
    return (
      <Badge variant="success" className="inline-flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Sent
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="danger" className="inline-flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="inline-flex items-center gap-1">
      <Clock className="h-3 w-3" />
      Dev
    </Badge>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-text-muted">{hint}</p>
    </div>
  );
}
