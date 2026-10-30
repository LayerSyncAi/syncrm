"use client";

import { useEffect, useRef } from "react";

/** Web sign-out after this long with no activity in any tab (BRD Hub HB-10). */
export const WEB_IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;

const STORAGE_KEY = "syncestate.lastActiveAt";
// Activity is written at most this often, so scrolling doesn't hammer storage.
const WRITE_EVERY_MS = 60 * 1000;
const CHECK_EVERY_MS = 60 * 1000;

function readLastActive(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastActive(at: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // Private mode or blocked storage: this tab still tracks its own activity.
  }
}

/** Start a fresh idle window; call on sign-in so an old visit can't end the new session. */
export function markActiveNow() {
  writeLastActive(Date.now());
}

/** True when the site runs as an installed app on a phone, which counts as mobile. */
function isInstalledApp(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Signs the browser out after WEB_IDLE_LIMIT_MS without a click, key press or
 * scroll in any tab. Server sessions stay long so the mobile app (and the
 * installed home-screen app) never has to sign in again; the idle limit is a
 * desktop-browser rule only.
 */
export function useIdleSignOut(enabled: boolean, onIdle: () => void | Promise<void>) {
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled || isInstalledApp()) return;

    let localLast = Date.now();
    let lastWrite = 0;
    let fired = false;

    // A browser left closed past the limit signs out on its next visit.
    const stored = readLastActive();
    if (stored !== null && Date.now() - stored > WEB_IDLE_LIMIT_MS) {
      fired = true;
      void onIdleRef.current();
      return;
    }

    const markActive = () => {
      const now = Date.now();
      localLast = now;
      if (now - lastWrite > WRITE_EVERY_MS) {
        lastWrite = now;
        writeLastActive(now);
      }
    };
    markActive();

    const check = () => {
      if (fired) return;
      // Another tab may have been active more recently.
      const last = Math.max(localLast, readLastActive() ?? 0);
      if (Date.now() - last > WEB_IDLE_LIMIT_MS) {
        fired = true;
        void onIdleRef.current();
      }
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, markActive, { passive: true });
    // Timers are throttled in background tabs, so check again on return.
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const e of events) window.removeEventListener(e, markActive);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
