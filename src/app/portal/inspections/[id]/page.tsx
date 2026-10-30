"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PortalInspectionView } from "@/components/portal/inspection-view";
import { NotAvailable, PortalLoading, usePortal } from "@/components/portal/common";

export default function PortalInspectionPage() {
  const { id } = useParams<{ id: string }>();
  const portal = usePortal();
  if (portal === undefined) return <PortalLoading />;
  if (!portal) return <NotAvailable />;
  const back = portal.kind === "tenant" ? "/portal/lease" : "/portal/inspections";
  return (
    <div>
      <Link href={back} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-primary-ink">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <PortalInspectionView id={id} kind={portal.kind} />
    </div>
  );
}
