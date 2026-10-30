"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-muted">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </label>
  );
}

/** Row of one-tap values that fill a field — faster than typing on a phone. */
export function QuickPicks({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition",
            value.toUpperCase() === option.toUpperCase()
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong bg-card-bg text-text-muted hover:border-primary hover:text-primary-ink"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function OptionCard({
  selected,
  onClick,
  title,
  subtitle,
  visual,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  visual?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      // The visible label sits in nested divs alongside a decorative preview,
      // which leaves the computed name unreliable for screen readers.
      aria-label={title}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 p-2.5 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-row-hover"
          : "border-border bg-card-bg hover:border-primary/40"
      )}
    >
      {visual ? <div className="flex-shrink-0">{visual}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug text-text-muted">{subtitle}</p>
        ) : null}
      </div>
    </button>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-border-strong bg-card-bg px-3 py-2.5 text-left transition hover:border-primary/60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint ? <span className="block text-xs text-text-muted">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 flex-shrink-0 rounded-full transition",
          checked ? "bg-primary" : "bg-border-strong"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            checked ? "left-[1.125rem]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}
