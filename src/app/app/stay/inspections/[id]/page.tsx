"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useRequireAuth } from "@/hooks/useAuth";
import { InspectionEditor } from "@/components/stay/ops/inspection-editor";
import { InspectionReport } from "@/components/stay/ops/inspection-report";

export default function InspectionPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const inspection = useQuery(api.stay.inspections.get, { id: params.id as Id<"stayInspections"> });

  if (authLoading || inspection === undefined) return <ListSkeleton />;

  return (
    <div className="space-y-4">
      <Link href="/app/stay/inspections" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        Inspections
      </Link>
      {inspection.status === "draft" ? (
        <InspectionEditor inspection={inspection} />
      ) : (
        <InspectionReport inspection={inspection} />
      )}
    </div>
  );
}
