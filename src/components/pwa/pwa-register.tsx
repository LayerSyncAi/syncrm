"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const BANNER_DISMISSED_KEY = "syncrm-pwa-banner-dismissed";

/**
 * PWARegister
 *
 * Responsibilities:
 *  1. Register /sw.js in production only (avoids breaking HMR in dev)
 *  2. Capture the browser's beforeinstallprompt to show on demand
 *  3. Render a small install banner at the bottom of the screen
 *
 * Note: this component is rendered outside <ConvexClientProvider> in layout.tsx
 * intentionally so it is available on the landing page before auth. Do not add
 * Convex hooks here without moving it inside the provider first.
 */
export function PWARegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Register the service worker (production only to avoid stale-cache issues with HMR)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => {
        console.warn("[PWA] Service worker registration failed:", err);
      });
  }, []);

  // Capture the install prompt so we can trigger it from our own UI
  useEffect(() => {
    // Skip if user already dismissed this session or previously
    if (typeof window !== "undefined" && localStorage.getItem(BANNER_DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    // Persist so the banner does not reappear after a hard refresh
    localStorage.setItem(BANNER_DISMISSED_KEY, "1");
    setInstallPrompt(null);
  };

  if (!installPrompt) return null;

  return (
    <div
      role="region"
      aria-label="Install SynCRM app"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "0.75rem",
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-strong, rgba(63,82,138,0.22))",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        maxWidth: "calc(100vw - 2rem)",
        width: "360px",
      }}
    >
      {/* App icon - uses img tag because Next/Image is not available outside ConvexClientProvider */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-72x72.png"
        alt="SynCRM"
        width={40}
        height={40}
        style={{ borderRadius: "10px", flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem", color: "var(--text, #1f2a44)" }}>
          Install SynCRM
        </p>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted, #5b647f)", lineHeight: 1.4 }}>
          Add to your home screen for quick access
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          style={{
            padding: "0.375rem 0.625rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--border, rgba(63,82,138,0.14))",
            background: "transparent",
            color: "var(--text-muted, #5b647f)",
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
        <button
          onClick={handleInstall}
          style={{
            padding: "0.375rem 0.75rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "var(--primary, #eca400)",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
