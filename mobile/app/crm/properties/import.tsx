/**
 * PropertyBook import (port of /app/properties/import/propertybook), admins
 * only. Steps as on the website: pick an agency, fetch its new listings
 * politely, review and choose owners, import in batches, then offer to track
 * the agency for nightly refreshes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";
import { Body, Button, Card, Chips, EmptyState, Loading, Notice, Row, Screen, SearchBar, Section, Stat, StatGrid, Toggle } from "../../../components/ui";
import { AgencyRow, ListingRow, ProgressBar, RowOwnerSheet, type Agency, type PbListing } from "../../../components/crm/records/properties/PbParts";
import { AgentPicker, type AgentChoice } from "../../../components/crm/records/properties/AgentPicker";
import { runPool } from "../../../lib/crm/records/properties/pool";
import { useSession } from "../../../lib/session";
import { useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";

const FETCH_SIZES = ["25", "50", "75", "100"] as const;
const BATCH_SIZES = ["5", "10", "25"] as const;
const PER_LISTING_DELAY_MS = 1000;
const PREVIEW_CONCURRENCY = 3;

type Step = "picking" | "previewing" | "selecting" | "importing" | "results";
type Result = { created: number; updated: number; skipped: number; failed: number; errors: Array<{ row: number; message: string }> };

export default function PropertyBookImport() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const listAgencies = useAction(api.propertyBook.listAgencies);
  const getUrls = useAction(api.propertyBook.getAgencyListingUrls);
  const fetchOne = useAction(api.propertyBook.fetchOneListing);
  const importBatch = useAction(api.propertyBook.importBatch);
  const track = useMutation(api.propertyBook.trackAgency);
  const agents = useQuery(api.users.listForAssignment, isAdmin ? {} : "skip") ?? [];
  const trackRun = useRun();

  const [step, setStep] = useState<Step>("picking");
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState<Agency | null>(null);
  const [fetchSize, setFetchSize] = useState<(typeof FETCH_SIZES)[number]>("50");
  const [batchSize, setBatchSize] = useState<(typeof BATCH_SIZES)[number]>("25");
  const [listings, setListings] = useState<PbListing[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState({ current: 0, total: 0, failed: 0 });
  const cancelRef = useRef(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [defaults, setDefaults] = useState<AgentChoice>({ mode: "company", ids: [] });
  const [overrides, setOverrides] = useState<Record<string, Id<"users">[]>>({});
  const [ownerFor, setOwnerFor] = useState<string | null>(null);

  const loadAgencies = useCallback(
    async (force?: boolean) => {
      setLoadingAgencies(true);
      setError("");
      try {
        setAgencies(await listAgencies({ force }));
      } catch (e) {
        setError(getErrorMessage(e) || "Failed to load agencies");
      } finally {
        setLoadingAgencies(false);
        setAttempted(true);
      }
    },
    [listAgencies]
  );

  useEffect(() => {
    if (isAdmin) void loadAgencies();
  }, [isAdmin, loadAgencies]);

  const shown = useMemo(() => {
    const n = search.trim().toLowerCase();
    return n ? agencies.filter((a) => a.name.toLowerCase().includes(n) || a.slug.toLowerCase().includes(n)) : agencies;
  }, [agencies, search]);

  const defaultIds = defaults.mode === "agents" ? defaults.ids : [];
  const ownersOf = (ref: string) => (ref in overrides ? overrides[ref]! : defaultIds);
  const agentName = (id: string) => agents.find((a) => a._id === id)?.name ?? "1 agent";
  const ownerLabel = (ids: Id<"users">[]) => (ids.length === 0 ? "Company" : ids.length === 1 ? agentName(ids[0]!) : `${ids.length} agents`);

  const chosen = listings.filter((l) => selected.has(l.pbRefCode));
  const size = Number(batchSize);
  const batches = Math.max(1, Math.ceil(chosen.length / size));

  const pick = async (a: Agency) => {
    setAgency(a);
    setStep("previewing");
    setError("");
    setListings([]);
    setSelected(new Set());
    setOverrides({});
    setPreview({ current: 0, total: 0, failed: 0 });
    cancelRef.current = false;
    let urls: string[] = [];
    try {
      urls = (await getUrls({ slug: a.slug, maxListings: Number(fetchSize) })).urls;
    } catch (e) {
      setError(getErrorMessage(e) || "Failed to discover listings for this agency");
      setStep("picking");
      return;
    }
    if (urls.length === 0) {
      setError(`No new listings to import for ${a.name}. Everything currently listed has already been imported.`);
      setStep("picking");
      return;
    }
    setPreview({ current: 0, total: urls.length, failed: 0 });
    const collected: PbListing[] = [];
    await runPool(
      urls,
      PREVIEW_CONCURRENCY,
      PER_LISTING_DELAY_MS,
      async (url) => {
        const l = (await fetchOne({ url })) as PbListing;
        collected.push(l);
        setListings([...collected]);
        return l;
      },
      (done) => setPreview({ current: done, total: urls.length, failed: done - collected.length }),
      () => cancelRef.current
    );
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    if (collected.length === 0) {
      if (cancelled) {
        setStep("picking");
        return;
      }
      setError(`Could not fetch any listings for ${a.name}. PropertyBook may have changed or be unreachable.`);
      setStep("picking");
      return;
    }
    setSelected(new Set(collected.map((l) => l.pbRefCode)));
    setStep("selecting");
  };

  const runImport = async () => {
    if (!ack || chosen.length === 0) return;
    setError("");
    setStep("importing");
    const total: Result = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    setProgress({ current: 0, total: batches });
    try {
      for (let i = 0; i < batches; i++) {
        const slice = chosen.slice(i * size, (i + 1) * size);
        const r = await importBatch({
          listings: slice,
          ownerUserIds: defaultIds.length > 0 ? defaultIds : undefined,
          ownershipAssignments: slice.map((l) => ({ pbRefCode: l.pbRefCode, ownerUserIds: ownersOf(l.pbRefCode) })),
        });
        total.created += r.created;
        total.updated += r.updated;
        total.skipped += r.skipped;
        total.failed += r.failed;
        total.errors.push(...r.errors.map((e) => ({ row: e.row + i * size, message: e.message })));
        setProgress({ current: i + 1, total: batches });
      }
    } catch (e) {
      setError(getErrorMessage(e) || "Import failed");
    }
    setResult(total);
    setStep("results");
  };

  const reset = () => {
    setStep("picking");
    setAgency(null);
    setListings([]);
    setSelected(new Set());
    setResult(null);
    setError("");
    setAck(false);
    setOverrides({});
  };

  if (!user) return <Loading />;
  if (!isAdmin)
    return (
      <>
        <Stack.Screen options={{ title: "PropertyBook import" }} />
        <EmptyState icon="lock-closed-outline" title="Admins only" message="Importing from PropertyBook is limited to agency admins." />
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: "Discover properties" }} />
      <Screen>
        <Body muted>Pull listings from propertybook.co.zw into your CRM without re-uploading each property.</Body>
        <Button small variant="secondary" icon="radio-outline" title="Tracked agencies" onPress={() => router.push("/crm/properties/import-tracked")} />
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {step === "picking" && (
          <Section title="Step 1. Pick an agency" right={<Button small variant="ghost" title={loadingAgencies ? "Loading" : "Refresh"} disabled={loadingAgencies} onPress={() => loadAgencies(true)} />}>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>Listings to fetch per run</Text>
            <Chips options={FETCH_SIZES.map((s) => ({ value: s, label: s }))} value={fetchSize} onChange={setFetchSize} />
            <Body small muted>Each listing is fetched one by one to stay polite to PropertyBook. Imported listings are skipped, so a re-run continues where the last one stopped.</Body>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or slug" />
            {loadingAgencies && agencies.length === 0 ? (
              <Loading label="Loading agencies" />
            ) : attempted && agencies.length === 0 ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="No agencies returned"
                message="PropertyBook may be unreachable or its layout may have changed."
                action={<Button small variant="secondary" title="Try again" onPress={() => loadAgencies(true)} />}
              />
            ) : shown.length === 0 ? (
              <Body muted>No agencies match "{search}".</Body>
            ) : (
              shown.map((a) => <AgencyRow key={a.slug} agency={a} onPress={() => pick(a)} />)
            )}
          </Section>
        )}

        {step === "previewing" && (
          <Card style={{ alignItems: "center", gap: space.md, paddingVertical: space.xxl }}>
            <Loading />
            <Body style={{ textAlign: "center", fontWeight: "600" }}>
              {preview.total === 0 ? `Finding listings for ${agency?.name}` : `Fetched ${preview.current} of ${preview.total} listings`}
            </Body>
            {preview.total > 0 && (
              <>
                <ProgressBar value={preview.current / preview.total} />
                <Body small muted>
                  About {Math.max(1, Math.ceil(((preview.total - preview.current) * (PER_LISTING_DELAY_MS + 800)) / (PREVIEW_CONCURRENCY * 1000)))}s left. Keep the app open.
                </Body>
              </>
            )}
            {preview.failed > 0 && <Body small style={{ color: colors.warning }}>{preview.failed} could not be read and will be skipped.</Body>}
            <Button
              small
              variant="secondary"
              disabled={preview.total === 0}
              title={preview.current > 0 ? `Stop and use ${preview.current} fetched` : "Cancel"}
              onPress={() => (cancelRef.current = true)}
            />
          </Card>
        )}

        {step === "selecting" && (
          <>
            <Section title={`Step 2. Review ${agency?.name ?? ""}`}>
              <Body small muted>
                {listings.length} found · {selected.size} selected · {chosen.length ? `${batches} ${batches === 1 ? "batch" : "batches"}` : "nothing to import"}
              </Body>
              <Row>
                <Button small variant="secondary" icon="arrow-back" title="Back" onPress={() => setStep("picking")} />
                <Button
                  small
                  variant="secondary"
                  title={selected.size === listings.length ? "Clear all" : "Select all"}
                  onPress={() => setSelected(selected.size === listings.length ? new Set() : new Set(listings.map((l) => l.pbRefCode)))}
                />
              </Row>
              <Text style={{ fontSize: font.sm, color: colors.muted }}>Batch size</Text>
              <Chips options={BATCH_SIZES.map((s) => ({ value: s, label: `${s} per batch` }))} value={batchSize} onChange={setBatchSize} />
            </Section>

            <View style={{ gap: space.sm }}>
              {listings.map((l) => (
                <ListingRow
                  key={l.pbRefCode}
                  l={l}
                  selected={selected.has(l.pbRefCode)}
                  ownerLabel={ownerLabel(ownersOf(l.pbRefCode))}
                  overridden={l.pbRefCode in overrides}
                  onToggle={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.pbRefCode)) next.delete(l.pbRefCode);
                      else next.add(l.pbRefCode);
                      return next;
                    })
                  }
                  onOwner={() => setOwnerFor(l.pbRefCode)}
                />
              ))}
            </View>

            <Section title="Default ownership">
              <Body small muted>Applies to listings you have not set individually. Owners can see imported documents and mandates.</Body>
              <AgentPicker value={defaults} onChange={setDefaults} />
              {Object.keys(overrides).length > 0 && (
                <Button small variant="ghost" title={`Reset ${Object.keys(overrides).length} listing override${Object.keys(overrides).length === 1 ? "" : "s"}`} onPress={() => setOverrides({})} />
              )}
            </Section>

            <Toggle label="I confirm I have permission to import these listings into my CRM." value={ack} onChange={setAck} />
            <Button
              title={`Import ${chosen.length} ${chosen.length === 1 ? "property" : "properties"}`}
              icon="cloud-download-outline"
              disabled={chosen.length === 0 || !ack}
              onPress={runImport}
            />
            <Button variant="ghost" title="Cancel" onPress={reset} />
          </>
        )}

        {step === "importing" && (
          <Card style={{ alignItems: "center", gap: space.md, paddingVertical: space.xxl }}>
            <Loading />
            <Body style={{ fontWeight: "600" }}>
              Importing batch {progress.current} of {progress.total}
            </Body>
            <ProgressBar value={progress.total ? progress.current / progress.total : 0} />
            <Body small muted>Saving properties. Keep the app open.</Body>
          </Card>
        )}

        {step === "results" && result && (
          <>
            <Section title="Import complete">
              <StatGrid>
                <Stat label="Created" value={String(result.created)} tone="good" />
                <Stat label="Updated" value={String(result.updated)} />
                <Stat label="Skipped" value={String(result.skipped)} tone={result.skipped ? "warning" : undefined} />
                <Stat label="Failed" value={String(result.failed)} tone={result.failed ? "danger" : undefined} />
              </StatGrid>
              {result.errors.length > 0 && (
                <Card>
                  {result.errors.map((e, i) => (
                    <Body key={i} small style={{ color: colors.danger }}>
                      Row {e.row + 1}: {e.message}
                    </Body>
                  ))}
                </Card>
              )}
            </Section>
            {agency && (
              <Card>
                <Body style={{ fontWeight: "600" }}>Track {agency.name}?</Body>
                <Body small muted>Price and status refresh nightly for properties imported from this agency.</Body>
                <Button
                  variant="secondary"
                  icon="checkmark"
                  title="Track agency"
                  loading={trackRun.busy}
                  onPress={() => trackRun.run(() => track({ slug: agency.slug, name: agency.name, logoUrl: agency.logoUrl }), { success: `Tracking ${agency.name}` })}
                />
              </Card>
            )}
            <Button title="Import more" onPress={reset} />
            <Button variant="secondary" title="View properties" onPress={() => router.navigate("/crm/properties")} />
          </>
        )}

        <RowOwnerSheet
          open={!!ownerFor}
          onClose={() => setOwnerFor(null)}
          agents={agents}
          owners={ownerFor ? ownersOf(ownerFor) : []}
          onChange={(ids) => ownerFor && setOverrides((prev) => ({ ...prev, [ownerFor]: ids }))}
        />
      </Screen>
    </>
  );
}
