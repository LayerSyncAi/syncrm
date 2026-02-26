"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Id } from "../../../convex/_generated/dataModel";

interface DuplicateWarningProps {
  email?: string;
  phone?: string;
  excludeLeadId?: Id<"leads">;
  showMergeLink?: boolean;
}

export function DuplicateWarning({
  email,
  phone,
  excludeLeadId,
  showMergeLink = true,
}: DuplicateWarningProps) {
  const duplicates = useQuery(
    api.leadImport.findDuplicatesForLead,
    email || phone
      ? {
          email: email || undefined,
          phone: phone || undefined,
          excludeLeadId,
        }
      : "skip"
  );

  if (!duplicates || duplicates.length === 0) return null;

  // #29: Duplicate warning slide-in
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="rounded-[10px] border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800">
            Possible duplicate{duplicates.length > 1 ? "s" : ""} detected
          </p>
          <div className="mt-2 space-y-2">
            {duplicates.map((dup: { leadId: string; fullName: string; email: string | undefined; phone: string; reason: string }) => (
              <div
                key={dup.leadId}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-amber-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {dup.fullName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {dup.phone}
                    {dup.email && ` · ${dup.email}`}
                  </p>
                  <Badge variant="warning" className="mt-1">
                    {dup.reason}
                  </Badge>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link href={`/app/leads/${dup.leadId}`}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                  {showMergeLink && (
                    <Link
                      href={`/app/leads/merge?ids=${dup.leadId}${excludeLeadId ? `,${excludeLeadId}` : ""}`}
                    >
                      <Button variant="secondary" size="sm">
                        Merge
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
