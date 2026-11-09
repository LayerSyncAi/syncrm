"use client";

/**
 * "Get in touch": every WhatsApp button on the landing page opens this first.
 * The visitor leaves a name and number, we save them (convex/websiteEnquiries.ts),
 * and WhatsApp opens with a message that introduces them.
 *
 * The buttons stay plain wa.me links (marked `data-enquire`), so they still
 * work before this script loads or if it fails. One click listener on the
 * document intercepts them; a modifier-click still opens the link directly.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { cleanEnquiry } from "../../../convex/lib/websiteEnquiries";
import { copyEnquiryToSyncSite } from "./syncsite";
import { enquiryWhatsAppMessage, salesPhoneDisplay, salesPhoneE164, whatsAppLink } from "@/config/marketing";
import { Roll, WhatsAppGlyph } from "./bits";

const REMEMBER_KEY = "syncestate-enquiry";

type Context = { interest?: string; cta?: string };
type Stage = { kind: "form" } | { kind: "sent"; name: string; link: string };

function remembered(): { name: string; phone: string } {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    const v = raw ? (JSON.parse(raw) as { name?: unknown; phone?: unknown }) : {};
    return { name: typeof v.name === "string" ? v.name : "", phone: typeof v.phone === "string" ? v.phone : "" };
  } catch {
    return { name: "", phone: "" };
  }
}

function remember(name: string, phone: string) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name, phone }));
  } catch {
    // Private mode or blocked storage: the form just starts empty next time.
  }
}

/** Open WhatsApp in a new tab; if the browser blocks it, wait briefly for the save and go there in this tab. */
async function openWhatsApp(link: string, saving: Promise<unknown>) {
  const win = window.open(link, "_blank");
  if (win) {
    win.opener = null;
    return;
  }
  await Promise.race([saving, new Promise((r) => setTimeout(r, 1500))]);
  window.location.assign(link);
}

export function EnquiryDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submit = useMutation(api.websiteEnquiries.submit);

  const [context, setContext] = useState<Context>({});
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const open = useCallback((ctx: Context, trigger: HTMLElement | null) => {
    const saved = remembered();
    setName((n) => n || saved.name);
    setPhone((p) => p || saved.phone);
    setErrors({});
    setStage({ kind: "form" });
    setContext(ctx);
    triggerRef.current = trigger;
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    requestAnimationFrame(() => nameRef.current?.focus());
  }, []);

  // Intercept every [data-enquire] link on the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[data-enquire]") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      open({ interest: a.dataset.interest || undefined, cta: a.dataset.cta || undefined }, a);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const close = () => dialogRef.current?.close();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = cleanEnquiry({ name, phone, site: "syncestate", interest: context.interest });
    if (!cleaned.ok) {
      // Check each field on its own so both messages show at once.
      const nameCheck = cleanEnquiry({ name, phone: "0771234567" });
      const phoneCheck = cleanEnquiry({ name: "OK", phone });
      const next = {
        name: nameCheck.ok ? undefined : nameCheck.error,
        phone: phoneCheck.ok ? undefined : phoneCheck.error,
      };
      setErrors(next);
      (next.name ? nameRef.current : dialogRef.current?.querySelector<HTMLInputElement>("#enquiry-phone"))?.focus();
      return;
    }
    const v = cleaned.value;
    remember(v.name, phone.trim());
    const link = whatsAppLink(enquiryWhatsAppMessage({ name: v.name, phone: v.phone, interest: context.interest }));

    // Save in the background; WhatsApp opens whether or not this succeeds.
    copyEnquiryToSyncSite({ name: v.name, phone: v.phone, interest: context.interest, button: context.cta });
    const saving = submit({
      name: v.name,
      phone: v.phone,
      site: "syncestate",
      interest: context.interest,
      cta: context.cta,
      page: window.location.pathname,
    }).catch(() => undefined);

    setStage({ kind: "sent", name: v.name.split(" ")[0], link });
    void openWhatsApp(link, saving);
  };

  return (
    <dialog
      ref={dialogRef}
      className="l-dialog"
      aria-labelledby="enquiry-title"
      onClose={() => triggerRef.current?.focus()}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === dialogRef.current) close();
      }}
    >
      <div className="l-dialog-panel">
        <button type="button" className="l-orb grid h-10 w-10 place-items-center l-dialog-close" aria-label="Close" onClick={close}>
          <X size={18} />
        </button>

        {stage.kind === "form" ? (
          <form onSubmit={onSubmit} noValidate>
            <p className="l-eyebrow flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--l-accent)] shadow-[0_0_10px_var(--l-accent)]" />
              Get in touch
            </p>
            <h2 id="enquiry-title" className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.03em]">
              {context.interest ? `Let's talk about ${context.interest}.` : "Let's get your agency in sync."}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--l-ink-2)]">
              Leave your name and number, and we&apos;ll pick it up with you on WhatsApp.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="enquiry-name" className="text-sm font-medium">Your name</label>
                <input
                  ref={nameRef}
                  id="enquiry-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "enquiry-name-error" : undefined}
                  placeholder="Rudo Chikwanha"
                  className="l-input mt-1.5"
                />
                {errors.name && <p id="enquiry-name-error" className="l-field-error">{errors.name}</p>}
              </div>
              <div>
                <label htmlFor="enquiry-phone" className="text-sm font-medium">Phone number</label>
                <input
                  id="enquiry-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={24}
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "enquiry-phone-error" : "enquiry-phone-hint"}
                  placeholder="077 123 4567"
                  className="l-input mt-1.5"
                />
                {errors.phone ? (
                  <p id="enquiry-phone-error" className="l-field-error">{errors.phone}</p>
                ) : (
                  <p id="enquiry-phone-hint" className="mt-1.5 text-xs text-[var(--l-ink-3)]">Zimbabwe numbers get +263 automatically.</p>
                )}
              </div>
            </div>

            <button type="submit" className="l-btn l-btn-primary l-btn-lg mt-6 w-full">
              <WhatsAppGlyph size={20} />
              <Roll>Continue to WhatsApp</Roll>
            </button>
            <p className="mt-4 text-center text-xs leading-relaxed text-[var(--l-ink-3)]">
              We only use your details to reply to you. See our{" "}
              <a href="/privacy" className="underline underline-offset-2 hover:text-[var(--l-ink-2)]">privacy policy</a>.
              <br />
              Prefer to call? <a href={`tel:${salesPhoneE164}`} className="underline underline-offset-2 hover:text-[var(--l-ink-2)]">{salesPhoneDisplay}</a>
            </p>
          </form>
        ) : (
          <div role="status">
            <p className="l-eyebrow">Opening WhatsApp</p>
            <h2 id="enquiry-title" className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.03em]">
              Thanks, {stage.name}.
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--l-ink-2)]">
              WhatsApp is opening with your message to LayerSync. Just press send. If it didn&apos;t open, use the button below.
            </p>
            <a href={stage.link} target="_blank" rel="noopener noreferrer" className="l-btn l-btn-primary l-btn-lg mt-6 w-full" data-cta="enquiry-retry">
              <WhatsAppGlyph size={20} />
              <Roll>Open WhatsApp</Roll>
            </a>
            <button type="button" onClick={close} className="l-btn l-btn-ghost mt-3 w-full">
              <Roll>Close</Roll>
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
