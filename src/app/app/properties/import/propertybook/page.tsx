"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Search,
  XCircle,
} from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { propertyBookToasts } from "@/lib/toast";

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
} as const;

const MAX_BATCH_SIZE = 25;
const BATCH_SIZE_OPTIONS = [5, 10, 25] as const;

type BatchSize = (typeof BATCH_SIZE_OPTIONS)[number];
type Step =
  | "picking_agency"
  | "previewing"
  | "selecting"
  | "importing"
  | "results";

type Agency = {
  slug: string;
  name: string;
  logoUrl?: string;
  forSaleCount?: number;
  forRentCount?: number;
};

type PreviewListing = {
  pbRefCode: string;
  pbSourceUrl: string;
  pbAgencySlug: string;
  title: string;
  listingType: "rent" | "sale";
  propertyType: "house" | "apartment" | "land" | "commercial" | "other";
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  description: string;
  imageUrls: string[];
  status: "available";
};

type BatchResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
};

const PER_LISTING_DELAY_MS = 1000;
const PREVIEW_CONCURRENCY = 3;

// Runs `worker` over `items` with a fixed-size client-side worker pool.
// Each worker independently dequeues, runs the worker, then sleeps the
// per-slot delay before grabbing the next item. Steady-state HTTP rate is
// `concurrency` requests every `perSlotDelayMs` (here: 3 every 1000ms).
//
// `onProgress(completed)` fires after each item (success or failure) and
// is used to drive the progress bar. The caller can cancel between items
// via `shouldCancel()` — workers exit at the next loop check.
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  perSlotDelayMs: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress: (completed: number) => void,
  shouldCancel: () => boolean
): Promise<{ successes: Array<R>; failed: number }> {
  const successes: R[] = [];
  let failed = 0;
  let completed = 0;
  let next = 0;

  const runWorker = async () => {
    while (true) {
      if (shouldCancel()) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        const result = await worker(items[i], i);
        successes.push(result);
      } catch {
        failed++;
      }
      completed++;
      onProgress(completed);
      if (next < items.length && !shouldCancel()) {
        await new Promise((r) => setTimeout(r, perSlotDelayMs));
      }
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return { successes, failed };
}

export default function PropertyBookImportPage() {
  const { isLoading: authLoading, isAdmin } = useRequireAuth();

  const listAgencies = useAction(api.propertyBook.listAgencies);
  const getAgencyListingUrls = useAction(
    api.propertyBook.getAgencyListingUrls
  );
  const fetchOneListing = useAction(api.propertyBook.fetchOneListing);
  const importBatch = useAction(api.propertyBook.importBatch);
  const trackAgencyMutation = useMutation(api.propertyBook.trackAgency);

  const [step, setStep] = React.useState<Step>("picking_agency");
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [agenciesLoading, setAgenciesLoading] = React.useState(false);
  const [agenciesAttempted, setAgenciesAttempted] = React.useState(false);
  const [agencySearch, setAgencySearch] = React.useState("");
  const [selectedAgency, setSelectedAgency] = React.useState<Agency | null>(
    null
  );
  const [listings, setListings] = React.useState<PreviewListing[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = React.useState<BatchSize>(25);
  const [error, setError] = React.useState<string>("");
  const [progress, setProgress] = React.useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });
  const [previewProgress, setPreviewProgress] = React.useState<{
    current: number;
    total: number;
    failed: number;
  }>({ current: 0, total: 0, failed: 0 });
  const cancelPreviewRef = React.useRef(false);
  const [finalResult, setFinalResult] = React.useState<BatchResult | null>(
    null
  );
  const [ackChecked, setAckChecked] = React.useState(false);

  // Import ownership assignment (admin chooses; defaults to the company).
  const agentsRaw = useQuery(api.users.listForAssignment);
  const agents = React.useMemo(() => agentsRaw ?? [], [agentsRaw]);

  // Batch-level DEFAULT ownership. Applied to any row the user hasn't set
  // individually (see ownershipByRef). Empty agents list => company.
  const [ownershipMode, setOwnershipMode] = React.useState<"company" | "agents">(
    "company"
  );
  const [importOwnerIds, setImportOwnerIds] = React.useState<Id<"users">[]>([]);
  const toggleImportOwner = (id: Id<"users">) => {
    setImportOwnerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Per-row ownership OVERRIDES, keyed by pbRefCode. A ref present here was set
  // explicitly by the user and takes precedence over the batch default; absent
  // refs follow the default. Empty array = company (explicit).
  const [ownershipByRef, setOwnershipByRef] = React.useState<
    Record<string, Id<"users">[]>
  >({});
  // Which row's ownership picker is open, with the anchor coords for a
  // fixed-positioned panel (the table wrapper clips overflow, so we can't use
  // an absolutely-positioned dropdown inside it).
  const [openOwner, setOpenOwner] = React.useState<{
    ref: string;
    top: number;
    left: number;
  } | null>(null);
  const openOwnerPicker = (
    e: React.MouseEvent<HTMLButtonElement>,
    refCode: string
  ) => {
    if (openOwner?.ref === refCode) {
      setOpenOwner(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const width = 224; // w-56
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setOpenOwner({ ref: refCode, top: r.bottom + 4, left });
  };

  const agentNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a._id, a.name);
    return m;
  }, [agents]);

  const defaultOwnerIds = React.useMemo<Id<"users">[]>(
    () => (ownershipMode === "agents" ? importOwnerIds : []),
    [ownershipMode, importOwnerIds]
  );

  // Effective owners for a listing: its own override if set, else the default.
  const effectiveOwners = React.useCallback(
    (refCode: string): Id<"users">[] =>
      refCode in ownershipByRef ? ownershipByRef[refCode] : defaultOwnerIds,
    [ownershipByRef, defaultOwnerIds]
  );

  const setRowOwners = (refCode: string, ids: Id<"users">[]) =>
    setOwnershipByRef((prev) => ({ ...prev, [refCode]: ids }));

  const toggleRowOwner = (refCode: string, id: Id<"users">) => {
    const current = effectiveOwners(refCode);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setRowOwners(refCode, next);
  };

  const ownerLabel = React.useCallback(
    (ids: Id<"users">[]): string => {
      if (ids.length === 0) return "Company";
      if (ids.length === 1) return agentNameById.get(ids[0]) ?? "1 agent";
      return `${ids.length} agents`;
    },
    [agentNameById]
  );

  const loadAgencies = React.useCallback(
    async (query: string, options?: { force?: boolean }) => {
      setAgenciesLoading(true);
      setError("");
      try {
        const result = await listAgencies({
          query: query || undefined,
          force: options?.force,
        });
        setAgencies(result);
      } catch (e: unknown) {
        setError((e as Error).message || "Failed to load agencies");
      } finally {
        setAgenciesLoading(false);
        setAgenciesAttempted(true);
      }
    },
    [listAgencies]
  );

  const didAutoFetchRef = React.useRef(false);
  React.useEffect(() => {
    if (didAutoFetchRef.current) return;
    if (step !== "picking_agency") return;
    didAutoFetchRef.current = true;
    void loadAgencies("");
  }, [step, loadAgencies]);

  const filteredAgencies = React.useMemo(() => {
    if (!agencySearch.trim()) return agencies;
    const needle = agencySearch.toLowerCase();
    return agencies.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        a.slug.toLowerCase().includes(needle)
    );
  }, [agencies, agencySearch]);

  const cancelPreview = React.useCallback(() => {
    cancelPreviewRef.current = true;
  }, []);

  const pickAgency = React.useCallback(
    async (agency: Agency) => {
      setSelectedAgency(agency);
      setStep("previewing");
      setError("");
      setListings([]);
      setSelected(new Set());
      setPreviewProgress({ current: 0, total: 0, failed: 0 });
      cancelPreviewRef.current = false;

      let urls: string[] = [];
      try {
        const discovery = (await getAgencyListingUrls({
          slug: agency.slug,
          maxListings: 50,
        })) as { agency: { slug: string; name: string }; urls: string[] };
        urls = discovery.urls;
      } catch (e: unknown) {
        setError(
          (e as Error).message || "Failed to discover listings for this agency"
        );
        setStep("picking_agency");
        return;
      }

      if (urls.length === 0) {
        setError(`No listings found for ${agency.name} on PropertyBook.`);
        setStep("picking_agency");
        return;
      }

      setPreviewProgress({ current: 0, total: urls.length, failed: 0 });

      const collected: PreviewListing[] = [];
      await runPool<string, PreviewListing>(
        urls,
        PREVIEW_CONCURRENCY,
        PER_LISTING_DELAY_MS,
        async (url) => {
          const listing = (await fetchOneListing({ url })) as PreviewListing;
          collected.push(listing);
          setListings([...collected]);
          return listing;
        },
        (completed) => {
          setPreviewProgress({
            current: completed,
            total: urls.length,
            failed: completed - collected.length,
          });
        },
        () => cancelPreviewRef.current
      );

      if (cancelPreviewRef.current) {
        cancelPreviewRef.current = false;
        if (collected.length === 0) {
          setStep("picking_agency");
          return;
        }
      }

      if (collected.length === 0) {
        setError(
          `Couldn't fetch any listings for ${agency.name}. PropertyBook may have changed its layout or be temporarily unreachable.`
        );
        setStep("picking_agency");
        return;
      }

      setSelected(new Set(collected.map((l) => l.pbRefCode)));
      setStep("selecting");
    },
    [getAgencyListingUrls, fetchOneListing]
  );

  const toggle = (refCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(refCode)) {
        next.delete(refCode);
      } else {
        next.add(refCode);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === listings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(listings.map((l) => l.pbRefCode)));
    }
  };

  const selectedListings = listings.filter((l) => selected.has(l.pbRefCode));
  const batchCount = Math.max(
    1,
    Math.ceil(selectedListings.length / batchSize)
  );

  const runImport = async () => {
    if (!ackChecked) {
      setError("Please confirm you have permission to import these listings.");
      return;
    }
    if (selectedListings.length === 0) return;
    setError("");
    setStep("importing");
    propertyBookToasts.importStarted(selectedListings.length, batchCount);

    const aggregated: BatchResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    setProgress({ current: 0, total: batchCount });

    try {
      for (let i = 0; i < batchCount; i++) {
        const slice = selectedListings.slice(
          i * batchSize,
          (i + 1) * batchSize
        );
        const result = (await importBatch({
          listings: slice,
          // Batch default (covers any row left untouched in this slice).
          ownerUserIds: defaultOwnerIds.length > 0 ? defaultOwnerIds : undefined,
          // Per-listing ownership so one batch can mix owners. Each property's
          // effective owners travel with it, surviving multi-call batches.
          ownershipAssignments: slice.map((l) => ({
            pbRefCode: l.pbRefCode,
            ownerUserIds: effectiveOwners(l.pbRefCode),
          })),
        })) as BatchResult;
        aggregated.created += result.created;
        aggregated.updated += result.updated;
        aggregated.skipped += result.skipped;
        aggregated.failed += result.failed;
        aggregated.errors.push(
          ...result.errors.map((e: { row: number; message: string }) => ({
            row: e.row + i * batchSize,
            message: e.message,
          }))
        );
        setProgress({ current: i + 1, total: batchCount });
      }
      setFinalResult(aggregated);
      setStep("results");
      if (aggregated.failed === 0 && aggregated.skipped === 0) {
        propertyBookToasts.importSuccess(aggregated.created);
      } else {
        propertyBookToasts.importPartial(
          aggregated.created,
          aggregated.skipped,
          aggregated.failed
        );
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || "Import failed";
      setError(msg);
      propertyBookToasts.importFailed(msg);
      setFinalResult(aggregated);
      setStep("results");
    }
  };

  const trackAgency = async () => {
    if (!selectedAgency) return;
    try {
      await trackAgencyMutation({
        slug: selectedAgency.slug,
        name: selectedAgency.name,
        logoUrl: selectedAgency.logoUrl,
      });
      propertyBookToasts.agencyTracked(selectedAgency.name);
    } catch (e: unknown) {
      propertyBookToasts.trackFailed((e as Error).message);
    }
  };

  const reset = () => {
    setStep("picking_agency");
    setSelectedAgency(null);
    setListings([]);
    setSelected(new Set());
    setFinalResult(null);
    setError("");
    setAckChecked(false);
    setProgress({ current: 0, total: 0 });
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h2 className="text-base font-semibold">Admins only</h2>
          <p className="mt-1 text-sm text-text-muted">
            Importing from PropertyBook is restricted to organization admins.
          </p>
          <Link href="/app/properties" className="mt-4 inline-block">
            <Button variant="secondary" size="sm">
              Back to properties
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text">
            Discover New Properties
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Pull listings from propertybook.co.zw into your CRM without
            re-uploading each property.
          </p>
        </div>
        <Link href="/app/properties/import/propertybook/tracked">
          <Button variant="secondary" size="sm">
            Tracked agencies
          </Button>
        </Link>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === "picking_agency" && (
          <motion.div
            key="picking"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-base font-semibold">
                    Step 1 — Pick an agency
                  </h2>
                  <div className="flex w-full max-w-sm items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                      <Input
                        placeholder="Search by name or slug..."
                        value={agencySearch}
                        onChange={(e) => setAgencySearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={agenciesLoading}
                      onClick={() => loadAgencies("", { force: true })}
                    >
                      {agenciesLoading ? "Loading…" : "Refresh"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {agenciesLoading && agencies.length === 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : agenciesAttempted && agencies.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-text-muted">
                      No agencies returned from PropertyBook.
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      The site may be unreachable from this deployment, or its
                      structure may have changed.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => loadAgencies("", { force: true })}
                    >
                      Try again
                    </Button>
                  </div>
                ) : filteredAgencies.length === 0 ? (
                  <p className="py-10 text-center text-sm text-text-muted">
                    No agencies match &quot;{agencySearch}&quot;.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredAgencies.map((agency) => (
                      <button
                        key={agency.slug}
                        onClick={() => pickAgency(agency)}
                        className="flex items-center gap-3 rounded-[12px] border border-border-strong bg-card-bg p-3 text-left transition hover:border-primary-600/60 hover:shadow-md"
                      >
                        {agency.logoUrl ? (
                          <Image
                            src={agency.logoUrl}
                            alt={agency.name}
                            width={44}
                            height={44}
                            unoptimized
                            className="h-11 w-11 rounded-md bg-gray-50 object-contain"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-sm font-medium text-text-muted">
                            {agency.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">
                            {agency.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-text-muted">
                            {typeof agency.forSaleCount === "number" && (
                              <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                                Sales: {agency.forSaleCount}
                              </Badge>
                            )}
                            {typeof agency.forRentCount === "number" && (
                              <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                                Rent: {agency.forRentCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-text-muted" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "previewing" && (
          <motion.div
            key="previewing"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card>
              <CardContent className="flex flex-col items-center py-16">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                <p className="mt-4 text-sm font-medium text-text">
                  {previewProgress.total === 0
                    ? `Discovering listings for ${selectedAgency?.name}…`
                    : `Fetched ${previewProgress.current} of ${previewProgress.total} listings`}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {previewProgress.total === 0
                    ? "Asking PropertyBook for the agency's listing URLs."
                    : `Estimated ${Math.max(
                        1,
                        Math.ceil(
                          ((previewProgress.total - previewProgress.current) *
                            (PER_LISTING_DELAY_MS + 800)) /
                            (PREVIEW_CONCURRENCY * 1000)
                        )
                      )}s remaining · throttled to be polite to PropertyBook.`}
                </p>
                {previewProgress.failed > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    {previewProgress.failed} listing
                    {previewProgress.failed === 1 ? "" : "s"} failed to parse
                    (will be skipped).
                  </p>
                )}
                {previewProgress.total > 0 && (
                  <div className="mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full bg-primary-600 transition-all"
                      style={{
                        width: `${Math.round(
                          (previewProgress.current / previewProgress.total) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                )}
                <div className="mt-5 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={cancelPreview}
                    disabled={previewProgress.total === 0}
                  >
                    {previewProgress.current > 0
                      ? `Stop & use ${previewProgress.current} fetched`
                      : "Cancel"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "selecting" && (
          <motion.div
            key="selecting"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold">
                      Step 2 — Review & select ({selectedAgency?.name})
                    </h2>
                    <p className="mt-1 text-xs text-text-muted">
                      {listings.length} listings found · {selected.size}{" "}
                      selected ·{" "}
                      {selectedListings.length > 0
                        ? `will import as ${batchCount} ${batchCount === 1 ? "batch" : "batches"}`
                        : "nothing to import"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setStep("picking_agency");
                        setListings([]);
                        setSelected(new Set());
                      }}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Back
                    </Button>
                    <Button variant="secondary" size="sm" onClick={toggleAll}>
                      {selected.size === listings.length
                        ? "Clear all"
                        : "Select all"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border-strong bg-gray-50 px-4 py-3">
                  <span className="text-xs font-medium text-text-muted">
                    Batch size:
                  </span>
                  {BATCH_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      onClick={() => setBatchSize(size)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        batchSize === size
                          ? "border-primary-600 bg-primary-600 text-white"
                          : "border-border-strong bg-white text-text-muted hover:border-primary-600/60"
                      }`}
                    >
                      {size} / batch
                    </button>
                  ))}
                  <span className="ml-auto text-[11px] text-text-muted">
                    Max {MAX_BATCH_SIZE} per call — larger selections run
                    sequentially.
                  </span>
                </div>

                <div className="overflow-hidden rounded-[10px] border border-border-strong">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Listing</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Images</TableHead>
                        <TableHead>Owner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listings.map((l) => {
                        const isSelected = selected.has(l.pbRefCode);
                        return (
                          <TableRow
                            key={l.pbRefCode}
                            onClick={() => toggle(l.pbRefCode)}
                            className={
                              isSelected
                                ? "cursor-pointer bg-primary-600/5"
                                : "cursor-pointer"
                            }
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggle(l.pbRefCode)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select ${l.title}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {l.imageUrls[0] ? (
                                  <Image
                                    src={l.imageUrls[0]}
                                    alt=""
                                    width={44}
                                    height={44}
                                    unoptimized
                                    className="h-11 w-11 rounded-md bg-gray-100 object-cover"
                                  />
                                ) : (
                                  <div className="h-11 w-11 rounded-md bg-gray-100" />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-text">
                                    {l.title}
                                  </p>
                                  <p className="truncate text-[11px] text-text-muted">
                                    Ref {l.pbRefCode}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-text-muted">
                              {l.location}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  l.listingType === "sale" ? "default" : "secondary"
                                }
                                className="px-2 py-0.5 text-[10px]"
                              >
                                {l.listingType === "sale" ? "Sale" : "Rent"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {l.currency} {l.price.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs text-text-muted">
                              {l.imageUrls.length}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => openOwnerPicker(e, l.pbRefCode)}
                                className={`inline-flex max-w-[170px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                                  l.pbRefCode in ownershipByRef
                                    ? "border-primary-600/60 bg-primary-600/10 text-primary-600"
                                    : "border-border-strong bg-white text-text-muted hover:border-primary-600/60"
                                }`}
                                title="Set ownership for this listing"
                              >
                                <span className="truncate">
                                  {ownerLabel(effectiveOwners(l.pbRefCode))}
                                </span>
                                <ChevronDown className="h-3 w-3 shrink-0" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Default ownership for the batch (per-row overrides win) */}
                <div className="space-y-3 rounded-[10px] border border-border-strong bg-gray-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-text-muted">
                      Default ownership:
                    </span>
                    <button
                      type="button"
                      onClick={() => setOwnershipMode("company")}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        ownershipMode === "company"
                          ? "border-primary-600 bg-primary-600 text-white"
                          : "border-border-strong bg-white text-text-muted hover:border-primary-600/60"
                      }`}
                    >
                      Company
                    </button>
                    <button
                      type="button"
                      onClick={() => setOwnershipMode("agents")}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        ownershipMode === "agents"
                          ? "border-primary-600 bg-primary-600 text-white"
                          : "border-border-strong bg-white text-text-muted hover:border-primary-600/60"
                      }`}
                    >
                      Specific agent(s)
                    </button>
                    {Object.keys(ownershipByRef).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOwnershipByRef({})}
                        className="rounded-full border border-border-strong bg-white px-3 py-1 text-xs font-medium text-text-muted transition hover:border-primary-600/60"
                      >
                        Reset {Object.keys(ownershipByRef).length} row override
                        {Object.keys(ownershipByRef).length === 1 ? "" : "s"}
                      </button>
                    )}
                    <span className="ml-auto text-[11px] text-text-muted">
                      Applies to rows you haven&apos;t set in the Owner column.
                      Owners can see imported documents &amp; mandates.
                    </span>
                  </div>
                  {ownershipMode === "agents" && (
                    <div className="flex flex-wrap gap-2">
                      {agents.length === 0 ? (
                        <span className="text-[11px] text-text-muted">
                          No agents available.
                        </span>
                      ) : (
                        agents.map((a) => {
                          const checked = importOwnerIds.includes(
                            a._id as Id<"users">
                          );
                          return (
                            <button
                              key={a._id}
                              type="button"
                              onClick={() =>
                                toggleImportOwner(a._id as Id<"users">)
                              }
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                checked
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-border-strong bg-white text-text-muted hover:border-primary-600/60"
                              }`}
                            >
                              {checked ? "✓ " : ""}
                              {a.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                  {ownershipMode === "agents" && importOwnerIds.length === 0 && (
                    <p className="text-[11px] text-amber-600">
                      Select at least one agent, or the batch will default to
                      company ownership.
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={ackChecked}
                    onChange={(e) => setAckChecked(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm I have permission to import these listings into my
                    CRM.
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={reset}>
                    Cancel
                  </Button>
                  <Button
                    disabled={selectedListings.length === 0 || !ackChecked}
                    onClick={runImport}
                  >
                    Import {selectedListings.length}{" "}
                    {selectedListings.length === 1 ? "property" : "properties"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Fixed-position per-row ownership picker (renders above the table,
            which clips overflow). */}
        {openOwner && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpenOwner(null)}
            />
            <div
              className="fixed z-50 w-56 rounded-lg border border-border-strong bg-white p-2 shadow-lg"
              style={{ top: openOwner.top, left: openOwner.left }}
            >
              <button
                type="button"
                onClick={() => setRowOwners(openOwner.ref, [])}
                className={`mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  effectiveOwners(openOwner.ref).length === 0
                    ? "bg-primary-600/10 text-primary-600"
                    : "text-text-muted hover:bg-gray-100"
                }`}
              >
                Company
                {effectiveOwners(openOwner.ref).length === 0 && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <div className="my-1 border-t border-border-strong" />
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {agents.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-text-muted">
                    No agents available.
                  </p>
                ) : (
                  agents.map((a) => {
                    const checked = effectiveOwners(openOwner.ref).includes(
                      a._id as Id<"users">
                    );
                    return (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() =>
                          toggleRowOwner(openOwner.ref, a._id as Id<"users">)
                        }
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition ${
                          checked
                            ? "bg-primary-600/10 text-primary-600"
                            : "text-text-muted hover:bg-gray-100"
                        }`}
                      >
                        <span className="truncate">{a.name}</span>
                        {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="mt-1 flex justify-end border-t border-border-strong pt-1">
                <button
                  type="button"
                  onClick={() => setOpenOwner(null)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-600/10"
                >
                  Done
                </button>
              </div>
            </div>
          </>
        )}

        {step === "importing" && (
          <motion.div
            key="importing"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card>
              <CardContent className="flex flex-col items-center py-16">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                <p className="mt-4 text-sm font-medium text-text">
                  Importing batch {progress.current} of {progress.total}…
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Saving properties. Please keep this tab open.
                </p>
                <div className="mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-primary-600 transition-all"
                    style={{
                      width: `${
                        progress.total > 0
                          ? Math.round(
                              (progress.current / progress.total) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "results" && finalResult && (
          <motion.div
            key="results"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold">Import complete</h2>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <ResultTile
                      label="Created"
                      value={finalResult.created}
                      tone="success"
                    />
                    <ResultTile
                      label="Skipped"
                      value={finalResult.skipped}
                      tone="warning"
                    />
                    <ResultTile
                      label="Failed"
                      value={finalResult.failed}
                      tone="danger"
                    />
                  </div>

                  {finalResult.errors.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-medium text-text-muted">
                        Row errors ({finalResult.errors.length})
                      </summary>
                      <ul className="mt-2 max-h-60 space-y-1 overflow-auto text-xs text-red-700">
                        {finalResult.errors.map((err, i) => (
                          <li key={i}>
                            Row {err.row + 1}: {err.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      Track {selectedAgency?.name}?
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      We&apos;ll refresh price and status nightly for
                      properties imported from this agency.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={trackAgency}>
                    <Check className="mr-1 h-4 w-4" />
                    Track agency
                  </Button>
                </CardContent>
              </Card>

              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={reset}>
                  Import another agency
                </Button>
                <Link href="/app/properties">
                  <Button>
                    <CheckCircle className="mr-1 h-4 w-4" />
                    Back to properties
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
}) {
  const toneStyles =
    tone === "success"
      ? "bg-green-50 border-green-200 text-green-700"
      : tone === "warning"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-red-50 border-red-200 text-red-700";
  return (
    <div
      className={`rounded-[10px] border p-4 text-center ${toneStyles}`}
    >
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs">{label}</p>
    </div>
  );
}
