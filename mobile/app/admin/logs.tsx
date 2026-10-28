/** Logs: email log and audit trail, with category filters (including Sync Stay and Sync Worth). */
import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Body, Card, Chips, EmptyState, List, Select, SearchBar, Stat, StatGrid } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";
import { AUDIT_CATEGORIES, EMAIL_KINDS, EMAIL_STATUSES } from "../../lib/admin/labels";
import { dateTimeLabel, timeAgo } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

type Tab = "email" | "audit";
type AuditCategory = "auth" | "user" | "lead" | "property" | "email" | "system" | "stay" | "worth" | "other";
type EmailStatus = "sent" | "failed" | "dev_logged";

function Summary() {
  const s = useQuery(api.logs.adminLogsSummary);
  return (
    <StatGrid>
      <Stat label="Emails (last 24h)" value={s ? String(s.emails24h) : "-"} />
      <Stat label="Failed emails (24h)" value={s ? String(s.failedEmails24h) : "-"} tone={s && s.failedEmails24h > 0 ? "danger" : undefined} />
      <Stat label="Audit events (24h)" value={s ? String(s.audits24h) : "-"} />
      <Stat label="Recent events (total)" value={s ? String(s.auditCount + s.emailCount) : "-"} />
    </StatGrid>
  );
}

function EmailLogs() {
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const rows = useQuery(api.logs.adminListEmailLogs, {
    status: (status || undefined) as EmailStatus | undefined,
    kind: kind || undefined,
    search: search.trim() || undefined,
    limit: 200,
  });
  return (
    <List
      data={rows}
      keyExtractor={(r) => r._id}
      header={
        <View style={{ gap: space.md }}>
          <Summary />
          <SearchBar value={search} onChangeText={setSearch} placeholder="Recipient, subject, kind" />
          <Select label="Status" value={status} options={[...EMAIL_STATUSES]} onChange={setStatus} />
          <Select label="Kind" value={kind} options={[...EMAIL_KINDS]} onChange={setKind} />
        </View>
      }
      empty={<EmptyState icon="mail-outline" title="No emails recorded yet" message="Email events appear here as soon as the system sends a message." />}
      renderItem={({ item: r }) => (
        <Card style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Body small muted>{dateTimeLabel(r.createdAt)} · {timeAgo(r.createdAt)}</Body>
            <Badge label={r.status === "sent" ? "Sent" : r.status === "failed" ? "Failed" : "Dev"} tone={r.status === "sent" ? "success" : r.status === "failed" ? "danger" : "neutral"} />
          </View>
          <Text style={{ fontSize: font.md, color: colors.text }}>{r.subject}</Text>
          <Body small muted>From {r.from}</Body>
          <Body small muted>To {r.to}</Body>
          <Body small muted>{r.kind}</Body>
          {r.error ? <Body small style={{ color: colors.danger }}>{r.error}</Body> : null}
        </Card>
      )}
    />
  );
}

function AuditLogs() {
  const [category, setCategory] = useState("");
  const rows = useQuery(api.logs.adminListAuditLogs, { category: (category || undefined) as AuditCategory | undefined, limit: 200 });
  return (
    <List
      data={rows}
      keyExtractor={(r) => r._id}
      header={
        <View style={{ gap: space.md }}>
          <Summary />
          <Chips options={[...AUDIT_CATEGORIES]} value={category} onChange={setCategory} />
        </View>
      }
      empty={<EmptyState icon="document-text-outline" title="No audit events yet" message="User actions like login, role changes and password resets appear here." />}
      renderItem={({ item: r }) => (
        <Card style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Body small muted>{dateTimeLabel(r.createdAt)} · {timeAgo(r.createdAt)}</Body>
            <Badge label={r.category} />
          </View>
          <Text style={{ fontSize: font.md, color: colors.text }}>{r.description}</Text>
          <Body small muted>{r.actorLabel || "-"}</Body>
          <Body small muted>
            {r.action}
            {r.targetLabel ? ` → ${r.targetLabel}` : ""}
          </Body>
        </Card>
      )}
    />
  );
}

function Inner() {
  const [tab, setTab] = useState<Tab>("email");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Chips
          options={[
            { value: "email", label: "Email logs" },
            { value: "audit", label: "Audit trail" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "email" ? <EmailLogs /> : <AuditLogs />}
    </View>
  );
}

export default function LogsScreen() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}
