"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, XCircle } from "lucide-react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

type TrackedAgency = {
  _id: Id<"trackedAgencies">;
  slug: string;
  name: string;
  logoUrl?: string;
  lastRefreshAt?: number;
  lastRefreshStatus?: "ok" | "error";
  lastRefreshError?: string;
};
import { useRequireAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { propertyBookToasts } from "@/lib/toast";

export default function TrackedAgenciesPage() {
  const { isLoading: authLoading, isAdmin } = useRequireAuth();
  const tracked = useQuery(api.propertyBook.listTrackedAgencies, {});
  const untrack = useMutation(api.propertyBook.untrackAgency);

  const [busyId, setBusyId] = React.useState<string | null>(null);

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
        </CardContent>
      </Card>
    );
  }

  const handleUntrack = async (
    id: Id<"trackedAgencies">,
    name: string
  ) => {
    setBusyId(id);
    try {
      await untrack({ id });
      propertyBookToasts.agencyUntracked(name);
    } catch (e: unknown) {
      propertyBookToasts.trackFailed((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text">
            Tracked PropertyBook agencies
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            These agencies refresh nightly. Price and status updates on
            propertybook.co.zw flow into previously imported listings.
          </p>
        </div>
        <Link href="/app/properties/import/propertybook">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Import more
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Active agencies</h2>
        </CardHeader>
        <CardContent>
          {tracked === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tracked.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              No agencies tracked yet. Import from one to start auto-refreshing.
            </p>
          ) : (
            <ul className="divide-y divide-border-strong">
              {(tracked as TrackedAgency[]).map((agency) => (
                <li
                  key={agency._id}
                  className="flex items-center gap-3 py-3"
                >
                  {agency.logoUrl ? (
                    <Image
                      src={agency.logoUrl}
                      alt={agency.name}
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 rounded-md bg-gray-50 object-contain"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-sm font-medium text-text-muted">
                      {agency.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {agency.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                      <span>Slug: {agency.slug}</span>
                      {agency.lastRefreshAt && (
                        <span>
                          Last refresh:{" "}
                          {new Date(agency.lastRefreshAt).toLocaleString()}
                        </span>
                      )}
                      {agency.lastRefreshStatus === "error" && (
                        <Badge variant="danger" className="px-2 py-0.5 text-[10px]">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Error
                        </Badge>
                      )}
                      {agency.lastRefreshStatus === "ok" && (
                        <Badge variant="success" className="px-2 py-0.5 text-[10px]">
                          OK
                        </Badge>
                      )}
                    </div>
                    {agency.lastRefreshError && (
                      <p className="mt-1 text-[11px] text-red-600">
                        {agency.lastRefreshError}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === agency._id}
                    onClick={() => handleUntrack(agency._id, agency.name)}
                  >
                    Untrack
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
