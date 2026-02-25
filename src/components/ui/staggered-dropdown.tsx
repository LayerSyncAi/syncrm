"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface StaggeredDropDownProps {
  /** The list of options to display */
  options: DropdownOption[];
  /** Currently selected value */
  value?: string;
  /** Callback when an option is selected */
  onChange?: (value: string) => void;
  /** Placeholder text when no option is selected */
  placeholder?: string;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional className for the wrapper */
  className?: string;
  /** Aria label for accessibility */
  "aria-label"?: string;

  // ─── Animation / customization ───────────────────────────
  /** Stagger delay between item animations in seconds. Default: 0.05 */
  staggerChildren?: number;
  /** Open / close animation duration in seconds. Default: 0.2 */
  animationDuration?: number;
  /** Max height of the dropdown list in pixels. Default: 256 */
  maxHeight?: number;
  /** Icon shown next to each selected option. Swap with any Lucide icon. Default: Check */
  selectedIcon?: React.ReactNode;
  /** Icon shown as the open/close chevron. Default: ChevronDown */
  chevronIcon?: React.ReactNode;
  /** Render the dropdown list via a portal so it escapes overflow:hidden containers (e.g. tables). Default: false */
  portal?: boolean;
}

export function StaggeredDropDown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className,
  "aria-label": ariaLabel,
  staggerChildren = 0.05,
  animationDuration = 0.2,
  maxHeight = 256,
  selectedIcon,
  chevronIcon,
  portal = false,
}: StaggeredDropDownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Portal positioning state
  const [portalPos, setPortalPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePortalPos = useCallback(() => {
    if (!portal || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPortalPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [portal]);

  // Update portal position when open
  useLayoutEffect(() => {
    if (!open || !portal) return;
    updatePortalPos();
  }, [open, portal, updatePortalPos]);

  // Reposition on scroll/resize when portaled
  useEffect(() => {
    if (!open || !portal) return;
    window.addEventListener("scroll", updatePortalPos, true);
    window.addEventListener("resize", updatePortalPos);
    return () => {
      window.removeEventListener("scroll", updatePortalPos, true);
      window.removeEventListener("resize", updatePortalPos);
    };
  }, [open, portal, updatePortalPos]);

  // Close on outside click — handles both inline and portal
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer =
        containerRef.current && containerRef.current.contains(target);
      const inDropdown =
        dropdownRef.current && dropdownRef.current.contains(target);
      if (!inContainer && !inDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);
  const displayText = selectedOption?.label ?? placeholder;

  // ─── Variants (configurable via props) ──────────────────
  const wrapperVariants = {
    open: {
      scaleY: 1,
      transition: {
        duration: animationDuration,
        when: "beforeChildren" as const,
        staggerChildren,
      },
    },
    closed: {
      scaleY: 0,
      transition: {
        duration: animationDuration,
        when: "afterChildren" as const,
        staggerChildren,
      },
    },
  };

  const iconVariants = {
    open: { rotate: 180 },
    closed: { rotate: 0 },
  };

  const itemVariants = {
    open: {
      opacity: 1,
      y: 0,
      transition: { when: "beforeChildren" as const },
    },
    closed: {
      opacity: 0,
      y: -15,
      transition: { when: "afterChildren" as const },
    },
  };

  const actionIconVariants = {
    open: { scale: 1, y: 0 },
    closed: { scale: 0, y: -7 },
  };

  const checkIcon = selectedIcon ?? <Check className="h-3.5 w-3.5" />;
  const chevron = chevronIcon ?? <ChevronDown className="h-4 w-4" />;

  // ─── Dropdown list content ──────────────────────────────
  const dropdownList = (
    <motion.ul
      ref={dropdownRef}
      animate={open ? "open" : "closed"}
      initial="closed"
      variants={wrapperVariants}
      style={
        portal
          ? {
              originY: "top",
              pointerEvents: open ? "auto" : "none",
              position: "fixed",
              top: portalPos.top,
              left: portalPos.left,
              width: portalPos.width,
            }
          : { originY: "top", pointerEvents: open ? "auto" : "none" }
      }
      className={cn(
        "z-50 flex flex-col gap-0.5 overflow-hidden rounded-[10px] border border-border-strong bg-card-bg p-1.5 shadow-xl",
        !portal && "absolute mt-1 w-full"
      )}
    >
      <div style={{ maxHeight }} className="overflow-y-auto">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <motion.li
              key={option.value}
              variants={itemVariants}
              onClick={() => {
                onChange?.(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                isSelected
                  ? "bg-primary/10 text-primary"
                  : "text-text hover:bg-primary/5 hover:text-primary"
              )}
            >
              <motion.span
                variants={actionIconVariants}
                className="shrink-0"
              >
                {isSelected ? checkIcon : <span className="h-3.5 w-3.5" />}
              </motion.span>
              <span className="truncate">{option.label}</span>
            </motion.li>
          );
        })}
      </div>
    </motion.ul>
  );

  return (
    <motion.div
      ref={containerRef}
      animate={open ? "open" : "closed"}
      className={cn("relative", className)}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((pv) => !pv)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-border-strong bg-transparent px-3 text-sm text-text outline-none transition duration-150 focus:ring-4 focus:ring-[rgba(59,130,246,0.18)]",
          disabled && "cursor-not-allowed opacity-50",
          !disabled && "hover:border-primary/60"
        )}
      >
        <span
          className={cn("truncate", !selectedOption && "text-text-muted")}
        >
          {displayText}
        </span>
        <motion.span
          variants={iconVariants}
          className="shrink-0 text-text-muted"
        >
          {chevron}
        </motion.span>
      </button>

      {portal
        ? typeof document !== "undefined" &&
          createPortal(dropdownList, document.body)
        : dropdownList}
    </motion.div>
  );
}
