"use client";

/**
 * The Sync (spec §5.2 and §8): five disconnected tools collapse into
 * SyncEstate as the visitor scrolls. A tall section with a sticky dark
 * stage; the WebGL field draws behind the copy. With reduced motion or no
 * WebGL it becomes a static mark with the three lines of copy in order.
 */
import { useEffect, useRef, useState } from "react";
import { sync } from "../content";
import { Accent, Eyebrow } from "../bits";
import { useReducedMotion } from "../motion";
import { useLandingTheme } from "../theme";
import { createSyncField, type Layout, type SyncField } from "./gl";

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function stateFor(p: number) {
  return p < 0.35 ? 0 : p < 0.75 ? 1 : 2;
}

function captionPositions(L: Layout, height: number) {
  // When the field has had to shrink (short phones) or sits in a short
  // landscape stage, the captions would pile onto each other; the glyphs
  // carry the idea on their own.
  if ((L.glyphSize * height) / 2 < 44 || (L.aspect > 1 && height < 500)) return null;
  // On narrow stages keep captions clear of the edges.
  const edge = L.aspect < 1 ? 26 : 8;
  return L.clusters.map((c) => ({
    left: Math.min(100 - edge, Math.max(edge, ((c.x + L.aspect) / (2 * L.aspect)) * 100)),
    top: ((1 - (c.y - L.glyphSize * 0.62)) / 2) * 100,
  }));
}

