/**
 * Import landlords, properties, units, tenants and leases from a CSV file
 * (directors). Uses the website's template columns and parser
 * (src/lib/stay/import.ts) and sends batches to stay.importer.importBatch.
 * Reads the website's Excel template, or the same columns saved as CSV.
 */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Card, EmptyState, Ionicons, Notice, Row, Screen, Section, Stat, StatGrid } from "../../components/ui";
import { useSession } from "../../lib/session";
import { pickDocument } from "../../lib/files";
import { readAsObjects } from "../../lib/sheets";
import { toCsv } from "../../lib/stay/csv";
import { shareCsv } from "../../lib/stay/share";
import { colors, space } from "../../lib/theme";
import { getErrorMessage } from "@/lib/errors";
import { IMPORT_COLUMNS, IMPORT_NOTES, batches, parseImportRows, type ImportError, type ImportProperty } from "@/lib/stay/import";
import { datePrefix } from "@/lib/stay/format";

type Result = { name: string; ok: boolean; error?: string; warnings: string[]; units: number; leases: number };

async function shareTemplate() {
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const example = IMPORT_COLUMNS.map((c) => c.example);
  const second = IMPORT_COLUMNS.map((c) => (c.key === "propertyName" ? "12 Kings Road" : c.key === "unit" ? "Flat 2" : c.key === "bedrooms" ? 1 : ""));
  try {
    await shareCsv(toCsv([headers, example, second]), `${datePrefix()}Sync_Stay_import_template.csv`);
  } catch (e) {
    Alert.alert("Could not create the template", getErrorMessage(e));
  }
}

export default function StayImport() {
  const router = useRouter();
  const { hub } = useSession();
  const importBatch = useMutation(api.stay.importer.importBatch);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ properties: ImportProperty[]; errors: ImportError[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);

  if (!hub?.isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Import" }} />
        <EmptyState
          icon="lock-closed-outline"
          title="Directors only"
          message="Ask a director to import properties, landlords, tenants and leases."
          action={<Button variant="secondary" title="Back to properties" onPress={() => router.navigate("/stay/properties")} />}
        />
      </Screen>
    );
  }

  async function choose() {
    const file = await pickDocument(["text/csv", "text/comma-separated-values", "text/plain", "application/csv", "*/*"]);
    if (!file) return;
    setResults(null);
    setFileName(file.name);
    try {
      setParsed(parseImportRows(await readAsObjects(file)));
    } catch (e) {
      setParsed(null);
      Alert.alert("Could not read the file", getErrorMessage(e));
    }
  }

  async function runImport() {
    if (!parsed?.properties.length) return;
    setRunning(true);
    setProgress(0);
    const all: Result[] = [];
    try {
      for (const batch of batches(parsed.properties, 10)) {
        const res = await importBatch({ properties: batch });
        all.push(...res);
        setProgress(all.length);
      }
      Alert.alert("Import finished", `${all.filter((r) => r.ok).length} of ${all.length} properties imported`);
    } catch (e) {
      Alert.alert("Import stopped", getErrorMessage(e));
    } finally {
      setResults(all);
      setRunning(false);
    }
  }

  const unitCount = parsed?.properties.reduce((s, p) => s + p.units.length, 0) ?? 0;
  const leaseCount = parsed?.properties.reduce((s, p) => s + p.units.filter((u) => u.lease).length, 0) ?? 0;
  const landlordCount = parsed ? new Set(parsed.properties.map((p) => p.landlord.name.trim().toLowerCase())).size : 0;
  const n = parsed?.properties.length ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Import" }} />
      <Body muted>Bring in your existing landlords, properties, units, tenants and leases in one go.</Body>

      <Section title="1. Fill in the template">
        <Card>
          {IMPORT_NOTES.map((note) => (
            <Row key={note} style={{ alignItems: "flex-start" }}>
              <Text style={{ color: colors.muted }}>•</Text>
              <Body small muted style={{ flex: 1 }}>
                {note}
              </Body>
            </Row>
          ))}
          <Button variant="secondary" icon="download-outline" title="Share Excel template" onPress={shareTemplate} />
        </Card>
      </Section>

      <Section title="2. Upload it">
        <Notice>Choose the Excel template or a CSV file with the same columns.</Notice>
        <Button icon="document-attach-outline" title={fileName ? "Choose another file" : "Choose file"} onPress={choose} disabled={running} />
        {fileName && (
          <Row>
            <Ionicons name="document-text-outline" size={16} color={colors.muted} />
            <Body small muted>
              {fileName}
            </Body>
          </Row>
        )}
      </Section>

      {parsed && (
        <Section title="3. Check and import">
          <StatGrid>
            <Stat label="Properties" value={String(n)} />
            <Stat label="Units" value={String(unitCount)} />
            <Stat label="Leases" value={String(leaseCount)} />
            <Stat label="Landlords" value={String(landlordCount)} />
          </StatGrid>
          {parsed.errors.length > 0 && (
            <Card style={{ backgroundColor: colors.dangerBg, borderColor: colors.danger + "44" }}>
              <Body small style={{ color: colors.danger, fontWeight: "600" }}>
                {parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} will be left out. Fix them in the file and upload again, or import the rest now.
              </Body>
              {parsed.errors.slice(0, 50).map((e, i) => (
                <Body key={i} small>
                  Row {e.row}: {e.message}
                </Body>
              ))}
              {parsed.errors.length > 50 && (
                <Body small muted>
                  And {parsed.errors.length - 50} more.
                </Body>
              )}
            </Card>
          )}
          {n === 0 && parsed.errors.length === 0 && <Notice tone="warning">No rows found. Check the file has the template&apos;s header row.</Notice>}
          {n > 0 && !results && (
            <Button title={running ? `Importing ${progress} of ${n}...` : `Import ${n} propert${n === 1 ? "y" : "ies"}`} onPress={runImport} loading={running} />
          )}
        </Section>
      )}

      {results && (
        <Section title="Results">
          {results.map((r, i) => (
            <Card key={i}>
              <Row style={{ alignItems: "flex-start" }}>
                <Ionicons name={r.ok ? "checkmark-circle" : "close-circle"} size={18} color={r.ok ? colors.success : colors.danger} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Body small style={{ fontWeight: "600" }}>
                    {r.name}
                  </Body>
                  <Body small muted>
                    {r.ok ? `${r.units} new unit${r.units === 1 ? "" : "s"}, ${r.leases} lease${r.leases === 1 ? "" : "s"}` : r.error}
                  </Body>
                  {r.warnings.map((w, j) => (
                    <Body key={j} small style={{ color: colors.warning }}>
                      {w}
                    </Body>
                  ))}
                </View>
              </Row>
            </Card>
          ))}
          <View style={{ gap: space.sm }}>
            <Button variant="secondary" title="Go to properties" onPress={() => router.navigate("/stay/properties")} />
          </View>
        </Section>
      )}
    </Screen>
  );
}
