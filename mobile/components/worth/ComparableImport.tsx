/**
 * Spreadsheet import of comparables and past valuations (VW-34). Reads an
 * Excel workbook (first sheet) or a CSV file.
 * Rows are mapped with the website's own parser and sent in batches.
 */
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useMutation } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS, chunk, parseSheet, type ImportKind } from "@/lib/worth/import";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Notice, Select, Sheet } from "../ui";
import { pickDocument } from "../../lib/files";
import { readAsCsv } from "../../lib/sheets";
import { useRun } from "../../lib/useRun";
import { colors, font, radius, space } from "../../lib/theme";
import { parseCsv, shareCsv } from "../../lib/worth/files";
import { ErrorNote } from "./bits";

type Result = { imported: number; errors: Array<{ rowNumber: number; message: string }> };

export function shareTemplate() {
  return shareCsv("sync-worth-comparables-template.csv", [...TEMPLATE_HEADERS], [TEMPLATE_EXAMPLE]);
}

export function ComparableImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importBatch = useMutation(api.worth.comparables.importBatch);
  const { run } = useRun();
  const [kind, setKind] = useState<ImportKind>("sale");
  const [sheet, setSheet] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!open) {
      setSheet(null);
      setFileName("");
      setError(null);
      setResult(null);
    }
  }, [open]);

  const parsed = useMemo(() => (sheet ? parseSheet(sheet, kind) : null), [sheet, kind]);

  const choose = async () => {
    setError(null);
    setResult(null);
    const file = await pickDocument(["text/csv", "text/comma-separated-values", "text/plain", "application/csv", "*/*"]);
    if (!file) return;
    try {
      setSheet(parseCsv(await readAsCsv(file)));
      setFileName(file.name);
    } catch (e) {
      setError(getErrorMessage(e, "Could not read that file"));
    }
  };

  const start = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    let imported = 0;
    const errors = [...parsed.errors];
    try {
      for (const batch of chunk(parsed.rows, 200)) {
        const res = await importBatch({ rows: batch });
        imported += res.imported;
        errors.push(...res.errors);
      }
      setResult({ imported, errors: errors.sort((a, b) => a.rowNumber - b.rowNumber) });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const problems = result?.errors ?? parsed?.errors ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import comparables"
      footer={
        result ? (
          <Button title="Close" onPress={onClose} />
        ) : (
          <Button title={busy ? "Importing..." : `Import ${parsed?.rows.length ?? 0} rows`} loading={busy} disabled={!parsed || parsed.rows.length === 0} onPress={start} />
        )
      }
    >
      <Body muted small>
        Bring in past sales, rentals and valuations. The first row must hold column names; share the template to see them.
      </Body>
      <ErrorNote message={error} />
      <Button variant="ghost" icon="download-outline" title="Share the template" onPress={() => run(shareTemplate)} />
      <Button variant="secondary" icon="document-outline" title={fileName || "Choose an Excel or CSV file"} onPress={choose} />
      <Select
        label="Rows without a Kind column are"
        hint="Choose Past valuations for a sheet of old reports."
        value={kind}
        options={[
          { value: "sale", label: "Sales" },
          { value: "rental", label: "Rentals" },
          { value: "valuation", label: "Past valuations" },
        ]}
        onChange={setKind}
      />
      {parsed && parsed.missing.length > 0 && <Notice tone="danger">{`${fileName} has no column for: ${parsed.missing.join(", ")}.`}</Notice>}
      {parsed && parsed.missing.length === 0 && !result && (
        <Body small>
          {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready
          {parsed.errors.length > 0 ? `, ${parsed.errors.length} will be skipped:` : "."}
        </Body>
      )}
      {result && (
        <Notice tone="success">
          Imported {result.imported} row{result.imported === 1 ? "" : "s"}
          {result.errors.length ? `. ${result.errors.length} skipped:` : "."}
        </Notice>
      )}
      {problems.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: 2 }}>
          {problems.slice(0, 100).map((e) => (
            <Text key={`${e.rowNumber}-${e.message}`} style={{ fontSize: font.xs, color: colors.text }}>
              Row {e.rowNumber}: {e.message}
            </Text>
          ))}
          {problems.length > 100 && <Text style={{ fontSize: font.xs, color: colors.muted }}>And {problems.length - 100} more.</Text>}
        </View>
      )}
    </Sheet>
  );
}
