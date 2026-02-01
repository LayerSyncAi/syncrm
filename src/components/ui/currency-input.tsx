"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { currencies, formatCurrencyInput, parseCurrencyInput, validateCurrencyInput } from "@/lib/currency";
import { Select } from "./select";

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  placeholder?: string;
  error?: string;
  touched?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  currency,
  onCurrencyChange,
  placeholder = "0.00",
  error,
  touched,
  required,
  disabled,
  className,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = React.useState("");
  const [localError, setLocalError] = React.useState<string | undefined>();

  // Sync display value with external value
  React.useEffect(() => {
    if (value) {
      setDisplayValue(formatCurrencyInput(value));
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;

    // Allow empty input
    if (rawValue === "") {
      setDisplayValue("");
      onChange("");
      setLocalError(undefined);
      return;
    }

    // Only allow numbers, decimal point, and commas
    const cleanValue = rawValue.replace(/[^\d.,]/g, "");

    // Parse to get raw number
    const parsed = parseCurrencyInput(cleanValue);

    // Validate
    const validation = validateCurrencyInput(parsed);
    setLocalError(validation.error);

    // Update display with formatted value
    if (validation.isValid && parsed) {
      setDisplayValue(formatCurrencyInput(parsed));
      onChange(parsed);
    } else {
      setDisplayValue(cleanValue);
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    // Format on blur
    if (value) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setDisplayValue(numValue.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }));
      }
    }

    // Validate required
    if (required && !value) {
      setLocalError("This field is required");
    }

    onBlur?.();
  };

  const showError = (touched || localError) && (error || localError);
  const hasError = Boolean(showError);

  return (
    <div className={cn("space-y-1", className)}>
      {showError && (
        <p className="text-xs text-danger">{error || localError}</p>
      )}
      <div className="flex gap-2">
        <Select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className={cn("w-[100px] shrink-0", hasError && "border-danger focus:ring-danger/20")}
          disabled={disabled}
        >
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </Select>
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "h-10 w-full rounded-[10px] border bg-transparent px-3 text-sm text-text outline-none transition duration-150 placeholder:text-text-dim focus:ring-4",
            hasError
              ? "border-danger focus:ring-danger/20"
              : "border-border-strong focus:ring-[rgba(59,130,246,0.18)]"
          )}
        />
      </div>
    </div>
  );
}
