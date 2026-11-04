import { ArrowDown } from "lucide-react";
import { hero } from "./content";
import { Container, Eyebrow, GhostLink, WhatsAppButton } from "./bits";
import { MaskedLines, Reveal } from "./motion";
import { HeroPhoto } from "./hero-photo";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden pt-32 sm:pt-40">
      {/* Backdrop: a faint 12-column grid and a soft haze behind the phone. */}
      <div aria-hidden className="l-grid-lines pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[900px] w-[1200px] -translate-x-1/2 rounded-full opacity-90 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--l-haze), transparent)" }}
      />

      <Container className="relative flex flex-col items-center text-center">
        <Reveal y={12}>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--l-line-strong)] bg-[var(--l-bg-raised)]/60 px-3 py-1.5">
            <Eyebrow dot className="whitespace-nowrap !text-[11px] max-[379px]:!text-[10px]">
              {hero.eyebrow}
            </Eyebrow>
          </span>
        </Reveal>

        <h1 id="hero-title" className="l-h1 mt-7 max-w-[14ch]">
          <MaskedLines lines={[hero.lines[0], <span key="accent" className="l-accent">{hero.lines[1]}</span>]} delay={0.15} />
        </h1>

        <Reveal delay={0.55} className="mt-7 max-w-[58ch]">
          <p className="l-body-lg">{hero.sub}</p>
        </Reveal>

        <Reveal delay={0.7} className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <WhatsAppButton cta="hero" />
          <GhostLink href="#modules" icon={<ArrowDown size={16} strokeWidth={1.8} />}>
            {hero.secondary}
          </GhostLink>
        </Reveal>
      </Container>

      <div className="relative mx-auto mt-14 w-full max-w-[1320px] px-0 sm:mt-16 sm:px-8">
        <HeroPhoto />
        <p className="l-mono mt-5 px-4 text-center text-xs text-[var(--l-ink-3)]">{hero.micro}</p>
      </div>
    </section>
  );
}
