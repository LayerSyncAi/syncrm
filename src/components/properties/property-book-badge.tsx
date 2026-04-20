import Link from "next/link";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

interface PropertyBookBadgeProps {
  refCode?: string;
  sourceUrl?: string;
  className?: string;
}

export function PropertyBookBadge({ refCode, sourceUrl, className }: PropertyBookBadgeProps) {
  if (!refCode) return null;
  const badge = (
    <Badge variant="secondary" className={className}>
      <Globe className="mr-1 h-3 w-3" />
      PropertyBook
    </Badge>
  );

  if (!sourceUrl) {
    return (
      <Tooltip content={`Imported from PropertyBook (${refCode})`}>
        {badge}
      </Tooltip>
    );
  }

  return (
    <Tooltip content={`View original on PropertyBook (${refCode})`}>
      <Link
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </Link>
    </Tooltip>
  );
}
