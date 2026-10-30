import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/finance/format";
import { InventoryBar, type Development } from "@/components/sales/shared";

/** A development at a glance: inventory bar and what buyers owe. */
export function DevelopmentCard({ d }: { d: Development }) {
  const total = d.available + d.reserved + d.sold;
  return (
    <Link
      href={`/app/dev/developments/${d._id}`}
      className={`block rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4 transition-colors hover:border-primary/50 ${d.isActive ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{d.name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-text-muted">
            {d.location && <MapPin className="h-3 w-3 shrink-0" />}
            {[d.location, d.developerName, d.currency].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {!d.isActive && <Badge variant="neutral">Closed</Badge>}
          {d.overdueBuyers > 0 && <Badge variant="danger">{d.overdueBuyers} overdue</Badge>}
        </div>
      </div>
      {total > 0 ? (
        <InventoryBar className="mt-3" sold={d.sold} reserved={d.reserved} available={d.available} />
      ) : (
        <p className="mt-3 text-xs text-text-muted">No stands yet. Open it to add them.</p>
      )}
      {d.sold > 0 && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-text-muted">Paid</dt>
            <dd className="truncate">{money(d.collected, d.currency)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-text-muted">Owed</dt>
            <dd className="truncate font-medium">{money(d.outstanding, d.currency)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-text-muted">Overdue</dt>
            <dd className={`truncate ${d.overdue > 0 ? "text-danger" : ""}`}>{money(d.overdue, d.currency)}</dd>
          </div>
        </dl>
      )}
    </Link>
  );
}
