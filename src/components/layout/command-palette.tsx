"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  LayoutDashboard,
  Waypoints,
  Users,
  Building2,
  ClipboardList,
  BarChart3,
  Plus,
  Upload,
  Download,
  CornerDownLeft,
  SlidersHorizontal,
  Megaphone,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { LayoutGrid } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: "Go to" | "Create" | "Tools";
  icon: LucideIcon;
  href: string;
  keywords?: string;
}

const baseCommands: Command[] = [
  { id: "nav-dashboard", label: "Dashboard", group: "Go to", icon: LayoutDashboard, href: "/app/dashboard", keywords: "home overview pipeline" },
  { id: "nav-leads", label: "Leads", group: "Go to", icon: Waypoints, href: "/app/leads", keywords: "pipeline kanban" },
  { id: "nav-contacts", label: "Contacts", group: "Go to", icon: Users, href: "/app/contacts", keywords: "people" },
  { id: "nav-owners", label: "Owners", group: "Go to", icon: KeyRound, href: "/app/owners", keywords: "sellers landlords vendors property owners" },
  { id: "nav-properties", label: "Properties", group: "Go to", icon: Building2, href: "/app/properties", keywords: "listings inventory" },
  { id: "nav-syncmedia", label: "SyncMedia", group: "Go to", icon: Megaphone, href: "/app/syncmedia", keywords: "brochure flyer marketing social poster" },
  { id: "nav-tasks", label: "Tasks", group: "Go to", icon: ClipboardList, href: "/app/tasks", keywords: "activities todo" },
  { id: "nav-reports", label: "Reports", group: "Go to", icon: BarChart3, href: "/app/reports", keywords: "analytics revenue leaderboard" },
  { id: "act-new-lead", label: "New lead", group: "Create", icon: Plus, href: "/app/leads/new", keywords: "add create opportunity" },
  { id: "act-new-property", label: "New property", group: "Create", icon: Plus, href: "/app/properties/new", keywords: "add create listing" },
  { id: "act-new-brochure", label: "New brochure", group: "Create", icon: Plus, href: "/app/syncmedia/new", keywords: "add create flyer poster syncmedia marketing" },
  { id: "act-matching", label: "Property matching", group: "Tools", icon: Search, href: "/app/contacts/matching", keywords: "match suggest" },
  { id: "act-segments", label: "Contact segmentation", group: "Tools", icon: SlidersHorizontal, href: "/app/contacts/segments", keywords: "segment filter" },
  { id: "act-import", label: "Import leads", group: "Tools", icon: Upload, href: "/app/leads/import", keywords: "csv upload" },
  { id: "act-export", label: "Export leads", group: "Tools", icon: Download, href: "/app/leads/export", keywords: "csv download" },
  { id: "act-source-review", label: "Lead source review", group: "Tools", icon: AlertTriangle, href: "/app/leads/source-review", keywords: "property portal propertybook reassign source" },
];

const groupOrder: Command["group"][] = ["Go to", "Create", "Tools"];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const hub = useQuery(api.hub.getContext);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Global ⌘K / Ctrl+K toggle.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Reset state each time it opens; focus the input.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Hub and module home pages sit alongside the CRM shortcuts.
  const commands = React.useMemo<Command[]>(() => {
    const moduleCommands: Command[] = (hub?.myModules ?? [])
      .filter((k) => k !== "crm" && k !== "media")
      .map((k) => ({
        id: `nav-module-${k}`,
        label: MODULES[k].name,
        group: "Go to" as const,
        icon: MODULES[k].icon,
        href: MODULES[k].homeHref,
        keywords: MODULES[k].tagline,
      }));
    return [
      { id: "nav-hub", label: "Hub", group: "Go to", icon: LayoutGrid, href: "/app/hub", keywords: "sync estate modules home" },
      ...moduleCommands,
      ...baseCommands,
    ];
  }, [hub]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q)
    );
  }, [query, commands]);

  // Keep the active index in range as results change.
  React.useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  const run = React.useCallback(
    (cmd: Command | undefined) => {
      if (!cmd) return;
      setOpen(false);
      router.push(cmd.href);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  // Scroll the active row into view.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            className="w-full max-w-lg overflow-hidden rounded-[14px] border border-border-strong bg-surface-raised shadow-[0_24px_60px_rgba(31,42,68,0.22)]"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search or jump to…"
                className="h-12 w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
                aria-label="Search commands"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-list"
                aria-activedescendant={results[activeIndex] ? `cmd-${results[activeIndex].id}` : undefined}
              />
              <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted sm:block">
                ESC
              </kbd>
            </div>

            <div ref={listRef} id="command-list" role="listbox" className="max-h-[320px] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">No matches for “{query}”.</p>
              ) : (
                groupOrder.map((group) => {
                  const items = results.filter((c) => c.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group} className="mb-1">
                      <p className="px-3 pb-1 pt-2 text-eyebrow text-text-muted">{group}</p>
                      {items.map((cmd) => {
                        const idx = results.indexOf(cmd);
                        const active = idx === activeIndex;
                        const Icon = cmd.icon;
                        return (
                          <button
                            key={cmd.id}
                            id={`cmd-${cmd.id}`}
                            data-index={idx}
                            role="option"
                            aria-selected={active}
                            onClick={() => run(cmd)}
                            onMouseMove={() => setActiveIndex(idx)}
                            className={cn(
                              "flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm transition-colors",
                              active ? "bg-row-hover text-text" : "text-text-muted hover:text-text"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="flex-1 text-text">{cmd.label}</span>
                            {active && <CornerDownLeft className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
