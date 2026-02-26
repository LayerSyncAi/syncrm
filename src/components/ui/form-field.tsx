"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  touched?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  error,
  touched,
  children,
  className,
}: FormFieldProps) {
  const showError = touched && error;

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-danger">*</span>}
      </Label>
      <AnimatePresence>
        {showError && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-danger overflow-hidden"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}

// Hook for managing form field state
export function useFormField<T>(
  initialValue: T,
  validator?: (value: T) => string | undefined
) {
  const [value, setValue] = React.useState<T>(initialValue);
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const validate = React.useCallback(() => {
    if (validator) {
      const validationError = validator(value);
      setError(validationError);
      return !validationError;
    }
    return true;
  }, [value, validator]);

  const handleChange = React.useCallback((newValue: T) => {
    setValue(newValue);
    if (touched && validator) {
      setError(validator(newValue));
    }
  }, [touched, validator]);

  const handleBlur = React.useCallback(() => {
    setTouched(true);
    validate();
  }, [validate]);

  const reset = React.useCallback(() => {
    setValue(initialValue);
    setTouched(false);
    setError(undefined);
  }, [initialValue]);

  return {
    value,
    setValue: handleChange,
    touched,
    setTouched,
    error,
    setError,
    validate,
    onBlur: handleBlur,
    reset,
  };
}
