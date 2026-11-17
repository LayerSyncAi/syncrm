"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useReducedMotion } from "./motion";
import { hub } from "./content";
import { ThemedPhoneStage } from "./phone/phone-stage";
import { ProductGlyph } from "./phone/ui";

const EASE = [0.16, 1, 0.3, 1] as const;

export function HubBentoPhone() {
  return (
    // Never taller than the screen (landscape phones).
    <div className="relative mx-auto -mt-4 w-full sm:-mt-10" style={{ maxWidth: "calc(95svh * 1.15)" }}>
      <ThemedPhoneStage
        photo="stageAlt"
        screens={["hub"]}
        crop={{ x: [0.14, 0.94], y: [0.1, 0.62] }}
        sizes="(min-width: 1024px) 700px, 100vw"
        label="The Hub's Needs attention list: open maintenance, arrears, inspections due, an overdue valuation and payouts awaiting approval."
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--l-stage)] to-transparent" />
    </div>
  );
}

const MODULES = [
  { key: "crm", name: "SynCRM", on: true },
  { key: "stay", name: "SyncStay", on: true },
  { key: "worth", name: "SyncWorth", on: false },
  { key: "finance", name: "SyncFinance", on: true },
  { key: "dev", name: "SyncDev", on: false },
  { key: "media", name: "SyncMedia", on: true },
] as const;

type ModuleKey = (typeof MODULES)[number]["key"];
const DEFAULTS = Object.fromEntries(MODULES.map((m) => [m.key, m.on])) as Record<ModuleKey, boolean>;

/**
 * Real switches: visitors can flip any module on and off. The first time the
 * card scrolls into view, the example agency's modules switch themselves on
 * one by one; after that (or as soon as someone taps), the visitor is in charge.
 */
export function ModuleSwitches() {
  const reduce = useReducedMotion();
  const [state, setState] = useState(DEFAULTS);
  const [seen, setSeen] = useState(false);
  const [touched, setTouched] = useState(false);
  const intro = seen && !touched && !reduce;
  const isOn = (k: ModuleKey) => seen && state[k];
  const count = MODULES.filter((m) => isOn(m.key)).length;

  const toggle = (k: ModuleKey) => {
    setTouched(true);
    setState((s) => ({ ...s, [k]: !(seen && s[k]) }));
    setSeen(true);
  };

  return (
    // Two across only when the card itself is wide enough (container query),
    // so names never truncate in the narrower desktop card.
    <div className="@container flex flex-col gap-3">
      <motion.ul
        className="grid grid-cols-1 gap-2 @min-[364px]:grid-cols-2"
        aria-label="Modules, try switching them"
        onViewportEnter={() => setSeen(true)}
        viewport={{ once: true, amount: 0.5 }}
      >
        {MODULES.map((m, i) => {
          const on = isOn(m.key);
          return (
            <li key={m.key} className="min-w-0">
              <button
                type="button"
                role="switch"
                aria-checked={on}
                data-on={on || undefined}
                onClick={() => toggle(m.key)}
                className="l-switch-row flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--l-ink)]">
                  <ProductGlyph product={m.key} size={16} strokeWidth={1.6} className="l-switch-icon flex-none" />
                  <span className="truncate">{m.name}</span>
                </span>
                <span aria-hidden className="l-switch-track">
                  <motion.span
                    className="l-switch-knob"
                    initial={false}
                    animate={{ x: on ? 16 : 0 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 560, damping: 34, mass: 0.9, delay: intro ? 0.25 + i * 0.12 : 0 }
                    }
                  />
                </span>
              </button>
            </li>
          );
        })}
      </motion.ul>
      <p className="l-mono flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--l-ink-3)]">
        <span>Try it</span>
        <span>
          <span className="text-[var(--l-ink-2)]">{count}</span> of {MODULES.length} on
        </span>
      </p>
    </div>
  );
}

export function AlertToasts() {
  const reduce = useReducedMotion();
  return (
    <ul className="flex min-w-0 flex-col gap-2" aria-label="Example alerts">
      {hub.tiles.alerts.toasts.map((t, i) => (
        <motion.li
          key={t.text}
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={reduce ? { duration: 0.2, x: { duration: 0 } } : { duration: 0.7, delay: 0.2 + i * 0.25, ease: EASE }}
          className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--l-line)] bg-[var(--l-bg-raised)] px-4 py-3"
        >
          <span className="h-2 w-2 flex-none rounded-full bg-[var(--l-accent)] shadow-[0_0_10px_var(--l-accent)]" />
          <span className="l-mono flex-none text-[11px] uppercase tracking-[0.12em] text-[var(--l-ink-3)]">{t.module}</span>
          <span className="min-w-0 truncate text-sm text-[var(--l-ink)]">{t.text}</span>
        </motion.li>
      ))}
    </ul>
  );
}
