"use client";

import { useQuery } from "convex/react";
import { Building2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KindGuard, PageTitle, PortalLoading } from "@/components/portal/common";
import { formatDay } from "@/lib/stay-ops/labels";

function Inner() {
  const props = useQuery(api.portal.landlord.properties);
  if (props === undefined) return <PortalLoading />;
  return (
    <>
      <PageTitle title="Properties" />
      {props.length === 0 ? (
        <EmptyState icon={Building2} title="No properties yet" description="Your properties will appear here." />
      ) : (
        <div className="space-y-4">
          {props.map((p) => (
            <Card key={p._id}>
              <CardHeader>
                <h2 className="font-medium text-text">{p.title}</h2>
                {p.location && <p className="text-sm text-text-muted">{p.location}</p>}
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {p.units.length === 0 && <p className="text-sm text-text-muted">No units.</p>}
                {p.units.map((u) => (
                  <div key={u._id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-text">{u.label}</p>
                      {u.tenantName ? (
                        <p className="text-sm text-text-muted">
                          {u.tenantName}
                          {u.leaseStart ? `. ${formatDay(u.leaseStart)}` : ""}
                          {u.leaseEnd ? ` to ${formatDay(u.leaseEnd)}` : ""}
                        </p>
                      ) : (
                        <p className="text-sm text-text-dim">No current tenant</p>
                      )}
                    </div>
                    <Badge variant={u.status === "vacant" ? "warning" : "success"}>
                      {u.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function PortalPropertiesPage() {
  return <KindGuard kind="landlord"><Inner /></KindGuard>;
}
