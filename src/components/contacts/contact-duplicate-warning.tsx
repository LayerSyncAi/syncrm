"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ContactDuplicateWarningProps {
  phone: string;
  email: string;
  excludeId?: Id<"contacts">;
}

/**
 * HB-33: warns while a contact is being entered that the org already has one
 * with the same phone or email. Saving is still allowed.
 */
export function ContactDuplicateWarning({ phone, email, excludeId }: ContactDuplicateWarningProps) {
  const [debounced, setDebounced] = React.useState({ phone, email });
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced({ phone, email }), 400);
    return () => clearTimeout(timer);
  }, [phone, email]);

  const p = debounced.phone.replace(/\D/g, "").length >= 7 ? debounced.phone : "";
  const e = debounced.email.includes("@") ? debounced.email : "";
  const matches = useQuery(
    api.contacts.findDuplicates,
    p || e ? { phone: p || undefined, email: e || undefined, excludeId } : "skip"
  );

  if (!matches || matches.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800">
            {matches.length > 1 ? "These contacts look like the same person" : "This contact may already exist"}
          </p>
          <div className="mt-2 space-y-2">
            {matches.map((m) => (
              <div
                key={m._id}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-amber-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{m.name}</p>
                  <p className="truncate text-xs text-text-muted">
                    {[m.phone, m.email].filter(Boolean).join(" · ")}
                  </p>
                  <Badge variant="warning" className="mt-1">{m.reason}</Badge>
                </div>
                {m.canOpen ? (
                  <Link href={`/app/contacts/${m._id}`}>
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-text-muted">Another agent&apos;s contact</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
