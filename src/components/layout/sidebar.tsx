"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  LayoutDashboard,
  Shield,
  Star,
  Upload,
  UserCog,
  Users,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/app/leads", icon: Waypoints },
  { label: "Contacts", href: "/app/contacts", icon: Users },
  { label: "Properties", href: "/app/properties", icon: Building2 },
  { label: "Tasks", href: "/app/tasks", icon: ClipboardList },
];

const importExportItems = [
  { label: "Lead Import", href: "/app/leads/import", icon: Upload },
  { label: "Lead Export", href: "/app/leads/export", icon: Download },
];

const adminItems = [
  { label: "Users", href: "/app/admin/users", icon: UserCog },
  { label: "Roles", href: "/app/admin/roles", icon: Shield },
  { label: "Stages", href: "/app/admin/stages", icon: Waypoints },
  { label: "Lead Scoring", href: "/app/admin/lead-scoring", icon: Star },
  { label: "Commissions", href: "/app/admin/commissions", icon: DollarSign },
];

interface SidebarProps {
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  orgName?: string;
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
  const textColor = active ? "text-[#eca400]" : "text-[#fcfcfc]";
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
      {/* Recommendation #2: Sliding active indicator pill */}
      {active && (
        <motion.div
          layoutId={pillId}
          className="absolute inset-0 rounded-[10px] bg-white/10"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
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
            className="absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-[#1e3f1a] px-3 py-2 text-xs font-medium text-white shadow-lg"
          >
            {item.label}
            <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 border-4 border-transparent border-r-[#1e3f1a]" />
          </motion.div>
        )}
      </AnimatePresence>
    </Link>
  );
}

export const Sidebar = memo(function Sidebar({ isAdmin, collapsed, onToggle, orgName }: SidebarProps) {
  const pathname = usePathname();
  const [ioExpanded, setIoExpanded] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col bg-[#2a5925] px-3 py-4 text-[#fcfcfc] transition-[width] duration-200",
        collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[#2a5925] text-[#fcfcfc] shadow-sm transition hover:bg-white/10"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      <div className="mb-6 flex items-center justify-between px-2">
        <div
          className={cn(
            "rounded-[12px] border border-white/20 bg-white/10 px-3 py-3 text-sm font-semibold transition-all duration-200",
            collapsed ? "w-full text-center" : "w-auto"
          )}
        >
          {collapsed ? (orgName ? orgName[0].toUpperCase() : "S") : (orgName || "SynCRM")}
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={pathname.startsWith(item.href)}
            collapsed={collapsed}
            pillId="nav-pill-main"
          />
        ))}
      </nav>
      <div className="mt-4 space-y-1 border-t border-white/20 pt-4">
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
      {isAdmin ? (
        <div className="mt-4 space-y-1 border-t border-white/20 pt-4">
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
    </aside>
  );
});
