"use client";

import { memo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  LayoutGrid,
  ScrollText,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  SlidersHorizontal,
  Star,
  Upload,
  UserCog,
  Waypoints,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";
import { api } from "../../../convex/_generated/api";
import { MODULES, moduleForPath, type ModuleKey } from "@/config/modules";

// CRM main nav comes from the module registry (SyncMedia is its own module).
const navItems = MODULES.crm.nav;

const contactToolItems = [
  { label: "Property Matching", href: "/app/contacts/matching", icon: Search },
  { label: "Segmentation", href: "/app/contacts/segments", icon: SlidersHorizontal },
];

const importExportItems = [
  { label: "Lead Import", href: "/app/leads/import", icon: Upload },
  { label: "Lead Export", href: "/app/leads/export", icon: Download },
];

const adminItems = [
  { label: "Stages", href: "/app/admin/stages", icon: Waypoints },
  { label: "Lead Scoring", href: "/app/admin/lead-scoring", icon: Star },
  { label: "Commissions", href: "/app/admin/commissions", icon: DollarSign },
];

const hubAdminItems = [
  { label: "Users", href: "/app/admin/users", icon: UserCog },
  { label: "Roles", href: "/app/admin/roles", icon: Shield },
  { label: "Agency settings", href: "/app/settings", icon: Settings },
  { label: "Logs", href: "/app/admin/logs", icon: ScrollText },
];

const hubItem = { label: "Hub", href: "/app/hub", icon: LayoutGrid };

const notifyItem = { label: "Sync Notify", href: "/app/notify", icon: Send };

const platformItem = { label: "Platform", href: "/app/platform", icon: Server };

interface SidebarProps {
  isAdmin?: boolean;
  /** LayerSync staff: shows the Platform section (organisations overview). */
  isPlatformAdmin?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  orgName?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// --- NavItem with micro-interactions ---
// 1. Sliding active indicator pill (layoutId per section)
// 2. Icon scale-up on collapse (spring animation)
// 3. Label fade-out before sidebar shrinks (AnimatePresence)
// 4. Hover peek tooltip when collapsed

function NavItem({
  item,
  active,
  collapsed,
  pillId,
}: {
  item: { label: string; href: string; icon: LucideIcon };
  active: boolean;
  collapsed?: boolean;
  pillId: string;
}) {
  const Icon = item.icon;
  const textColor = active ? "text-primary" : "text-sidebar-fg";
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors duration-150",
        collapsed ? "justify-center" : "justify-start",
        !active && "hover:bg-white/10"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Sliding active indicator pill */}
      {active && (
        <motion.div
          layoutId={pillId}
          className="absolute inset-0 rounded-[10px] bg-white/10"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}

      {/* Gradient underline — intense left, fades right, with sweeping glow */}
      {active && (
        <motion.div
          layoutId={`${pillId}-underline`}
          className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full sidebar-underline"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        >
          <div className="absolute inset-0 rounded-full sidebar-underline-glow" style={{ filter: "blur(3px)" }} />
        </motion.div>
      )}

      {/* Recommendation #1: Icon scales up when sidebar collapses */}
      <motion.div
        animate={{ scale: collapsed ? 1.18 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative z-10 flex-shrink-0"
      >
        <Icon className={cn("h-[18px] w-[18px]", textColor)} />
      </motion.div>

      {/* Recommendation #1: Label fades out before sidebar width shrinks */}
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className={cn("relative z-10 overflow-hidden whitespace-nowrap", textColor)}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Recommendation #3: Hover peek tooltip when collapsed */}
      <AnimatePresence>
        {collapsed && hovered && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-sidebar-bg-hover px-3 py-2 text-xs font-medium text-white shadow-lg"
          >
            {item.label}
            <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 border-4 border-transparent border-r-sidebar-bg-hover" />
          </motion.div>
        )}
      </AnimatePresence>
    </Link>
  );
}

/** Module home routes match exactly; everything else matches by prefix. */
function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

// --- Module switcher: current module on top, menu lists Hub + the user's modules ---

function ModuleSwitcher({
  current,
  myModules,
  orgName,
  collapsed,
}: {
  current: ModuleKey | "hub";
  myModules: ModuleKey[];
  orgName?: string;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const def = current === "hub" ? null : MODULES[current];
  const Icon = def ? def.icon : LayoutGrid;
  const name = def ? def.name : "Sync Estate";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative mb-6 px-2">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch module"
        className={cn(
          "flex w-full items-center gap-3 rounded-[12px] border border-white/20 bg-white/10 px-3 py-2.5 text-left transition-colors hover:bg-white/15",
          collapsed && "justify-center px-0"
        )}
      >
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", def ? def.accent : "bg-white/20 text-white")}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              {orgName && <p className="truncate text-[11px] text-white/60">{orgName}</p>}
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute left-2 top-full z-50 mt-2 w-56 rounded-[12px] border border-white/20 bg-sidebar-bg p-1.5 shadow-lg"
          >
            {[
              { key: "hub" as const, label: "Hub", href: "/app/hub", icon: LayoutGrid },
              ...myModules.map((k) => ({ key: k, label: MODULES[k].name, href: MODULES[k].homeHref, icon: MODULES[k].icon })),
            ].map((m) => {
              const MIcon = m.icon;
              return (
                <Link
                  key={m.key}
                  href={m.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors hover:bg-white/10",
                    m.key === current && "bg-white/10 font-medium"
                  )}
                >
                  <MIcon className="h-4 w-4" aria-hidden="true" />
                  {m.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export const Sidebar = memo(function Sidebar({ isAdmin, isPlatformAdmin, collapsed, onToggle, orgName, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const current = moduleForPath(pathname);
  // Null for platform staff with no organisation open.
  const hub = useQuery(api.hub.getContext);
  const myModules = hub?.myModules ?? [];
  const [ioExpanded, setIoExpanded] = useState(false);
  const [contactToolsExpanded, setContactToolsExpanded] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileOpen || !onMobileClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Mobile backdrop overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col bg-sidebar-bg px-3 py-4 text-sidebar-fg transition-[width,transform] duration-200",
          // Desktop: standard sidebar behavior
          "max-md:w-[var(--sidebar-width)]",
          collapsed ? "md:w-[var(--sidebar-width-collapsed)]" : "md:w-[var(--sidebar-width)]",
          // Mobile: slide in/out
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        {/* Mobile close button */}
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close sidebar"
          className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-full text-sidebar-fg transition hover:bg-white/10 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Desktop collapse/expand toggle */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-4 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-sidebar-bg text-sidebar-fg shadow-sm transition hover:bg-white/10 md:flex"
        >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      {hub ? (
        <ModuleSwitcher current={current} myModules={myModules} orgName={hub.orgName} collapsed={collapsed} />
      ) : (
        <div className="mb-6 flex items-center justify-between px-2">
          <div
            className={cn(
              "rounded-[12px] border border-white/20 bg-white/10 px-3 py-3 text-sm font-semibold transition-all duration-200",
              collapsed ? "w-full text-center" : "w-auto"
            )}
          >
            {collapsed
              ? (orgName ? orgName[0].toUpperCase() : brand.name[0].toUpperCase())
              : (orgName || brand.name)}
          </div>
        </div>
      )}
      {/* Scrollable region: when the expandable panels grow taller than the
          viewport, this area scrolls instead of overflowing off-screen. Scroll
          is only enabled when expanded — overflow-y:auto forces overflow-x to
          clip, which would cut off the collapsed-mode hover tooltips. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", !collapsed && "sidebar-scroll overflow-y-auto")}>
      {hub && current !== "hub" && (
        <Link
          href="/app/hub"
          className={cn(
            "mb-3 flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white",
            collapsed && "justify-center"
          )}
          title="Back to Hub"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {!collapsed && "Back to Hub"}
        </Link>
      )}
      <nav className="flex-1 space-y-1" data-tour={current === "crm" ? "sidebar-nav" : undefined}>
        {(current === "crm"
          ? navItems
          : current === "hub"
            ? [
                hubItem,
                ...(hub?.canNotify ? [notifyItem] : []),
                ...myModules.map((k) => ({ label: MODULES[k].name, href: MODULES[k].homeHref, icon: MODULES[k].icon })),
              ]
            : MODULES[current].nav
        ).map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={
              current === "crm"
                ? pathname.startsWith(item.href)
                : isActivePath(pathname, item.href, item.href === "/app/hub" || (current !== "hub" && item.href === MODULES[current].homeHref))
            }
            collapsed={collapsed}
            pillId="nav-pill-main"
          />
        ))}
      </nav>
      {current === "crm" && (
      <>
      <div className="mt-4 space-y-1 border-t border-white/20 pt-4" data-tour="sidebar-import-export">
        {collapsed ? (
          /* When sidebar is collapsed, show items directly (with hover tooltips) */
          importExportItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
              pillId="nav-pill-io"
            />
          ))
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIoExpanded((p) => !p)}
              className="flex w-full items-center justify-between rounded-[10px] px-3 py-1.5 transition-colors duration-150 hover:bg-white/10"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
                Import / Export
              </span>
              <motion.div
                animate={{ rotate: ioExpanded ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <ChevronRight className="h-3 w-3 rotate-90 text-white/50" />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {ioExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1">
                    {importExportItems.map((item) => (
                      <NavItem
                        key={item.href}
                        item={item}
                        active={pathname.startsWith(item.href)}
                        collapsed={collapsed}
                        pillId="nav-pill-io"
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
      <div className="mt-4 space-y-1 border-t border-white/20 pt-4" data-tour="sidebar-contact-tools">
        {collapsed ? (
          contactToolItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
              pillId="nav-pill-contact-tools"
            />
          ))
        ) : (
          <>
            <button
              type="button"
              onClick={() => setContactToolsExpanded((p) => !p)}
              className="flex w-full items-center justify-between rounded-[10px] px-3 py-1.5 transition-colors duration-150 hover:bg-white/10"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
                Contact Tools
              </span>
              <motion.div
                animate={{ rotate: contactToolsExpanded ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <ChevronRight className="h-3 w-3 rotate-90 text-white/50" />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {contactToolsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1">
                    {contactToolItems.map((item) => (
                      <NavItem
                        key={item.href}
                        item={item}
                        active={pathname.startsWith(item.href)}
                        collapsed={collapsed}
                        pillId="nav-pill-contact-tools"
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
      {isAdmin ? (
        <div className="mt-4 space-y-1 border-t border-white/20 pt-4" data-tour="sidebar-admin">
          {collapsed ? (
            adminItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                active={pathname.startsWith(item.href)}
                collapsed={collapsed}
                pillId="nav-pill-admin"
              />
            ))
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAdminExpanded((p) => !p)}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-1.5 transition-colors duration-150 hover:bg-white/10"
              >
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
                  Admin
                </span>
                <motion.div
                  animate={{ rotate: adminExpanded ? 180 : 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <ChevronRight className="h-3 w-3 rotate-90 text-white/50" />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {adminExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1">
                      {adminItems.map((item) => (
                        <NavItem
                          key={item.href}
                          item={item}
                          active={pathname.startsWith(item.href)}
                          collapsed={collapsed}
                          pillId="nav-pill-admin"
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      ) : null}
      </>
      )}
      {isAdmin && current !== "crm" && current !== "hub" && (MODULES[current].adminNav?.length ?? 0) > 0 ? (
        <div className="mt-4 space-y-1 border-t border-white/20 pt-4">
          {!collapsed && (
            <span className="block px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              Admin
            </span>
          )}
          {MODULES[current].adminNav?.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
              pillId="nav-pill-module-admin"
            />
          ))}
        </div>
      ) : null}
      {isAdmin && current === "hub" ? (
        <div className="mt-4 space-y-1 border-t border-white/20 pt-4">
          {!collapsed && (
            <span className="block px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              Hub admin
            </span>
          )}
          {hubAdminItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
              pillId="nav-pill-hub-admin"
            />
          ))}
        </div>
      ) : null}
      {isPlatformAdmin ? (
        <div className="mt-4 space-y-1 border-t border-white/20 pt-4">
          {!collapsed && (
            <span className="block px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              LayerSync
            </span>
          )}
          <NavItem
            item={platformItem}
            active={pathname.startsWith(platformItem.href)}
            collapsed={collapsed}
            pillId="nav-pill-platform"
          />
        </div>
      ) : null}
      </div>
      </aside>
    </>
  );
});
