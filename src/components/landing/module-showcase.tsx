"use client";

/**
 * "The Stage": the module showcase (spec §5.4). On desktop a sticky phone
 * swaps to each module's screens as its chapter scrolls past; a rail of
 * module icons jumps between chapters. Below 1024px each chapter stacks
 * with its own phone, under a sticky chip bar.
 */
import { ArrowUpRight, Check, FileSignature } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { moduleWhatsAppMessage, whatsAppLink } from "@/config/marketing";
import { showcase, type Chapter, type ModuleKey } from "./content";
import { Accent, Container, Eyebrow } from "./bits";
import { Reveal } from "./motion";
import { ThemedPhoneStage } from "./phone/phone-stage";
import { CHAPTER_SCREENS } from "./phone/screens";
import { SyncDevIcon, SyncFinanceIcon, SyncMediaIcon, SyncStayIcon, SyncWorthIcon, SynCrmIcon } from "@/components/brand/product-icons";

const ICONS: Record<ModuleKey, LucideIcon> = {
  crm: SynCrmIcon,
  viewings: FileSignature,
  stay: SyncStayIcon,
  worth: SyncWorthIcon,
  finance: SyncFinanceIcon,
  dev: SyncDevIcon,
  media: SyncMediaIcon,
};

const chapters = showcase.chapters as Chapter[];

/** A module chip; the glass marker's dark label copy uses the same box. */
const CHIP = "relative flex h-11 flex-none items-center justify-center rounded-full px-4 text-sm font-medium leading-none";

/** All chapters' screens in one list, so one stage can show any of them. */
const ALL_SCREENS = chapters.flatMap((ch) => CHAPTER_SCREENS[ch.key]);
const OFFSETS = chapters.reduce<number[]>((acc, ch, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + CHAPTER_SCREENS[chapters[i - 1].key].length);
  return acc;
}, []);

function ChapterCopy({ ch, index }: { ch: Chapter; index: number }) {
  const Icon = ICONS[ch.key];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[14px] border border-[var(--l-line-strong)] bg-[var(--l-surface)] text-[var(--l-accent-ink)]">
          <Icon size={22} strokeWidth={1.5} />
        </span>
        <span className="l-mono text-sm font-medium text-[var(--l-ink)]">
          <span className="text-[var(--l-ink-3)]">0{index + 1} · </span>
          {ch.name}
        </span>
      </div>
      <Eyebrow>{ch.eyebrow}</Eyebrow>
      <h3 className="text-[clamp(28px,3.1vw,46px)] font-medium leading-[1.05] tracking-[-0.035em] [text-wrap:balance]">
        <Accent h={ch.headline} />
      </h3>
      <p className="l-body-lg max-w-[46ch]">{ch.body}</p>
      <ul className="flex flex-col gap-3">
        {ch.proof.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-snug text-[var(--l-ink)]">
            <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--l-accent)] text-[var(--l-on-accent)]">
              <Check size={12} strokeWidth={3} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <a
        href={whatsAppLink(moduleWhatsAppMessage(ch.askAbout))}
        target="_blank"
        rel="noopener noreferrer"
        data-cta={`module-${ch.key}`}
        className="group inline-flex w-fit items-center gap-1.5 text-[15px] font-medium text-[var(--l-accent-ink)]"
      >
        Ask about {ch.name} on WhatsApp
        <ArrowUpRight size={16} strokeWidth={2} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}

