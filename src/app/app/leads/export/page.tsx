"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Input } from "@/components/ui/input";
import { FlipCalendar } from "@/components/ui/flip-calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { generateCSV, downloadBlob } from "@/lib/csv";
import { Download, FileSpreadsheet } from "lucide-react";
import { Id } from "../../../../../convex/_generated/dataModel";
import { exportToasts } from "@/lib/toast";

const sectionVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const sectionItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const ALL_FIELDS = [
  { key: "fullName", label: "Full Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "interestType", label: "Interest Type" },
  { key: "budgetCurrency", label: "Budget Currency" },
  { key: "budgetMin", label: "Budget Min" },
  { key: "budgetMax", label: "Budget Max" },
  { key: "preferredAreas", label: "Preferred Areas" },
  { key: "notes", label: "Notes" },
  { key: "stageName", label: "Stage" },
  { key: "ownerName", label: "Assigned Agent" },
  { key: "score", label: "Score" },
  { key: "closedAt", label: "Closed At" },
  { key: "closeReason", label: "Close Reason" },
  { key: "createdAt", label: "Created At" },
  { key: "updatedAt", label: "Updated At" },
];

export default function LeadExportPage() {
  const { isLoading: authLoading, isAdmin } = useRequireAuth();

  const [stageFilter, setStageFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>(
    ALL_FIELDS.map((f) => f.key)
  );
  const [exporting, setExporting] = useState(false);

  const stages = useQuery(api.stages.list);
  const users = useQuery(api.users.listAll);

  const exportArgs = {
    stageId: stageFilter
      ? (stageFilter as Id<"pipelineStages">)
      : undefined,
    ownerUserId: ownerFilter
      ? (ownerFilter as Id<"users">)
      : undefined,
    dateFrom: dateFrom ? dateFrom.getTime() : undefined,
    dateTo: dateTo
      ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59).getTime()
      : undefined,
  };

  const leads = useQuery(api.leadExport.getLeadsForExport, exportArgs);

  const toggleField = (key: string) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const selectAllFields = () => setSelectedFields(ALL_FIELDS.map((f) => f.key));
  const deselectAllFields = () => setSelectedFields(["fullName", "phone"]);

  const exportCSV = () => {
    if (!leads) return;
    setExporting(true);
    try {
      const headers = selectedFields.map(
        (k) => ALL_FIELDS.find((f) => f.key === k)?.label || k
      );
      const rows = leads.map((lead: Record<string, unknown>) =>
        selectedFields.map((k) => String(lead[k] ?? ""))
      );
      const csv = generateCSV(headers, rows);
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
        `leads-export-${new Date().toISOString().slice(0, 10)}.csv`
      );
      exportToasts.complete("CSV", leads.length);
    } catch (error) {
      exportToasts.failed(error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    if (!leads) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const headers = selectedFields.map(
        (k) => ALL_FIELDS.find((f) => f.key === k)?.label || k
      );
      const rows = leads.map((lead: Record<string, unknown>) =>
        selectedFields.map((k) => lead[k] ?? "")
      );

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob(
        new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      exportToasts.complete("Excel", leads.length);
    } catch (error) {
      exportToasts.failed(error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <motion.div
      variants={sectionVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={sectionItemVariants}>
        <h1 className="text-xl font-semibold text-text">Lead Export</h1>
        <p className="mt-1 text-sm text-text-muted">
          Export leads to CSV or Excel
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div variants={sectionItemVariants}>
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Filters</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                Stage
              </label>
              <StaggeredDropDown
                value={stageFilter}
                onChange={(val) => setStageFilter(val)}
                options={[
                  { value: "", label: "All Stages" },
                  ...(stages?.map((s) => ({ value: s._id, label: s.name })) ?? []),
                ]}
              />
            </div>

            {isAdmin && (
              <div>
                <label className="mb-1 block text-sm font-medium text-text">
                  Assigned Agent
                </label>
                <StaggeredDropDown
                  value={ownerFilter}
                  onChange={(val) => setOwnerFilter(val)}
                  options={[
                    { value: "", label: "All Agents" },
                    ...(users?.map((u) => ({ value: u._id, label: u.fullName || u.name || u.email || "Unknown" })) ?? []),
                  ]}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                Date From
              </label>
              <FlipCalendar
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="Start date"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                Date To
              </label>
              <FlipCalendar
                value={dateTo}
                onChange={setDateTo}
                placeholder="End date"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Column Selector */}
      <motion.div variants={sectionItemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Select Columns</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllFields}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAllFields}>
                Min Only
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* #36: Column chip toggle animation */}
          <div className="flex flex-wrap gap-2">
            {ALL_FIELDS.map((field) => (
              <motion.label
                key={field.key}
                whileTap={{ scale: 0.95 }}
                animate={{
                  scale: selectedFields.includes(field.key) ? 1 : 0.97,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={`flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-sm transition-colors ${
                  selectedFields.includes(field.key)
                    ? "border-primary-600 bg-primary-600/10 text-primary-600"
                    : "border-border-strong text-text-muted hover:border-primary-600/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.key)}
                  onChange={() => toggleField(field.key)}
                  className="sr-only"
                />
                {field.label}
              </motion.label>
            ))}
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Export Actions */}
      <motion.div variants={sectionItemVariants}>
      <Card>
        <CardContent className="flex items-center justify-between py-5">
          <p className="text-sm text-text-muted">
            {leads === undefined ? (
              <Skeleton className="inline-block h-5 w-24" />
            ) : (
              <>{leads.length} leads match your filters</>
            )}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={exportCSV}
              disabled={!leads || leads.length === 0 || exporting}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={exportExcel}
              disabled={!leads || leads.length === 0 || exporting}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Excel (.xlsx)
            </Button>
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
  );
}
