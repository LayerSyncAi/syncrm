/**
 * Lead import from an Excel or CSV file (leadImport.bulkImport): pick the file, map its
 * columns, name the batch source, preview with duplicate checks, import, then
 * review results and share any row errors as a spreadsheet.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Button, Card, EmptyState, Loading, Notice, Row, Screen, Section, Select, Stat, StatGrid, Toggle } from "../../../components/ui";
import { getErrorMessage } from "@/lib/errors";
import { resolveImportSource, type ImportSourceMode } from "../../../../convex/lib/leadSources";
import { pickDocument } from "../../../lib/files";
import { readAsCsv } from "../../../lib/sheets";
import { fileStamp, generateCSV, LEAD_SOURCE_OPTIONS, leadSourceLabel, parseCSV, shareCsv, type LeadSource } from "../../../lib/crm/leads/helpers";
import { autoMapColumns, IMPORT_MODES, LEAD_FIELDS, mapRows, type ImportMode } from "../../../lib/crm/leads/importCsv";
import { colors, font, space } from "../../../lib/theme";

type Step = "upload" | "mapping" | "preview" | "importing" | "results";
type Results = { created: number; updated: number; skipped: number; failed: number; errors: Array<{ row: number; message: string }> };

export default function LeadImport() {
  const router = useRouter();
  const bulkImport = useMutation(api.leadImport.bulkImport);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ImportMode>("create_only");
  // No default: the user must say where the list came from.
  const [batchSource, setBatchSource] = useState<LeadSource | "">("");
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>("batch");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);

  const preview = mapRows(rows.slice(0, 20), headers, columnMap);
  const dupes = useQuery(
    api.leadImport.checkDuplicates,
    step === "preview" && preview.length ? { rows: preview.map((r, i) => ({ email: r.email, phone: r.phone || undefined, rowIndex: i })) } : "skip"
  );
  const hasSourceColumn = !!columnMap.source;
  const effectiveMode: ImportSourceMode = hasSourceColumn && sourceMode === "column" ? "column" : "batch";

  const pick = async () => {
    setError("");
    const file = await pickDocument(["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain", "*/*"]);
    if (!file) return;
    try {
      const parsed = parseCSV(await readAsCsv(file));
      if (parsed.length < 2) {
        setError("The file needs a header row and at least one data row.");
        return;
      }
      const h = parsed[0]!.map((x) => x.trim());
      setHeaders(h);
      setRows(parsed.slice(1));
      setColumnMap(autoMapColumns(h));
      setFileName(file.name);
      setStep("mapping");
    } catch (e) {
      setError(getErrorMessage(e, "Could not read that file"));
    }
  };

  const toPreview = () => {
    const missing = LEAD_FIELDS.filter((f) => f.required && !columnMap[f.key]);
    if (missing.length) return setError(`Map the required fields: ${missing.map((f) => f.label).join(", ")}`);
    if (!batchSource) return setError("Choose the lead source for this batch");
    setError("");
    setStep("preview");
  };

  const run = async () => {
    if (!batchSource) return;
    setStep("importing");
    setError("");
    try {
      const r = await bulkImport({ mode, batchSource, sourceMode: effectiveMode, rows: mapRows(rows, headers, columnMap) });
      setResults(r);
      setStep("results");
    } catch (e) {
      setError(getErrorMessage(e, "Import failed"));
      setStep("preview");
    }
  };

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setColumnMap({});
    setBatchSource("");
    setSourceMode("batch");
    setResults(null);
    setError("");
  };

  const shareErrors = () => {
    if (!results?.errors.length) return;
    const csv = generateCSV(["Row", "Error"], results.errors.map((e) => [String(e.row + 1), e.message]));
    shareCsv(csv, `${fileStamp()}_lead-import-errors.csv`).catch((e) => setError(getErrorMessage(e)));
  };

  const dupCount = dupes?.filter((d) => d.isDuplicate).length ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Lead import" }} />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {step === "upload" && (
        <>
          <EmptyState icon="cloud-upload-outline" title="Import leads" message="Pick an Excel or CSV file from your phone, Drive or email attachments." action={<Button title="Choose file" icon="document-outline" onPress={pick} />} />
          <Card>
            <Body small muted>
              Columns: Full name and Phone (required), Email, Interest type, Budget currency, Budget min, Budget max, Preferred areas, Notes. You choose the lead source for the whole batch on the next step; a Source column is optional.
            </Body>
          </Card>
        </>
      )}

      {step === "mapping" && (
        <>
          <Body muted>
            {fileName}: {rows.length} rows found.
          </Body>
          <Section title="Map columns">
            {LEAD_FIELDS.map((f) => (
              <Select
                key={f.key}
                label={f.required ? `${f.label} *` : f.label}
                value={columnMap[f.key] ?? ""}
                placeholder="Not mapped"
                options={[{ value: "", label: "Not mapped" }, ...headers.map((h) => ({ value: h, label: h }))]}
                onChange={(v) => setColumnMap((m) => ({ ...m, [f.key]: v }))}
              />
            ))}
          </Section>
          <Section title="Source and mode">
            <Select
              label="Lead source for this batch *"
              value={batchSource}
              placeholder="Choose source"
              options={LEAD_SOURCE_OPTIONS}
              onChange={setBatchSource}
              hint={`Every lead in this upload is tagged with this source${hasSourceColumn ? " unless you use the file's Source column below." : "."}`}
            />
            {hasSourceColumn && (
              <Toggle
                label="Use the Source column where it names a known source"
                hint="Rows with an empty or unknown value fall back to the batch source."
                value={sourceMode === "column"}
                onChange={(on) => setSourceMode(on ? "column" : "batch")}
              />
            )}
            <Select label="Import mode" value={mode} options={IMPORT_MODES} onChange={setMode} />
          </Section>
          <Button title="Preview import" onPress={toPreview} />
          <Button title="Choose another file" variant="secondary" onPress={reset} />
        </>
      )}

      {step === "preview" && (
        <>
          {batchSource && (
            <Notice>
              {effectiveMode === "column" ? "Rows without a recognised source will be tagged " : `All ${rows.length} rows will be tagged `}
              {leadSourceLabel(batchSource)}.
            </Notice>
          )}
          {dupes && (
            <Notice tone={dupCount ? "warning" : "success"}>
              {dupCount} possible duplicate{dupCount === 1 ? "" : "s"} in the first {preview.length} rows.{" "}
              {dupCount ? (mode === "skip_duplicates" ? "They will be skipped." : mode === "upsert" ? "They will be updated." : "They will fail.") : ""}
            </Notice>
          )}
          <Section title={`Preview, first ${preview.length} rows`}>
            {preview.map((r, i) => {
              const d = dupes?.find((x) => x.rowIndex === i);
              return (
                <Card key={i} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text, flex: 1 }} numberOfLines={1}>
                      {i + 1}. {r.fullName || "(no name)"}
                    </Text>
                    {d ? <Badge label={d.isDuplicate ? "Duplicate" : "New"} tone={d.isDuplicate ? "warning" : "success"} /> : null}
                  </Row>
                  <Text style={{ fontSize: font.sm, color: colors.muted }}>
                    {[r.phone, r.email, r.interestType, batchSource ? leadSourceLabel(resolveImportSource(r.source, batchSource, effectiveMode)) : r.source].filter(Boolean).join(" · ")}
                  </Text>
                  {r.budgetMin !== undefined || r.budgetMax !== undefined || r.preferredAreas ? (
                    <Text style={{ fontSize: font.sm, color: colors.muted }}>
                      {[r.budgetCurrency, r.budgetMin, r.budgetMax !== undefined ? `to ${r.budgetMax}` : undefined].filter((x) => x !== undefined && x !== "").join(" ")}
                      {r.preferredAreas ? ` · ${r.preferredAreas}` : ""}
                    </Text>
                  ) : null}
                  {d?.isDuplicate ? <Text style={{ fontSize: font.xs, color: colors.warning }}>{d.reason}</Text> : null}
                </Card>
              );
            })}
          </Section>
          <Button title={`Import ${rows.length} rows`} onPress={run} />
          <Button title="Back" variant="secondary" onPress={() => setStep("mapping")} />
        </>
      )}

      {step === "importing" && <Loading label={`Importing ${rows.length} rows`} />}

      {step === "results" && results && (
        <>
          <StatGrid>
            <Stat label="Created" value={String(results.created)} tone="good" />
            <Stat label="Updated" value={String(results.updated)} />
            <Stat label="Skipped" value={String(results.skipped)} tone={results.skipped ? "warning" : undefined} />
            <Stat label="Failed" value={String(results.failed)} tone={results.failed ? "danger" : undefined} />
          </StatGrid>
          {results.errors.length > 0 && (
            <Section title={`Errors (${results.errors.length})`} right={<Button small variant="secondary" title="Share errors" onPress={shareErrors} />}>
              <View style={{ gap: space.xs }}>
                {results.errors.slice(0, 20).map((e, i) => (
                  <Text key={i} style={{ fontSize: font.sm, color: colors.danger }}>
                    Row {e.row + 1}: {e.message}
                  </Text>
                ))}
              </View>
            </Section>
          )}
          <Button title="Go to leads" onPress={() => router.replace("/crm/leads")} />
          <Button title="Import another file" variant="secondary" onPress={reset} />
        </>
      )}
    </Screen>
  );
}
