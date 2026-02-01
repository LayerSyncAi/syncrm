"use client";

import { use } from "react";
import { LeadDetail } from "@/components/leads/lead-detail";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = use(params);
  return <LeadDetail leadId={leadId as Id<"leads">} />;
}
