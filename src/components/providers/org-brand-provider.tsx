"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { brand } from "@/config/brand";
import { deriveOrgTheme, orgThemeCss } from "@/lib/org-theme";

/** What `branding.getAppTheme` returns for a white-label organisation. */
export interface AppTheme {
  orgName: string;
  primary: string | null;
  sidebar: string | null;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
}

export interface OrgBrand {
  /** True when the signed-in user's organisation is white-labelled. */
  isWhiteLabel: boolean;
  /** The product name to show: the organisation's name when white-labelled, else SyncEstate. */
  productName: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
}

const DEFAULT_BRAND: OrgBrand = {
  isWhiteLabel: false,
  productName: brand.name,
  logoUrl: null,
  logoOnDarkUrl: null,
};

const OrgBrandContext = createContext<OrgBrand>(DEFAULT_BRAND);

/**
 * Applies a white-label organisation's colours and exposes its name and logos
 * to the app shell. With no theme (not white-labelled), nothing changes and
 * the app keeps the SyncEstate brand.
 */
export function OrgBrandProvider({ theme, children }: { theme: AppTheme | null; children: ReactNode }) {
  const pathname = usePathname();
  const css = useMemo(
    () => (theme ? orgThemeCss(deriveOrgTheme({ primary: theme.primary, sidebar: theme.sidebar })) : null),
    [theme]
  );
  const value = useMemo<OrgBrand>(
    () =>
      theme
        ? {
            isWhiteLabel: true,
            productName: theme.orgName,
            logoUrl: theme.logoUrl,
            logoOnDarkUrl: theme.logoOnDarkUrl,
          }
        : DEFAULT_BRAND,
    [theme]
  );

  // The tab title comes from the root metadata (the SyncEstate name); Next
  // re-applies it on navigation, so re-set it whenever the route changes.
  useEffect(() => {
    if (!theme) return;
    document.title = theme.orgName;
    return () => {
      document.title = brand.metadata.title;
    };
  }, [theme, pathname]);

  return (
    <OrgBrandContext.Provider value={value}>
      {css ? <style id="org-theme" dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {children}
    </OrgBrandContext.Provider>
  );
}

export function useOrgBrand(): OrgBrand {
  return useContext(OrgBrandContext);
}
