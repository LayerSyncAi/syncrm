"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Mail, MessageSquare, Send, Upload, Users } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MESSAGE_FIELDS, fillTemplate, looksLikeEmail, looksLikePhone, missingFields, routeMessage, smsParts } from "../../../convex/notify/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { parseCSV } from "@/lib/csv";
import { FormError, Section } from "@/components/stay/page-header";

export type Recipient = { key: string; name: string; email: string; phone: string; values: Record<string, string> };
type Channel = "preferred" | "email" | "sms";
type Route = "email" | "sms" | null;
type Imported = { fileName: string; rows: Recipient[]; columns: Array<{ key: string; label: string }>; skipped: number };

const CONTACT_FILTERS = [
  { value: "all", label: "All contacts" },
  { value: "landlords", label: "Landlords" },
  { value: "tenants", label: "Tenants" },
  { value: "sellers", label: "Sellers" },
];

const STARTERS: Array<{ key: string; label: string; subject: string; body: string }> = [
  {
    key: "reminder",
    label: "Payment reminder",
    subject: "Payment reminder from {agency}",
    body: "Dear {name}, this is a reminder that {nextDue} for {item} is due on {nextDueDate}. Thank you, {agency}.",
  },
  {
    key: "overdue",
    label: "Overdue notice",
    subject: "Overdue payment: {item}",
    body: "Dear {name}, our records show {overdue} overdue on {item}. Please pay as soon as you can or contact us to discuss. {agency}.",
  },
  {
    key: "update",
    label: "General update",
    subject: "An update from {agency}",
    body: "Dear {name}, ",
  },
];

/** The server's routing rule, for the preview counts. */
function routeFor(r: Recipient, channel: Channel, s: { emailEnabled: boolean; smsEnabled: boolean; preferredChannel: "email" | "sms" }): Route {
  const res = routeMessage(s, { channel, email: r.email || undefined, phone: r.phone || undefined });
  return "error" in res ? null : res.channel;
}

const fieldKey = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Read a CSV or Excel list: Name, Phone, Email and any other columns as placeholders. */
async function readList(file: File): Promise<Imported> {
  let table: string[][];
  if (/\.csv$/i.test(file.name)) {
    table = parseCSV(await file.text());
  } else {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }).map((r) => r.map((c) => String(c ?? "")));
  }
  if (table.length < 2) throw new Error("The file needs a header row and at least one person.");
  const headers = table[0].map((h) => h.trim());
  const find = (...names: string[]) => headers.findIndex((h) => names.includes(fieldKey(h)));
  const iName = find("name", "full_name", "client", "client_name");
  const iPhone = find("phone", "mobile", "cell", "phone_number", "mobile_number");
  const iEmail = find("email", "email_address", "e_mail");
  if (iName < 0) throw new Error("The file needs a Name column.");
  if (iPhone < 0 && iEmail < 0) throw new Error("The file needs a Phone or Email column.");
  const reserved = new Set(["name", "phone", "email"]);
  const columns: Imported["columns"] = [];
  headers.forEach((h, i) => {
    if (i === iName || i === iPhone || i === iEmail || !h) return;
    const key = fieldKey(h);
    if (!key || reserved.has(key) || columns.some((c) => c.key === key)) return;
    columns.push({ key, label: h });
  });
  const rows: Recipient[] = [];
  let skipped = 0;
  table.slice(1).forEach((r, n) => {
    const name = (r[iName] ?? "").trim();
    const phone = iPhone >= 0 ? (r[iPhone] ?? "").trim() : "";
    const email = iEmail >= 0 ? (r[iEmail] ?? "").trim() : "";
    if (!name || (!phone && !email)) {
      if (r.some((c) => c.trim())) skipped++;
      return;
    }
    const values: Record<string, string> = { name };
    for (const c of columns) values[c.key] = (r[headers.findIndex((h) => fieldKey(h) === c.key)] ?? "").trim();
    rows.push({ key: `row${n + 2}`, name, phone, email, values });
  });
  return { fileName: file.name, rows, columns, skipped };
}

