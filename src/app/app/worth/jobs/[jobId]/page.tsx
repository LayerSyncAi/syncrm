"use client";

import { Suspense, use } from "react";
import { JobDetail } from "@/components/worth/job-detail";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Id } from "../../../../../../convex/_generated/dataModel";

export default function WorthJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <JobDetail jobId={jobId as Id<"worthJobs">} />
    </Suspense>
  );
}
