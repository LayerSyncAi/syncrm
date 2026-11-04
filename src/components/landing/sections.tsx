/**
 * The quieter sections: Who it's for, Built in Zimbabwe, How it works,
 * App coming soon, the final CTA and the footer. Spec §5.6–§5.12.
 */
import Image from "next/image";
import Link from "next/link";
import { Apple, Banknote, FileText, Inbox, LandPlot, MessageCircle, Phone, Play } from "lucide-react";
import { layerSyncUrl, whatsAppLink } from "@/config/marketing";
import { app, finalCta, footer, how, showcase, who, zimbabwe } from "./content";
import { Accent, Container, Eyebrow, Logo, WhatsAppButton } from "./bits";
import { Magnetic, Reveal } from "./motion";
import { ThemeToggle } from "./theme";
import { AppPhone, HowLine } from "./sections-client";
import { CtaPhone } from "./hero-photo";

export function WhoItsFor() {
  return (
    <section id="who" aria-labelledby="who-title" className="relative py-24 sm:py-32">
      <Container>
        <Reveal className="flex max-w-3xl flex-col gap-5">
          <Eyebrow dot>{who.eyebrow}</Eyebrow>
          <h2 id="who-title" className="l-h2">
            <Accent h={who.headline} />
          </h2>
        </Reveal>
      </Container>
      <div className="l-no-scrollbar mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:px-8 lg:mx-auto lg:grid lg:max-w-[1200px] lg:grid-cols-4 lg:overflow-visible">
        {who.cards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.08} className="l-stage group relative aspect-[3/4] w-[78vw] flex-none snap-center overflow-hidden rounded-[24px] sm:w-[46vw] lg:w-auto">
            <Image src={card.image} alt={card.alt} fill sizes="(min-width: 1024px) 300px, 78vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
            <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, var(--l-scrim) 8%, color-mix(in srgb, var(--l-scrim) 55%, transparent) 42%, transparent 70%)" }} />
            <div aria-hidden className="absolute inset-0 bg-[#0f2a28] mix-blend-color" style={{ opacity: "var(--l-photo-tint)" }} />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
              <h3 className="l-h3 text-[var(--l-scrim-ink)]">{card.title}</h3>
              <p className="text-[15px] leading-snug text-[var(--l-scrim-ink-2)]">{card.body}</p>
              <ul className="flex flex-wrap gap-1.5">
                {card.chips.map((c) => (
                  <li key={c} className="l-mono rounded-full bg-[var(--l-scrim-chip)] px-2.5 py-1 text-[11px] text-[var(--l-scrim-ink)] backdrop-blur">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const ZW_ICONS = [Banknote, Phone, Inbox, LandPlot, MessageCircle, FileText];

export function Zimbabwe() {
  return (
    <section id="zimbabwe" aria-labelledby="zimbabwe-title" className="py-12 sm:py-16">
      <div className="mx-auto max-w-[1280px] sm:px-8">
        <div className="l-stage l-stage-panel relative overflow-hidden px-6 py-20 sm:rounded-[32px] sm:px-14 sm:py-24">
          <div aria-hidden className="l-grid-lines pointer-events-none absolute inset-0 opacity-70" />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(155,216,61,0.22), transparent)" }}
          />
          <div className="relative grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end">
            <Reveal className="flex flex-col gap-6">
              <Eyebrow dot>Made here</Eyebrow>
              <h2 id="zimbabwe-title" className="l-h2">
                <Accent h={zimbabwe.headline} />
              </h2>
              <p className="l-body-lg max-w-[48ch]">{zimbabwe.body}</p>
            </Reveal>
            <ul className="grid gap-2 sm:grid-cols-2">
              {zimbabwe.chips.map((chip, i) => {
                const Icon = ZW_ICONS[i];
                return (
                  <Reveal as="li" key={chip} delay={i * 0.05} className="flex items-center gap-3 rounded-2xl border border-[var(--l-line)] bg-[var(--l-surface)] px-4 py-3.5">
                    <Icon size={17} strokeWidth={1.7} className="flex-none text-[var(--l-accent-ink)]" />
                    <span className="text-sm text-[var(--l-ink)]">{chip}</span>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="relative py-24 sm:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <Reveal className="flex flex-col gap-5">
            <Eyebrow dot>{how.eyebrow}</Eyebrow>
            <h2 id="how-title" className="l-h2">
              <Accent h={how.headline} />
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="l-body-lg max-w-[50ch]">{how.body}</p>
          </Reveal>
        </div>
        <HowLine steps={how.steps} />
      </Container>
    </section>
  );
}

export function AppComingSoon() {
  return (
    <section id="app" aria-labelledby="app-title" className="py-12 sm:py-16">
      <Container>
        <div className="l-card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <Reveal className="flex flex-col justify-center gap-6 p-6 min-[380px]:p-8 sm:p-14">
            <h2 id="app-title" className="l-h2">
              <Accent h={app.headline} />
            </h2>
            <p className="l-body-lg max-w-[46ch]">{app.body}</p>
            <div className="flex flex-col gap-3">
              <p className="l-eyebrow flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-[var(--l-accent)] shadow-[0_0_10px_var(--l-accent)]" />
                Native apps · Coming soon
              </p>
              <ul className="grid max-w-[440px] grid-cols-1 gap-3 min-[420px]:grid-cols-2" aria-label="Native apps, coming soon">
                {[
                  { icon: Apple, store: "App Store" },
                  { icon: Play, store: "Google Play" },
                ].map((b) => (
                  <li
                    key={b.store}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-dashed border-[var(--l-line-strong)] px-4 py-3 text-[var(--l-ink-2)]"
                  >
                    <b.icon size={22} strokeWidth={1.6} className="flex-none" />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="whitespace-nowrap text-[11px] text-[var(--l-ink-3)]">Coming soon to</span>
                      <span className="truncate text-[15px] font-medium text-[var(--l-ink)]">{b.store}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <div className="l-stage relative flex items-end justify-center">
            <AppPhone />
          </div>
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="py-12 sm:py-20">
      <div className="mx-auto max-w-[1280px] sm:px-8">
        <div className="l-stage l-stage-panel relative overflow-hidden px-6 pb-0 pt-20 text-center sm:rounded-[32px] sm:px-14 sm:pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(155,216,61,0.26), transparent)" }}
          />
          <Reveal className="relative mx-auto flex max-w-3xl flex-col items-center gap-6">
            <h2 id="cta-title" className="l-h2">
              <Accent h={finalCta.headline} />
            </h2>
            <p className="l-body-lg max-w-[44ch]">{finalCta.body}</p>
            <Magnetic className="mt-2">
              <WhatsAppButton size="lg" cta="final" />
            </Magnetic>
          </Reveal>
          <div className="relative mt-14">
            <CtaPhone />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[var(--l-line)] pt-16">
      <Container>
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex max-w-xs flex-col gap-4">
            <Logo />
            <p className="text-[15px] font-medium text-[var(--l-ink)]">{footer.tagline}</p>
            <p className="text-sm text-[var(--l-ink-2)]">{footer.blurb}</p>
          </div>
          <FooterCol title="Modules" links={showcase.chapters.map((c) => ({ label: c.name, href: `#module-${c.key}` }))} />
          <FooterCol
            title="Company"
            links={[
              { label: "LayerSync", href: layerSyncUrl, external: true },
              { label: "Chat on WhatsApp", href: "whatsapp" },
            ]}
          />
          <FooterCol
            title="Account"
            links={[
              { label: "Log in", href: "/login" },
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
            ]}
          />
        </div>
        <div className="mt-16 flex items-center justify-between gap-4 border-t border-[var(--l-line)] py-6">
          <p className="text-sm text-[var(--l-ink-3)]">© 2026 LayerSync. All rights reserved.</p>
          <ThemeToggle />
        </div>
      </Container>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string; external?: boolean }[] }) {
  return (
    <div>
      <p className="l-eyebrow">{title}</p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.href === "whatsapp" ? (
              <WhatsAppFooterLink label={l.label} />
            ) : l.href.startsWith("/") ? (
              <Link href={l.href} className="text-sm text-[var(--l-ink-2)] transition-colors hover:text-[var(--l-ink)]">
                {l.label}
              </Link>
            ) : (
              <a
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-sm text-[var(--l-ink-2)] transition-colors hover:text-[var(--l-ink)]"
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatsAppFooterLink({ label }: { label: string }) {
  return (
    <a href={whatsAppLink()} target="_blank" rel="noopener noreferrer" data-cta="footer" className="text-sm text-[var(--l-ink-2)] transition-colors hover:text-[var(--l-ink)]">
      {label}
    </a>
  );
}
