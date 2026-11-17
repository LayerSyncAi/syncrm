"use client";

import { Building2, LayoutGrid, Users } from "lucide-react";
import { brand } from "@/config/brand";
import { deriveOrgTheme, inkFor, orgInitials } from "@/lib/org-theme";
import { readableOn } from "@/lib/color";

/**
 * A miniature of the app shell (sidebar, top bar, a card with a button and a
 * link) in the colours the organisation's people will see after signing in:
 * its own brand when white-labelled, otherwise SyncEstate's.
 */
export function BrandPreview({
  name,
  whiteLabel,
  primary,
  sidebar,
  logoUrl,
  logoOnDarkUrl,
}: {
  name: string;
  whiteLabel: boolean;
  primary?: string;
  sidebar?: string;
  logoUrl?: string | null;
  logoOnDarkUrl?: string | null;
}) {
  const orgName = name.trim() || "Your agency";
  const t = whiteLabel
    ? deriveOrgTheme({ primary, sidebar })
    : {
        primary: brand.colors.primary,
        primaryForeground: brand.colors.primaryForeground,
        primaryInk: brand.colors.primaryInk ?? inkFor(brand.colors.primary),
        sidebar: brand.colors.sidebar,
        sidebarHover: brand.colors.sidebarHover,
        sidebarForeground: brand.colors.sidebarForeground,
      };
  const productName = whiteLabel ? orgName : brand.name;

  const nav = [
    { label: "Hub", icon: LayoutGrid, active: true },
    { label: "Leads", icon: Users, active: false },
    { label: "Properties", icon: Building2, active: false },
  ];

  return (
    <div
      className="overflow-hidden rounded-[12px] border border-border shadow-sm"
      aria-label={`Preview of the app as ${orgName} will see it`}
      role="img"
    >
      <div className="flex h-[230px] text-[11px]">
        {/* Sidebar */}
        <div className="flex w-[38%] flex-col gap-1.5 p-3" style={{ backgroundColor: t.sidebar, color: t.sidebarForeground }}>
          <div className="mb-2 flex h-7 items-center">
            {whiteLabel ? (
              logoOnDarkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoOnDarkUrl} alt="" className="h-6 max-w-full object-contain object-left" />
              ) : logoUrl ? (
                <span className="flex h-7 max-w-full items-center rounded-[8px] bg-white px-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="" className="h-4 max-w-full object-contain" />
                </span>
              ) : (
                <span className="flex items-center gap-1.5 truncate font-semibold">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[9px] font-bold"
                    style={{ backgroundColor: t.primary, color: t.primaryForeground }}
                  >
                    {orgInitials(orgName)}
                  </span>
                  <span className="truncate">{orgName}</span>
                </span>
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logos.lockupReversed} alt="" className="h-5 w-auto" />
            )}
          </div>
          {nav.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-full px-2.5 py-1.5"
              style={item.active ? { backgroundColor: t.sidebarHover } : { opacity: 0.75 }}
            >
              <item.icon className="h-3.5 w-3.5" style={item.active ? { color: t.primary } : undefined} aria-hidden="true" />
              <span className={item.active ? "font-medium" : undefined}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col" style={{ backgroundColor: brand.colors.background }}>
          <div className="flex h-9 items-center justify-between border-b border-black/5 bg-white px-3">
            <span className="truncate font-semibold" style={{ color: brand.colors.foreground }}>
              {productName}
            </span>
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold"
              style={{ backgroundColor: t.primary, color: readableOn(t.primary) }}
            >
              {orgInitials(orgName).slice(0, 1)}
            </span>
          </div>
          <div className="flex-1 p-3">
            <div className="space-y-2 rounded-[10px] bg-white p-3 shadow-sm">
              <p className="font-semibold" style={{ color: brand.colors.foreground }}>
                Welcome to {productName}
              </p>
              <p className="text-[10px] text-text-muted">3 new leads waiting for a call back.</p>
              <div className="flex items-center gap-3 pt-1">
                <span
                  className="rounded-full px-3 py-1.5 font-medium"
                  style={{ backgroundColor: t.primary, color: t.primaryForeground }}
                >
                  Add lead
                </span>
                <span className="font-medium underline-offset-2" style={{ color: t.primaryInk }}>
                  View pipeline
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