export function SendTab({
  orgName,
  initialAudience,
  initialFilter,
  onViewLog,
}: {
  orgName: string;
  initialAudience?: string;
  initialFilter?: string;
  onViewLog: (campaignId: Id<"notifyCampaigns">) => void;
}) {
  const audiences = useQuery(api.notify.campaigns.audiences);
  const settings = useQuery(api.notify.settings.get);
  const send = useMutation(api.notify.campaigns.send);

  const [source, setSource] = React.useState<"captured" | "import">("captured");
  const [audience, setAudience] = React.useState<string>(initialAudience ?? "");
  const [filter, setFilter] = React.useState<string>(initialFilter ?? "");
  const [imported, setImported] = React.useState<Imported | null>(null);
  const [selection, setSelection] = React.useState<{ list: string; ids: Set<string> } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const [name, setName] = React.useState("");
  const [channel, setChannel] = React.useState<Channel>("preferred");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ campaignId: Id<"notifyCampaigns">; queued: number; failed: number } | null>(null);

  const available = React.useMemo(() => (audiences ?? []).filter((a) => a.available), [audiences]);
  // Fall back to the first audience when the URL named one the user cannot use.
  const activeAudience = available.some((a) => a.key === audience) ? audience : (available[0]?.key ?? "");
  const audienceArg = activeAudience as "contacts" | "staff" | "instalments" | "invoices" | "tenants";
  const filterArg = activeAudience === "contacts" ? filter || "all" : activeAudience === "instalments" || activeAudience === "invoices" ? (filter === "overdue" ? "overdue" : undefined) : undefined;
  const captured = useQuery(api.notify.campaigns.recipients, source === "captured" && activeAudience ? { audience: audienceArg, filter: filterArg } : "skip");

  const list: Recipient[] | undefined = source === "import" ? (imported?.rows ?? []) : captured;
  const listKey = source === "import" ? `import:${imported?.fileName ?? ""}` : `${activeAudience}:${filterArg ?? ""}`;
  const selectedIds = selection?.list === listKey ? selection.ids : new Set((list ?? []).map((r) => r.key));
  const selected = (list ?? []).filter((r) => selectedIds.has(r.key));

  function toggle(key: string) {
    const next = new Set(selectedIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelection({ list: listKey, ids: next });
  }
  function setAll(on: boolean) {
    setSelection({ list: listKey, ids: on ? new Set((list ?? []).map((r) => r.key)) : new Set() });
  }

  async function onFile(file: File) {
    try {
      const res = await readList(file);
      setImported(res);
      setResult(null);
      if (!res.rows.length) animatedToast.error("No one to message", { description: "Every row needs a name and a phone or email." });
    } catch (e) {
      animatedToast.error("Could not read the list", { description: getErrorMessage(e) });
    }
  }

  function insertField(key: string) {
    const token = `{${key}}`;
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const fields = [
    ...(source === "import" ? [{ key: "name", label: "Name" }, { key: "agency", label: "Agency name" }] : MESSAGE_FIELDS.map((f) => ({ key: f.key, label: f.label }))),
    ...(source === "import" ? (imported?.columns ?? []) : []),
  ];

  const valuesFor = (r: Recipient) => ({ agency: orgName, ...r.values, name: r.values.name ?? r.name });

  const s = settings ?? { emailEnabled: true, smsEnabled: false, preferredChannel: "email" as const };
  const routes = selected.map((r) => routeFor(r, channel, s));
  const byEmail = routes.filter((r) => r === "email").length;
  const bySms = routes.filter((r) => r === "sms").length;
  const noAddress = routes.filter((r) => r === null).length;
  const withMissing = selected.filter((r) => missingFields(`${subject} ${body}`, valuesFor(r)).length > 0).length;
  const needsSubject = channel === "email" || (channel === "preferred" && byEmail > 0);

  async function doSend() {
    setError(null);
    if (!selected.length) return setError("Pick at least one recipient.");
    if (selected.length > 1000) return setError("Send to at most 1,000 people at a time.");
    if (!body.trim()) return setError("Write the message.");
    if (needsSubject && !subject.trim()) return setError("Add a subject for the email.");
    setSending(true);
    try {
      const res = await send({
        name: name.trim(),
        channel,
        audience: source === "import" ? "import" : activeAudience,
        subject: channel === "sms" ? undefined : subject.trim() || undefined,
        template: body,
        recipients: selected.map((r) => ({ name: r.name, email: r.email || undefined, phone: r.phone || undefined, values: r.values })),
      });
      setResult(res);
      animatedToast.success("Messages on their way", { description: `${res.queued} queued, ${res.failed} failed` });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  if (audiences === undefined || settings === undefined) return <ListSkeleton />;

  if (result) {
    return (
      <Section title="Sent">
        <div className="space-y-4 text-sm">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--status-success-fg)]" />
            {result.queued} message{result.queued === 1 ? "" : "s"} queued for delivery.
          </p>
          {result.failed > 0 && (
            <p className="text-danger">
              {result.failed} could not be sent, usually because there was no usable address. The log shows why for each one.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onViewLog(result.campaignId)}>
              See these messages in the log
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Write another
            </Button>
          </div>
        </div>
      </Section>
    );
  }

  const audienceInfo = available.find((a) => a.key === activeAudience);

  return (
    <div className="space-y-6">
      <Section title="1. Choose recipients">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup">
            <Button variant={source === "captured" ? "primary" : "secondary"} size="sm" className="gap-1" onClick={() => setSource("captured")}>
              <Users className="h-4 w-4" />
              From your data
            </Button>
            <Button variant={source === "import" ? "primary" : "secondary"} size="sm" className="gap-1" onClick={() => setSource("import")}>
              <FileSpreadsheet className="h-4 w-4" />
              Import a list
            </Button>
          </div>

          {source === "captured" ? (
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[220px] space-y-2">
                <Label htmlFor="audience">Who</Label>
                <Select
                  id="audience"
                  value={activeAudience}
                  onChange={(e) => {
                    setAudience(e.target.value);
                    setFilter("");
                  }}
                >
                  {available.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </div>
              {activeAudience === "contacts" && (
                <div className="min-w-[180px] space-y-2">
                  <Label htmlFor="contact-filter">Show</Label>
                  <Select id="contact-filter" value={filter || "all"} onChange={(e) => setFilter(e.target.value)}>
                    {CONTACT_FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {(activeAudience === "instalments" || activeAudience === "invoices") && (
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input type="checkbox" checked={filter === "overdue"} onChange={(e) => setFilter(e.target.checked ? "overdue" : "")} />
                  Overdue only
                </label>
              )}
              {audienceInfo && <p className="w-full text-xs text-text-muted">{audienceInfo.hint}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-muted">
                A CSV or Excel file with Name, Phone and Email columns. Any other column, such as Amount or Plot, becomes a placeholder you can use in the message.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" className="gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {imported ? "Choose another file" : "Choose file"}
              </Button>
              {imported && (
                <p className="text-sm text-text-muted">
                  {imported.fileName}: {imported.rows.length} people
                  {imported.skipped > 0 && `, ${imported.skipped} rows left out with no name or address`}
                  {imported.columns.length > 0 && `. Extra placeholders: ${imported.columns.map((c) => `{${c.key}}`).join(", ")}`}
                </p>
              )}
            </div>
          )}

          <RecipientList list={list} selectedIds={selectedIds} onToggle={toggle} onAll={setAll} />
        </div>
      </Section>

      <Section title="2. Write the message">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="send-name">Name for this send</Label>
              <Input id="send-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="October instalment reminders" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel">Channel</Label>
              <Select id="channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="preferred">Agency preferred ({s.preferredChannel === "sms" ? "SMS" : "email"} first)</option>
                <option value="email" disabled={!s.emailEnabled}>
                  Email{s.emailEnabled ? "" : " (switched off)"}
                </option>
                <option value="sms" disabled={!s.smsEnabled}>
                  SMS{s.smsEnabled ? "" : " (switched off)"}
                </option>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Start from:</span>
            {STARTERS.map((t) => (
              <Button
                key={t.key}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSubject(t.subject);
                  setBody(t.body);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {channel !== "sms" && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject{channel === "preferred" ? " (for messages sent by email)" : ""}</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea id="body" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Dear {name}, ..." />
            <div className="flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => insertField(f.key)}
                  className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary-600 hover:text-text"
                  title={`Insert {${f.key}}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted">Click a field to add it to the message. Each person gets their own value.</p>
          </div>

          <Preview recipients={selected.slice(0, 3)} routes={routes.slice(0, 3)} subject={subject} body={body} channel={channel} valuesFor={valuesFor} />
        </div>
      </Section>

      <Section title="3. Send">
        <div className="space-y-3 text-sm">
          <ul className="space-y-1">
            <li>
              {selected.length} recipient{selected.length === 1 ? "" : "s"} selected
              {selected.length > 0 && `: ${byEmail} by email, ${bySms} by SMS`}.
            </li>
            {noAddress > 0 && (
              <li className="text-[var(--status-warning-fg)]">
                {noAddress} {noAddress === 1 ? "has" : "have"} no usable {channel === "email" ? "email address" : channel === "sms" ? "phone number" : "email or phone"} and will be logged as failed.
              </li>
            )}
            {withMissing > 0 && (
              <li className="text-[var(--status-warning-fg)]">
                {withMissing} {withMissing === 1 ? "message has" : "messages have"} a field with no value. It will show as typed, for example {"{nextDue}"}.
              </li>
            )}
          </ul>
          <FormError message={error} />
          <Button onClick={doSend} disabled={sending || !selected.length || !body.trim()} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : `Send to ${selected.length} ${selected.length === 1 ? "person" : "people"}`}
          </Button>
        </div>
      </Section>
    </div>
  );
}

function RecipientList({
  list,
  selectedIds,
  onToggle,
  onAll,
}: {
  list: Recipient[] | undefined;
  selectedIds: Set<string>;
  onToggle: (key: string) => void;
  onAll: (on: boolean) => void;
}) {
  if (list === undefined) return <ListSkeleton rows={4} />;
  if (!list.length) return <p className="text-sm text-text-muted">No one matches.</p>;
  const count = list.filter((r) => selectedIds.has(r.key)).length;
  const all = count === list.length;
  return (
    <div className="rounded-[10px] border border-border-strong">
      <label className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
        <input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} />
        Select all ({count} of {list.length})
      </label>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {list.map((r) => {
          const hasEmail = looksLikeEmail(r.email);
          const hasPhone = looksLikePhone(r.phone);
          const extra = r.values.overdue && r.values.overdue !== "" && !/\s0$/.test(r.values.overdue) ? `${r.values.overdue} overdue` : r.values.owed ? `${r.values.owed} owed` : "";
          return (
            <li key={r.key}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-row-hover">
                <input type="checkbox" checked={selectedIds.has(r.key)} onChange={() => onToggle(r.key)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-text-muted">{[r.values.item, extra].filter(Boolean).join(", ")}</span>
                </span>
                <span className="flex shrink-0 gap-1.5" aria-label="Addresses">
                  <Badge variant={hasEmail ? "success" : "neutral"} className="gap-1 px-2" title={r.email || "No email"}>
                    <Mail className="h-3 w-3" />
                    {hasEmail ? "Email" : "No email"}
                  </Badge>
                  <Badge variant={hasPhone ? "success" : "neutral"} className="gap-1 px-2" title={r.phone || "No phone"}>
                    <MessageSquare className="h-3 w-3" />
                    {hasPhone ? "Phone" : "No phone"}
                  </Badge>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Preview({
  recipients,
  routes,
  subject,
  body,
  channel,
  valuesFor,
}: {
  recipients: Recipient[];
  routes: Route[];
  subject: string;
  body: string;
  channel: Channel;
  valuesFor: (r: Recipient) => Record<string, string>;
}) {
  if (!body.trim() || !recipients.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-muted">Preview of the first {recipients.length}</p>
      <div className="grid gap-3 lg:grid-cols-3">
        {recipients.map((r, i) => {
          const values = valuesFor(r);
          const text = fillTemplate(body, values);
          const missing = missingFields(`${channel === "sms" ? "" : subject} ${body}`, values);
          const route = routes[i];
          return (
            <div key={r.key} className="space-y-2 rounded-[10px] border border-border-strong p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{r.name}</span>
                <Badge variant={route ? "info" : "warning"} className="px-2">
                  {route === "email" ? "Email" : route === "sms" ? "SMS" : "No address"}
                </Badge>
              </div>
              {route !== "sms" && channel !== "sms" && subject.trim() && <p className="font-medium">{fillTemplate(subject, values)}</p>}
              <p className="whitespace-pre-wrap break-words text-text-muted">{text}</p>
              {route === "sms" && (
                <p className="text-xs text-text-muted">
                  {text.length} characters, {smsParts(text)} SMS part{smsParts(text) === 1 ? "" : "s"}
                </p>
              )}
              {missing.length > 0 && (
                <p className="flex items-start gap-1 text-xs text-[var(--status-warning-fg)]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  No value for {missing.map((m) => `{${m}}`).join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