export function TheSync() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [theme] = useLandingTheme();
  const lightRef = useRef(false);
  useEffect(() => {
    lightRef.current = theme === "light";
  }, [theme]);
  const [glFailed, setGlFailed] = useState(false);
  const mode: "gl" | "static" = reduce || glFailed ? "static" : "gl";
  const [state, setState] = useState(0);
  const [captions, setCaptions] = useState<{ left: number; top: number }[] | null>(null);

  useEffect(() => {
    if (reduce) return;
    const section = sectionRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!section || !stage || !canvas) return;

    let field: SyncField | null = null;
    let raf = 0;
    let running = false;
    let disposed = false;
    const mouse = { x: 99, y: 99, force: 0 };
    let lastState = -1;
    let aspect = 1;
    const t0 = performance.now();

    const progress = () => {
      const r = section.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    };

    const frame = () => {
      raf = 0;
      if (!running || !field) return;
      const p = progress();
      mouse.force *= 0.93;
      field.render(p, (performance.now() - t0) / 1000, mouse, lightRef.current);
      stage.style.setProperty("--cap-o", String(1 - smoothstep(0.24, 0.36, p)));
      stage.style.setProperty("--halo-o", String(smoothstep(0.7, 0.95, p)));
      const s = stateFor(p);
      if (s !== lastState) {
        lastState = s;
        setState(s);
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!running && field && !document.hidden) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      if (!field) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, w > 2560 ? 1.5 : 2);
      // On narrow stages the copy sits at the bottom; keep the field above it.
      const copy = copyRef.current;
      const reserve = copy && w <= h ? copy.offsetHeight / h : 0;
      const L = field.resize(w, h, dpr, reserve);
      aspect = L.aspect;
      stage.style.setProperty("--halo-x", `${((L.markCentre.x + L.aspect) / (2 * L.aspect)) * 100}%`);
      stage.style.setProperty("--halo-y", `${((1 - L.markCentre.y) / 2) * 100}%`);
      setCaptions(captionPositions(L, h));
    };

    const count =
      (navigator.hardwareConcurrency ?? 8) <= 4 ? 2500 : window.innerWidth < 768 ? 4500 : 9000;

    let visible = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          if (!field) init();
          else start();
        } else stop();
      },
      { rootMargin: "50% 0px" }
    );
    io.observe(section);

    let initialising = false;
    const init = async () => {
      if (initialising) return;
      initialising = true;
      try {
        field = await createSyncField(canvas, count);
      } catch {
        field = null;
      }
      if (disposed) {
        field?.dispose();
        return;
      }
      if (!field) {
        setGlFailed(true);
        return;
      }
      resize();
      if (visible) start();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    if (copyRef.current) ro.observe(copyRef.current);

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width * 2 - 1) * aspect;
      mouse.y = -((e.clientY - r.top) / r.height * 2 - 1);
      mouse.force = e.pointerType === "mouse" ? 1 : 1.6;
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerdown", onMove);
    const onVis = () => (document.hidden ? stop() : visible && start());
    document.addEventListener("visibilitychange", onVis);

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerdown", onMove);
      document.removeEventListener("visibilitychange", onVis);
      field?.dispose();
    };
  }, [reduce]);

  if (mode === "static") {
    return (
      <section id="why" aria-labelledby="why-title" className="py-12 sm:py-16">
        <div className="mx-auto max-w-[1280px] sm:px-8">
          <div className="l-stage l-stage-panel relative overflow-hidden px-6 py-20 sm:rounded-[32px] sm:px-14">
            <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
              <div className="flex flex-col gap-12">
                {sync.states.map((s, i) => (
                  <div key={s.eyebrow} className="flex flex-col gap-4">
                    <Eyebrow dot={i === 2}>{s.eyebrow}</Eyebrow>
                    {i === 0 ? (
                      <h2 id="why-title" className="l-h2">
                        <Accent h={s.headline} />
                      </h2>
                    ) : (
                      <p className="l-h2">
                        <Accent h={s.headline} />
                      </p>
                    )}
                    <p className="l-body-lg max-w-[50ch]">{s.body}</p>
                  </div>
                ))}
              </div>
              <div className="relative mx-auto grid aspect-square w-full max-w-[380px] place-items-center">
                <div aria-hidden className="absolute inset-0 rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(155,216,61,0.35), transparent)" }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/mark.svg" alt="" width={206} height={240} className="relative h-auto w-[55%]" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const current = sync.states[state];
  return (
    <section ref={sectionRef} id="why" aria-labelledby="why-title" className="relative h-[260vh]">
      {/* The full story for screen readers; the animated copy below is visual only. */}
      <div className="sr-only">
        {sync.states.map((s, i) =>
          i === 0 ? (
            <h2 key={s.eyebrow} id="why-title">
              {s.headline.join("")}
            </h2>
          ) : (
            <p key={s.eyebrow}>{s.headline.join("")}</p>
          )
        )}
        {sync.states.map((s) => (
          <p key={`b-${s.eyebrow}`}>{s.body}</p>
        ))}
      </div>
      <div className="sticky top-0 h-[100svh] py-3 sm:px-3">
        <div ref={stageRef} className="l-stage l-stage-panel relative h-full overflow-hidden sm:rounded-[32px]" style={{ ["--cap-o" as string]: 1, ["--halo-o" as string]: 0 }}>
          {/* Halo behind the mark once synced. */}
          <div
            aria-hidden
            className="pointer-events-none absolute h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{
              left: "var(--halo-x, 50%)",
              top: "var(--halo-y, 36%)",
              background: "radial-gradient(closest-side, rgba(155,216,61,0.38), transparent)",
              opacity: "var(--halo-o)",
            }}
          />
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />

          {captions ? (
            <ul aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: "var(--cap-o)" }}>
              {captions.map((c, i) => (
                <li
                  key={i}
                  className="l-mono absolute flex max-w-[46vw] -translate-x-1/2 items-center gap-1.5 rounded-full text-left leading-tight sm:max-w-none sm:whitespace-nowrap border border-[var(--l-line)] bg-[var(--l-caption-bg)] px-2.5 py-1 text-[10px] text-[var(--l-caption-ink)] backdrop-blur sm:text-[11px]"
                  style={{ left: `${c.left}%`, top: `${c.top}%` }}
                >
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#d92d20]" />
                  {sync.captions[i]}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Copy: on the left on landscape screens (the field sits on the
              right), at the bottom on portrait ones (the field sits above).
              gl.ts picks the same split from the stage's shape. */}
          <div
            ref={copyRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 p-6 pb-10 sm:p-10 landscape:inset-y-0 landscape:right-auto landscape:flex landscape:w-[54%] landscape:items-center landscape:py-6 lg:landscape:w-[44%] lg:landscape:p-16"
          >
            <div className="relative">
              <div className="absolute -inset-10 -z-10 lg:landscape:hidden" style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--l-stage) 85%, transparent), transparent)" }} />
              {/* All three states share one grid cell; the hidden ones only
                  hold the height, so the block never jumps between states. */}
              <div className="grid" aria-hidden>
                {sync.states.map((s, i) =>
                  i === state ? null : (
                    <div key={`sizer-${s.eyebrow}`} className="invisible col-start-1 row-start-1 flex flex-col gap-4">
                      <Eyebrow>{s.eyebrow}</Eyebrow>
                      <p className="l-h2 max-w-[16ch]">
                        <Accent h={s.headline} />
                      </p>
                      <p className="l-body-lg max-w-[44ch]">{s.body}</p>
                    </div>
                  )
                )}
                <div key={state} className="l-sync-copy col-start-1 row-start-1 flex flex-col gap-4">
                  <Eyebrow dot={state === 2}>{current.eyebrow}</Eyebrow>
                  <p className="l-h2 max-w-[16ch]">
                    <Accent h={current.headline} />
                  </p>
                  <p className="l-body-lg max-w-[44ch]">{current.body}</p>
                </div>
              </div>
              <div className="mt-8 flex gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`h-1 rounded-full transition-all duration-500 ${i === state ? "w-8 bg-[#9bd83d]" : "w-3 bg-[var(--l-line-strong)]"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
