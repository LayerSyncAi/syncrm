"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A colour control: the native picker, a hex box and one-click suggestions.
 * Shared by the Brand kit page and the Platform onboarding wizard.
 */
export function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
  suggestions,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  suggestions: readonly string[];
  placeholder: string;
  /** Shown under the control; also marks the hex box invalid. */
  error?: string;
}) {
  const invalid = !!error || (value.length > 0 && !HEX.test(value));
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-[10px] border border-border-strong bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          maxLength={7}
          error={invalid}
          className="max-w-[140px] font-mono"
        />
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((colour) => (
            <button
              key={colour}
              type="button"
              onClick={() => onChange(colour)}
              aria-label={colour}
              title={colour}
              className={cn(
                "h-7 w-7 cursor-pointer rounded-full border-2 transition",
                value.toLowerCase() === colour.toLowerCase() ? "border-text" : "border-border"
              )}
              style={{ backgroundColor: colour }}
            />
          ))}
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
