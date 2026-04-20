"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useAction, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronRight,
  Search,
  XCircle,
} from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
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
  imageFailures: Array<{ row: number; url: string; message: string }>;
};

export default function PropertyBookImportPage() {
  const { isLoading: authLoading, isAdmin } = useRequireAuth();

  const listAgencies = useAction(api.propertyBook.listAgencies);
  const previewListings = useAction(api.propertyBook.previewAgencyListings);
  const importBatch = useAction(api.propertyBook.importBatch);
  const trackAgencyMutation = useMutation(api.propertyBook.trackAgency);

  const [step, setStep] = React.useState<Step>("picking_agency");
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [agenciesLoading, setAgenciesLoading] = React.useState(false);
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
  const [finalResult, setFinalResult] = React.useState<BatchResult | null>(
    null
  );
  const [ackChecked, setAckChecked] = React.useState(false);

  const loadAgencies = React.useCallback(
    async (query: string) => {
      setAgenciesLoading(true);
      setError("");
      try {
        const result = await listAgencies({ query: query || undefined });
        setAgencies(result);
      } catch (e: unknown) {
        setError((e as Error).message || "Failed to load agencies");
      } finally {
        setAgenciesLoading(false);
      }
    },
    [listAgencies]
  );

  React.useEffect(() => {
    if (step === "picking_agency" && agencies.length === 0 && !agenciesLoading) {
      void loadAgencies("");
    }
  }, [step, agencies.length, agenciesLoading, loadAgencies]);

  const filteredAgencies = React.useMemo(() => {
    if (!agencySearch.trim()) return agencies;
    const needle = agencySearch.toLowerCase();
    return agencies.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        a.slug.toLowerCase().includes(needle)
    );
  }, [agencies, agencySearch]);

  const pickAgency = React.useCallback(
    async (agency: Agency) => {
      setSelectedAgency(agency);
      setStep("previewing");
      setError("");
      setListings([]);
      setSelected(new Set());
      try {
        const result = (await previewListings({
          slug: agency.slug,
          maxListings: 50,
        })) as { listings: PreviewListing[]; errors: unknown[] };
        setListings(result.listings);
        setSelected(
          new Set(result.listings.map((l: PreviewListing) => l.pbRefCode))
        );
        setStep("selecting");
      } catch (e: unknown) {
        setError((e as Error).message || "Failed to fetch listings");
        setStep("picking_agency");
      }
    },
    [previewListings]
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
      imageFailures: [],
    };
    setProgress({ current: 0, total: batchCount });

    try {
      for (let i = 0; i < batchCount; i++) {
        const slice = selectedListings.slice(
          i * batchSize,
          (i + 1) * batchSize
        );
        const result = (await importBatch({ listings: slice })) as BatchResult;
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
        aggregated.imageFailures.push(
          ...result.imageFailures.map(
            (e: { row: number; url: string; message: string }) => ({
              row: e.row + i * batchSize,
              url: e.url,
              message: e.message,
            })
          )
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
            Import from PropertyBook
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
                  <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <Input
                      placeholder="Search by name or slug..."
                      value={agencySearch}
                      onChange={(e) => setAgencySearch(e.target.value)}
                      className="pl-9"
                    />
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
                ) : filteredAgencies.length === 0 ? (
                  <p className="py-10 text-center text-sm text-text-muted">
                    No agencies found.
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
                <p className="mt-4 text-sm text-text-muted">
                  Fetching listings from {selectedAgency?.name}…
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  This may take a minute while we pull each listing politely.
                </p>
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
                  Downloading images and saving properties. Please keep this
                  tab open.
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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                    <ResultTile
                      label="Image failures"
                      value={finalResult.imageFailures.length}
                      tone="warning"
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
                  {finalResult.imageFailures.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-text-muted">
                        Image failures ({finalResult.imageFailures.length})
                      </summary>
                      <ul className="mt-2 max-h-60 space-y-1 overflow-auto text-xs text-amber-700">
                        {finalResult.imageFailures.map((err, i) => (
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
