"use client";

/**
 * SyncSite on the SyncEstate landing page: LayerSync's own analytics and
 * lead inbox (the dashboard in the LayerSyncWeb repo, /dashboard).
 *
 * Set NEXT_PUBLIC_SYNCSITE_URL (e.g. https://dashboard.layersyncai.com) and
 * NEXT_PUBLIC_SYNCSITE_KEY (this site's key from SyncSite, Settings, Sites)
 * to turn it on. Unset, nothing loads. It only runs on the marketing page,
 * never inside the signed-in app, and uses no cookies.
 */
import Script from "next/script";

const url = (process.env.NEXT_PUBLIC_SYNCSITE_URL ?? "").replace(/\/+$/, "");
const key = process.env.NEXT_PUBLIC_SYNCSITE_KEY ?? "";

type SyncSite = { v?: number; lead?: (d: { form: string; fields: Record<string, string> }) => Promise<{ ok: boolean }> };

export function SyncSiteTracker() {
  if (!url || !key) return null;
  // data-exclude: the tracker stays loaded if someone signs in and moves into
  // the app without a full page load, so make sure nothing is sent from there.
  return (
    <Script
      src={`${url}/s.js`}
      data-site={key}
      data-exclude="/app,/portal,/login,/forgot-password,/reset-password,/offline"
      strategy="afterInteractive"
    />
  );
}

/**
 * Copy a "Get in touch" enquiry into SyncSite, tied to the visit (where they
 * came from, what they read). Fire and forget: never throws, never blocks.
 */
export function copyEnquiryToSyncSite(fields: Record<string, string | undefined>): void {
  if (!url || !key) return;
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && v.trim())) as Record<string, string>;
  const api = (window as unknown as { syncsite?: SyncSite }).syncsite;
  if (api?.v && api.lead) {
    void api.lead({ form: "get-in-touch", fields: clean }).catch(() => undefined);
    return;
  }
  // The tracker was blocked or hasn't loaded: post directly.
  void fetch(`${url}/api/lead`, {
    method: "POST",
    keepalive: true,
    credentials: "omit",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ k: key, lead: { form: "get-in-touch", fields: clean, page: window.location.pathname, hp: "" } }),
  }).catch(() => undefined);
}
