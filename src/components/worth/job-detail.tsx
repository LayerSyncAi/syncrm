"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useRequireAuth } from "@/hooks/useAuth";
import { PURPOSE_LABELS } from "@/lib/worth/format";
import { JobActivity } from "./job-activity";
import { JobDocuments } from "./job-documents";
import { JobEvidence } from "./job-evidence";
import { JobOverview } from "./job-overview";
import { JobReport } from "./job-report";
import { InspectionForm } from "./inspection-form";
import { ValuationForm } from "./valuation-form";
import { DueText, PageHeader, StatusBadge, Tabs } from "./ui";

type Tab = "overview" | "inspection" | "evidence" | "valuation" | "report" | "documents" | "activity";

export function JobDetail({ jobId }: { jobId: Id<"worthJobs"> }) {
  const { isLoading } = useRequireAuth();
  const job = useQuery(api.worth.jobs.get, { jobId });
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";

  const setTab = (t: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (t === "overview") q.delete("tab");
    else q.set("tab", t);
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  if (isLoading || job === undefined) return <ListSkeleton />;
  if (job === null) {
    return (
      <EmptyState
        icon={SearchX}
        title="Job not found"
        description="It may belong to another valuer, or you may not have access to it."
      />
    );
  }

  const valueTabs: Array<{ key: Tab; label: string }> = job.caps.seesValues
    ? [
        { key: "inspection", label: "Inspection" },
        { key: "evidence", label: "Evidence" },
        { key: "valuation", label: "Valuation" },
        { key: "report", label: "Report" },
        { key: "documents", label: "Documents" },
      ]
    : [];
  const tabs = [{ key: "overview" as Tab, label: "Overview" }, ...valueTabs, { key: "activity" as Tab, label: "Activity" }];
  const active = tabs.some((t) => t.key === tab) ? tab : "overview";

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/app/worth/jobs", label: "Jobs" }}
        title={job.propertyAddress}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-text">{job.reference}</span>
            {job.version > 1 && <span>Version {job.version}</span>}
            <span>{job.suburb}</span>
            <span>{job.clientName}</span>
            <span>{PURPOSE_LABELS[job.purpose]}</span>
            <span>
              Due <DueText dueDate={job.dueDate} flag={job.dueFlag} />
            </span>
          </span>
        }
        actions={<StatusBadge status={job.status} />}
      />
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      {active === "overview" && <JobOverview job={job} />}
      {active === "inspection" && <InspectionForm job={job} />}
      {active === "evidence" && <JobEvidence job={job} />}
      {active === "valuation" && <ValuationForm key={`${job.status}-${job.version}`} job={job} />}
      {active === "report" && <JobReport job={job} />}
      {active === "documents" && <JobDocuments job={job} />}
      {active === "activity" && <JobActivity job={job} />}
    </div>
  );
}
