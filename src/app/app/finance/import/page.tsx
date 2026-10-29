"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, FileDown, FileSpreadsheet, Lock, RotateCcw, Upload, XCircle } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { animatedToast } from "@/components/ui/animated-toaster";
import { Tabs } from "@/components/worth/ui";
import { getErrorMessage } from "@/lib/errors";
import { dateLabel, periodLabel } from "@/lib/finance/format";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import {
  BATCH_SIZE,
  IMPORT_SPECS,
  batches,
  downloadTemplate,
  parseOpeningRows,
  parseStandRows,
  parseTransactionRows,
  readSheet,
  rowLabel,
  type ImportError,
  type ImportKind,
  type OpeningRow,
  type Parsed,
  type StandRow,
  type TransactionRow,
} from "@/lib/finance/import";

type AnyRow = OpeningRow | TransactionRow | StandRow;
type RowResult = { row: number; ok: boolean; message?: string };

const KIND_LABELS: Record<string, string> = {
  opening: "Opening balances",
  transactions: "Historical transactions",
  stands: "Clients on instalments",
};

export default function FinanceImportPage() {
  const data = useQuery(api.finance.settings.get);
  const [tab, setTab] = React.useState<ImportKind>("opening");

  if (data === undefined) return <ListSkeleton />;
  if (!data.role.isDirector) {
    return (
      <EmptyState
        icon={Lock}
        title="Directors only"
        description="Ask a director to import opening balances, past transactions and instalment clients."
        action={
          <Link href="/app/finance">
            <Button variant="secondary">Back to Finance</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <StayPageHeader
        title="Import and migrate"
        description="Move your agency onto Sync Finance from Excel and receipt books. Each import can be undone as a whole."
        back={{ href: "/app/finance/settings", label: "Finance settings" }}
      />

      <Tabs<ImportKind>
        tabs={[
          { key: "opening", label: "Opening balances" },
          { key: "transactions", label: "Historical transactions" },
          { key: "stands", label: "Clients on instalments" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <ImportPanel key={tab} kind={tab} today={data.today} lockedThrough={data.settings.lockedThrough} />

      <StayReceipts today={data.today} />

      <ImportHistory />
    </div>
  );
}

// ── One import ───────────────────────────────────────────────────────

function KindIntro({ kind }: { kind: ImportKind }) {
  if (kind === "opening") {
    return (
      <div className="space-y-3 text-sm text-text-muted">
        <p>Balances on the day you start using Sync Finance: each bank account and cash float, what you hold for each landlord and each tenant deposit.</p>
        <p>
          Trust account balances start as unallocated. Each landlord and deposit balance is taken from it, so what is left shows money nobody has been matched to yet.
        </p>
        <div className="flex gap-2 rounded-lg bg-[var(--status-warning-bg)] p-3 text-[var(--status-warning-fg)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>If tenant deposits were already brought in by the Sync Stay import while Finance was on, do not import them again.</p>
        </div>
      </div>
    );
  }
  if (kind === "transactions") {
    return (
      <p className="text-sm text-text-muted">
        Past receipts and payments from a receipt book or Excel, keeping their original numbers. Accounts must exist first in{" "}
        <Link href="/app/finance/settings" className="text-primary-600 hover:underline">
          Finance settings
        </Link>
        .
      </p>
    );
  }
  return (
    <p className="text-sm text-text-muted">
      Buyers already paying for stands, with what they have paid so far. Developments must exist first under{" "}
      <Link href="/app/finance/instalments" className="text-primary-600 hover:underline">
        Instalments
      </Link>
      .
    </p>
  );
}

function ImportPanel({ kind, today, lockedThrough }: { kind: ImportKind; today: string; lockedThrough?: string }) {
  const spec = IMPORT_SPECS[kind];
  const start = useMutation(api.finance.importer.start);
  const openingBatch = useMutation(api.finance.importer.openingBatch);
  const transactionsBatch = useMutation(api.finance.importer.transactionsBatch);
  const standsBatch = useMutation(api.finance.importer.standsBatch);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<Parsed<AnyRow> | null>(null);
  const [goLive, setGoLive] = React.useState(today);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [results, setResults] = React.useState<RowResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(file: File) {
    setResults(null);
    setError(null);
    setFileName(file.name);
    try {
      const raw = await readSheet(file);
      const p: Parsed<AnyRow> =
        kind === "opening" ? parseOpeningRows(raw) : kind === "transactions" ? parseTransactionRows(raw) : parseStandRows(raw);
      if (!p.fatal && !p.rows.length && !p.errors.length) p.fatal = "The file has no rows.";
      setParsed(p);
    } catch (e) {
      setParsed(null);
      animatedToast.error("Could not read the file", { description: getErrorMessage(e) });
    }
  }

  function goLiveError(): string | null {
    if (kind !== "opening") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(goLive)) return "Pick the go-live date.";
    if (goLive > today) return "The go-live date cannot be in the future.";
    if (lockedThrough && goLive.slice(0, 7) <= lockedThrough) return `${periodLabel(goLive.slice(0, 7), true)} is closed. Pick a date in an open month.`;
    return null;
  }

  async function run() {
    if (!parsed?.rows.length || !fileName) return;
    const gl = goLiveError();
    if (gl) return setError(gl);
    setError(null);
    setRunning(true);
    setProgress(0);
    const all: RowResult[] = [];
    try {
      const importId: Id<"finImports"> = await start({ kind, fileName, rowCount: parsed.rows.length });
      for (const batch of batches(parsed.rows, BATCH_SIZE)) {
        const res =
          kind === "opening"
            ? await openingBatch({ importId, date: goLive, rows: batch as OpeningRow[] })
            : kind === "transactions"
              ? await transactionsBatch({ importId, rows: batch as TransactionRow[] })
              : await standsBatch({ importId, rows: batch as StandRow[] });
        all.push(...res);
        setProgress(all.length);
      }
      const ok = all.filter((r) => r.ok).length;
      animatedToast.success("Import finished", { description: `${ok} of ${all.length} rows imported` });
    } catch (e) {
      animatedToast.error("Import stopped", { description: getErrorMessage(e) });
    } finally {
      setResults(all);
      setRunning(false);
    }
  }

  const byRow = new Map(parsed?.rows.map((r) => [r.row, r]) ?? []);
  const okCount = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="space-y-6">
      <Section title={`1. ${spec.title}: fill in the template`}>
        <div className="space-y-4">
          <KindIntro kind={kind} />
          <Button variant="secondary" onClick={() => downloadTemplate(kind)} className="gap-2">
            <FileDown className="h-4 w-4" />
            Download template
          </Button>
          <p className="text-xs text-text-muted">The template has a Notes sheet that explains each column.</p>
        </div>
      </Section>

      <Section title="2. Upload it">
        <div className="space-y-4">
          {kind === "opening" && (
            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="golive">Go-live date</Label>
              <Input id="golive" type="date" max={today} value={goLive} disabled={running} onChange={(e) => setGoLive(e.target.value)} />
              <p className="text-xs text-text-muted">Every balance in the file is recorded on this date.</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <div>
            <Button onClick={() => fileRef.current?.click()} disabled={running} className="gap-2">
              <Upload className="h-4 w-4" />
              {fileName ? "Choose another file" : "Choose file"}
            </Button>
            {fileName && (
              <p className="mt-2 flex items-center gap-2 text-sm text-text-muted">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </p>
            )}
          </div>
        </div>
      </Section>

      {parsed && (
        <Section title="3. Check and import">
          <div className="space-y-4">
            <FormError message={parsed.fatal ?? error} />
            {!parsed.fatal && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                  <div className="rounded-[10px] bg-surface-2 p-3">
                    <p className="text-xs text-text-muted">Rows ready</p>
                    <p className="text-lg font-semibold">{parsed.rows.length}</p>
                  </div>
                  <div className="rounded-[10px] bg-surface-2 p-3">
                    <p className="text-xs text-text-muted">Rows with errors</p>
                    <p className={`text-lg font-semibold ${parsed.errors.length ? "text-danger" : ""}`}>{parsed.errors.length}</p>
                  </div>
                </div>
                <RowErrors errors={parsed.errors} note="These rows will be left out. Fix them in the file and upload again, or import the rest now." />
                {parsed.rows.length > 0 && !results && (
                  <Button onClick={run} disabled={running} className="h-12 w-full sm:h-10 sm:w-auto">
                    {running ? `Importing ${progress} of ${parsed.rows.length}...` : `Import ${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"}`}
                  </Button>
                )}
              </>
            )}
          </div>
        </Section>
      )}

      {results && (
        <Section title="Results">
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--status-success-fg)]" />
              {okCount} of {parsed?.rows.length ?? results.length} rows imported.
            </p>
            {results.length < (parsed?.rows.length ?? 0) && (
              <p className="text-danger">The import stopped before the end. Undo it below and try again, or import the remaining rows in a new file.</p>
            )}
            {failed.length > 0 && (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {failed.map((r) => {
                  const src = byRow.get(r.row);
                  return (
                    <li key={r.row} className="flex items-start gap-2 py-2">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                      <div className="min-w-0">
                        <p className="font-medium">
                          Row {r.row}
                          {src ? `: ${rowLabel(kind, src)}` : ""}
                        </p>
                        <p className="text-text-muted">{r.message}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function RowErrors({ errors, note }: { errors: ImportError[]; note: string }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-lg bg-danger/10 p-3 text-sm">
      <p className="font-medium text-danger">{note}</p>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {errors.map((e, i) => (
          <li key={i}>
            Row {e.row}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Sync Stay receipts ───────────────────────────────────────────────

function StayReceipts({ today }: { today: string }) {
  const bringIn = useMutation(api.finance.posting.bringInStayPayments);
  const [from, setFrom] = React.useState(`${today.slice(0, 7)}-01`);
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState<{ posted: number; skipped: number; errors: string[]; stuck: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(null);
    let posted = 0;
    try {
      // Each call handles up to 150 receipts. Skipped and failed receipts are
      // tried again on every call, so the last call's counts cover them all.
      for (let i = 0; i < 200; i++) {
        const res = await bringIn({ from });
        posted += res.posted;
        const last = { posted, skipped: res.skipped, errors: res.errors, stuck: 0 };
        setDone(last);
        if (res.remaining === 0) break;
        if (res.posted === 0) {
          setDone({ ...last, stuck: res.remaining });
          break;
        }
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section title="Bring in Sync Stay receipts">
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Posts rent and deposit receipts recorded in Sync Stay from this date into Finance, so you do not type them again. Receipts already in Finance are left alone.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="stay-from">Receipts paid on or after</Label>
            <Input id="stay-from" type="date" max={today} value={from} disabled={running} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <Button onClick={run} disabled={running || !from}>
            {running ? "Bringing in..." : "Bring in receipts"}
          </Button>
        </div>
        <FormError message={error} />
        {done && (
          <div className="space-y-2 text-sm">
            <p>
              {done.posted} posted, {done.skipped} skipped, {done.errors.length} with errors.
            </p>
            {done.stuck > 0 && <p className="text-[var(--status-warning-fg)]">{done.stuck} more receipts could not be reached because earlier ones keep failing. Fix the errors below and run it again.</p>}
            {done.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-danger/10 p-3">
                {done.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── History and undo ─────────────────────────────────────────────────

function ImportHistory() {
  const list = useQuery(api.finance.importer.list);
  const undo = useMutation(api.finance.importer.undo);
  const [target, setTarget] = React.useState<{ id: Id<"finImports">; name: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState<string | null>(null);

  async function confirm() {
    if (!target) return;
    if (!reason.trim()) return setError("Say why you are undoing this import.");
    setBusy(true);
    setError(null);
    try {
      const res = await undo({ importId: target.id, reason });
      animatedToast.success("Import undone", { description: `${res.reversed} transactions reversed, ${res.cancelled} plans cancelled` });
      setTarget(null);
      setReason("");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import history">
      {list === undefined ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing imported yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Import</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>By</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((imp) => (
              <React.Fragment key={imp._id}>
                <TableRow>
                  <TableCell className="whitespace-nowrap">{dateLabel(new Date(imp.createdAt).toISOString().slice(0, 10))}</TableCell>
                  <TableCell>{KIND_LABELS[imp.kind] ?? imp.kind}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{imp.fileName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {imp.okCount} of {imp.rowCount}
                    {imp.errors.length > 0 && (
                      <button type="button" className="ml-2 text-danger hover:underline" onClick={() => setShowErrors(showErrors === imp._id ? null : imp._id)}>
                        {imp.errors.length} failed
                      </button>
                    )}
                  </TableCell>
                  <TableCell>{imp.by}</TableCell>
                  <TableCell className="text-right">
                    {imp.undoneAt ? (
                      <Badge variant="neutral">Undone</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setTarget({ id: imp._id, name: imp.fileName })}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Undo
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {showErrors === imp._id && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-2">
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                        {imp.errors.map((e, i) => (
                          <li key={i}>
                            Row {e.row}: {e.message}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={!!target}
        title="Undo this import"
        description={target?.name}
        onClose={() => {
          setTarget(null);
          setError(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={busy}>
              {busy ? "Undoing..." : "Undo import"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            This reverses everything the import posted and cancels the instalment plans it added. The reversals are dated today, so closed months stay as they are.
          </p>
          <div className="space-y-2">
            <Label htmlFor="undo-reason">Reason</Label>
            <Textarea id="undo-reason" className="min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong go-live date" />
          </div>
          <FormError message={error} />
        </div>
      </Modal>
    </Section>
  );
}
