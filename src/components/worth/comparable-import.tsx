"use client";

/** Excel import of comparables and past valuations (VW-34). */
import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { downloadXlsx, readFirstSheet } from "@/lib/worth/export";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS, chunk, parseSheet, type ImportKind, type ImportRow } from "@/lib/worth/import";
import { ErrorNote, Field, worthToast } from "./ui";

export function downloadTemplate() {
  return downloadXlsx("sync-worth-comparables-template", [
    { name: "Comparables", headers: [...TEMPLATE_HEADERS], rows: [TEMPLATE_EXAMPLE] },
  ]);
}

export function ComparableImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importBatch = useMutation(api.worth.comparables.importBatch);
  const [kind, setKind] = React.useState<ImportKind>("sale");
  const [sheet, setSheet] = React.useState<unknown[][] | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ imported: number; errors: Array<{ rowNumber: number; message: string }> } | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSheet(null);
      setFileName("");
      setError(null);
      setResult(null);
    }
  }, [open]);

  const parsed = React.useMemo(() => (sheet ? parseSheet(sheet, kind) : null), [sheet, kind]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      setSheet(await readFirstSheet(file));
      setFileName(file.name);
    } catch (e) {
      setError(getErrorMessage(e, "Could not read that file"));
    }
  };

  const run = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    let imported = 0;
    const errors = [...parsed.errors];
    try {
      for (const batch of chunk<ImportRow>(parsed.rows, 200)) {
        const res = await importBatch({ rows: batch });
        imported += res.imported;
        errors.push(...res.errors);
      }
      setResult({ imported, errors: errors.sort((a, b) => a.rowNumber - b.rowNumber) });
      worthToast.done("Import finished", `${imported} rows imported`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Import from Excel"
      description="Bring in past sales, rentals and valuations. The first row must hold column names; download the template to see them."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => downloadTemplate()}>
            Download template
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button onClick={run} disabled={busy || !parsed || parsed.rows.length === 0}>
                {busy ? "Importing..." : `Import ${parsed?.rows.length ?? 0} rows`}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Spreadsheet (.xlsx, .xls or .csv)">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="block w-full text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </Field>
          <Field label="Rows without a Kind column are" hint="Choose Past valuations for a sheet of old reports.">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ImportKind)}>
              <option value="sale">Sales</option>
              <option value="rental">Rentals</option>
              <option value="valuation">Past valuations</option>
            </Select>
          </Field>
        </div>

        {parsed && parsed.missing.length > 0 && (
          <ErrorNote message={`${fileName} has no column for: ${parsed.missing.join(", ")}.`} />
        )}
        {parsed && parsed.missing.length === 0 && !result && (
          <p className="text-sm">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready
            {parsed.errors.length > 0 ? `, ${parsed.errors.length} will be skipped:` : "."}
          </p>
        )}
        {result && (
          <p className="text-sm font-medium">
            Imported {result.imported} row{result.imported === 1 ? "" : "s"}
            {result.errors.length ? `. ${result.errors.length} skipped:` : "."}
          </p>
        )}
        {(result?.errors ?? parsed?.errors ?? []).length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-[10px] bg-surface-2 p-3 text-xs">
            {(result?.errors ?? parsed?.errors ?? []).map((e) => (
              <li key={`${e.rowNumber}-${e.message}`}>
                Row {e.rowNumber}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