export function ModuleShowcase() {
  const [active, setActive] = useState(0);
  const [subState, setSub] = useState({ chapter: 0, i: 0 });
  const sub = subState.chapter === active ? subState.i : 0;
  const refs = useRef<(HTMLElement | null)[]>([]);
  const chipRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const chipBarRef = useRef<HTMLDivElement>(null);
  const chipGlassRef = useRef<HTMLSpanElement>(null);
  const chipInkRef = useRef<HTMLSpanElement>(null);

  // The chapter in the middle of the viewport is the active one.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setActive(i);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // Cycle through the active chapter's screens.
  useEffect(() => {
    const n = CHAPTER_SCREENS[chapters[active].key].length;
    if (n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(
      () => setSub((s) => ({ chapter: active, i: ((s.chapter === active ? s.i : 0) + 1) % n })),
      6500
    );
    return () => window.clearInterval(t);
  }, [active]);

  // Keep the active chip centred in the mobile chip bar. Scroll the bar
  // sideways only: scrollIntoView would also scroll the page, and since this
  // runs on mount it used to drag phones down to this section on load.
  useEffect(() => {
    const bar = chipBarRef.current;
    const chip = chipRefs.current[active];
    if (!bar || !chip || bar.clientWidth === 0) return;
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  // Slide the lime glass marker onto the active chip. Written straight to the
  // DOM: it follows layout (fonts, resizes), not React state. The marker
  // carries a dark copy of the labels moved the opposite way, so the copy
  // stays over the real labels and text turns dark exactly where the glass
  // covers it, mid-slide too. The first placement is instant; data-ready
  // turns the slide on after it.
  useEffect(() => {
    const bar = chipBarRef.current;
    const glass = chipGlassRef.current;
    const ink = chipInkRef.current;
    if (!bar || !glass || !ink) return;
    let frame = 0;
    const place = () => {
      const chip = chipRefs.current[active];
      if (!chip || bar.clientWidth === 0) return;
      glass.style.width = `${chip.offsetWidth}px`;
      glass.style.height = `${chip.offsetHeight}px`;
      glass.style.transform = `translate(${chip.offsetLeft}px, ${chip.offsetTop}px)`;
      ink.style.transform = `translate(${-chip.offsetLeft}px, ${-chip.offsetTop}px)`;
      if (!("ready" in bar.dataset)) frame = requestAnimationFrame(() => (bar.dataset.ready = ""));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(bar);
    chipRefs.current.forEach((c) => c && ro.observe(c));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active]);

  const stageIndex = OFFSETS[active] + sub;
  const label = useMemo(() => `${chapters[active].name} on a phone: ${chapters[active].eyebrow.toLowerCase()}.`, [active]);

  const jump = (i: number) => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <section id="modules" aria-labelledby="modules-title" className="relative py-24 sm:py-32">
      <Container>
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <Eyebrow dot>{showcase.eyebrow}</Eyebrow>
          <h2 id="modules-title" className="l-h2">
            <Accent h={showcase.headline} />
          </h2>
          <p className="l-body-lg">{showcase.sub}</p>
        </Reveal>
      </Container>

      {/* Mobile and tablet: sticky chip bar. */}
      <nav aria-label="Modules" className="sticky top-[76px] z-30 mt-12 lg:hidden">
        <div
          ref={chipBarRef}
          className="l-chipbar l-no-scrollbar relative mx-3 flex gap-1 overflow-x-auto rounded-full border border-[var(--l-line)] bg-[var(--l-nav)] p-1.5 backdrop-blur-xl"
        >
          {chapters.map((ch, i) => (
            <a
              key={ch.key}
              ref={(el) => {
                chipRefs.current[i] = el;
              }}
              href={`#module-${ch.key}`}
              aria-current={i === active ? "true" : undefined}
              className={`${CHIP} text-[var(--l-ink-2)] transition-colors hover:text-[var(--l-ink)]`}
            >
              {ch.name}
            </a>
          ))}
          <span ref={chipGlassRef} aria-hidden className="l-tab-glass z-[1]">
            <span ref={chipInkRef} className="l-tab-ink flex gap-1 p-1.5">
              {chapters.map((ch) => (
                <span key={ch.key} className={CHIP}>
                  {ch.name}
                </span>
              ))}
            </span>
          </span>
        </div>
      </nav>

      <Container className="mt-10 lg:mt-20">
        <div className="lg:grid lg:grid-cols-[56px_minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          {/* Desktop rail. */}
          <div className="hidden lg:block">
            <div
              role="tablist"
              aria-label="Modules"
              aria-orientation="vertical"
              className="l-rail sticky top-[calc(50vh-200px)] flex flex-col gap-2"
              style={{ "--i": active } as CSSProperties}
            >
              {chapters.map((ch, i) => {
                const Icon = ICONS[ch.key];
                const on = i === active;
                return (
                  <button
                    key={ch.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`module-${ch.key}`}
                    tabIndex={on ? 0 : -1}
                    title={ch.name}
                    onClick={() => jump(i)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const next = (i + (e.key === "ArrowDown" ? 1 : -1) + chapters.length) % chapters.length;
                        jump(next);
                        (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                      }
                    }}
                    className="relative grid h-12 w-12 place-items-center rounded-2xl border border-[var(--l-line)] bg-[var(--l-surface)] text-[var(--l-ink-3)] transition-colors hover:text-[var(--l-ink)]"
                  >
                    <Icon size={20} strokeWidth={1.6} />
                    <span className="sr-only">{ch.name}</span>
                  </button>
                );
              })}
              {/* The glass marker, with a dark copy of the icons (see the chip
                  bar). Last child, so the arrow keys' children[next] still
                  finds the tabs. */}
              <span aria-hidden className="l-tab-glass z-[1] h-12 w-12 rounded-2xl">
                <span className="l-tab-ink flex flex-col gap-2">
                  {chapters.map((ch) => {
                    const Icon = ICONS[ch.key];
                    return (
                      <span key={ch.key} className="grid h-12 w-12 place-items-center">
                        <Icon size={20} strokeWidth={1.6} />
                      </span>
                    );
                  })}
                </span>
              </span>
            </div>
          </div>

          {/* Chapters. */}
          <div className="flex flex-col gap-24 lg:gap-0">
            {chapters.map((ch, i) => (
              <article
                key={ch.key}
                id={`module-${ch.key}`}
                data-index={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                aria-label={ch.name}
                className="scroll-mt-40 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:items-center md:gap-10 lg:flex lg:min-h-[88vh] lg:items-center"
              >
                <div className={`transition-opacity duration-500 lg:py-16 ${i === active ? "lg:opacity-100" : "lg:opacity-35"}`}>
                  <ChapterCopy ch={ch} index={i} />
                </div>
                {/* Below desktop: the chapter's own phone, beside the copy from
                    768px. Never taller than the screen (landscape phones). */}
                <div
                  className="l-stage l-stage-panel mx-auto mt-10 w-full overflow-hidden rounded-[28px] md:mt-0 lg:hidden"
                  style={{ maxWidth: "calc(86svh * 0.775)" }}
                >
                  <ThemedPhoneStage
                    photo="stage"
                    screens={CHAPTER_SCREENS[ch.key]}
                    crop={{ x: [0.06, 0.92], y: [0.05, 0.88] }}
                    sizes="(max-width: 767px) 130vw, (max-width: 1023px) 60vw, 1px"
                    showDots
                    label={`${ch.name} on a phone: ${ch.eyebrow.toLowerCase()}.`}
                  />
                </div>
              </article>
            ))}
          </div>

          {/* Desktop: one sticky phone. */}
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-min(41vh,400px))]">
              <div className="l-stage l-stage-panel relative mx-auto overflow-hidden rounded-[32px]" style={{ width: "min(100%, calc(82vh * 0.76))" }}>
                <ThemedPhoneStage
                  photo="stage"
                  screens={ALL_SCREENS}
                  active={stageIndex}
                  crop={{ x: [0.08, 0.9], y: [0.05, 0.86] }}
                  sizes="(min-width: 1024px) 640px, 1px"
                  label={label}
                />
                <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_20px_var(--l-stage)]" />
                <div className="l-mono pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-full border border-[var(--l-line)] bg-[var(--l-caption-bg)] px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--l-caption-ink)] backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#9bd83d]" />
                  {chapters[active].name}
                </div>
              </div>
              {/* Touch screens: the screen scrolls by itself and never takes the page's scroll. */}
              <p className="l-mono mt-4 text-center text-xs text-[var(--l-ink-3)] [@media(hover:none)]:hidden">Hover the phone and scroll to look around</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
