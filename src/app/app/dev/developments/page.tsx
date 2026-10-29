"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Building2, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StayPageHeader } from "@/components/stay/page-header";
import { DevelopmentModal } from "@/components/sales/modals";
import { DevelopmentCard } from "@/components/dev/development-card";

export default function DevDevelopmentsPage() {
  const router = useRouter();
  const summary = useQuery(api.dev.dashboard.summary);
  const devs = useQuery(api.dev.sales.listDevelopments);
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (devs ?? []).filter((d) => !q || `${d.name} ${d.location ?? ""} ${d.developerName}`.toLowerCase().includes(q));
  }, [devs, search]);

  if (summary === undefined || devs === undefined) return <ListSkeleton />;
  const { canManage, financeOn } = summary.role;

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Developments"
        description="Tap a development to see its stands, reserve and sell."
        actions={
          canManage && (
            <Button className="h-11 gap-2 px-5" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New development
            </Button>
          )
        }
      />

      {devs.length > 0 && <Input className="sm:max-w-sm" placeholder="Search by name, place or developer" value={search} onChange={(e) => setSearch(e.target.value)} />}

      {devs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No developments yet"
          description={canManage ? "Create a development, then add its stands." : "Ask a director or sales manager to add the first development."}
          action={canManage ? <Button onClick={() => setCreating(true)}>New development</Button> : undefined}
        />
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-muted">No development matches &quot;{search}&quot;.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => (
            <DevelopmentCard key={d._id} d={d} />
          ))}
        </div>
      )}

      {creating && (
        <DevelopmentModal dev={null} financeOn={financeOn} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/app/dev/developments/${id}?add=1`)} />
      )}
    </div>
  );
}
