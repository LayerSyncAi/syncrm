import type { MouseEvent } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { telHref, whatsAppHref } from "@/lib/phone";

const linkStyles =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-border-strong text-xs font-medium text-text transition-all duration-150 hover:border-primary/60 hover:bg-surface-2 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

/**
 * Call and WhatsApp buttons for a phone number. Icon-only suits table rows;
 * labelled suits phone cards and record headers, where they are the main
 * thing an agent taps. Renders nothing without a usable number.
 */
export function ContactActions({
  phone,
  name,
  labelled = false,
  className,
}: {
  phone: string | null | undefined;
  name: string;
  labelled?: boolean;
  className?: string;
}) {
  const tel = telHref(phone);
  const wa = whatsAppHref(phone);
  if (!tel && !wa) return null;

  const size = labelled ? "h-9 px-3" : "h-9 w-9";
  // Rows and cards open the record on click; a call shouldn't do that too.
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className={cn("flex gap-1.5", className)}>
      {tel && (
        <a href={tel} onClick={stop} aria-label={`Call ${name}`} title="Call" className={cn(linkStyles, size)}>
          <Phone className="h-4 w-4" aria-hidden="true" />
          {labelled && "Call"}
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          aria-label={`WhatsApp ${name}`}
          title="WhatsApp"
          className={cn(linkStyles, size)}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {labelled && "WhatsApp"}
        </a>
      )}
    </div>
  );
}
