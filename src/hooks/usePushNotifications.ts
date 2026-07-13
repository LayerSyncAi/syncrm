"use client";

/**
 * usePushNotifications
 *
 * Client-side lifecycle for PWA web-push: feature detection, permission,
 * subscribe/unsubscribe, and syncing the browser's PushSubscription with the
 * Convex `pushSubscriptions` table.
 *
 * The service worker (/sw.js) is registered by PWARegister in production; this
 * hook registers it on demand when the user enables notifications, so the
 * toggle also works in a dev build.
 */

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Convert a base64url VAPID key to the Uint8Array applicationServerKey wants. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type PushStatus = "unsupported" | "default" | "granted" | "denied";

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function usePushNotifications() {
  const subscribeMutation = useMutation(api.push.subscribe);
  const unsubscribeMutation = useMutation(api.push.unsubscribe);

  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<PushStatus>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Detect support + current permission and whether this browser is subscribed.
  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!VAPID_PUBLIC_KEY;

    setSupported(ok);
    if (!ok) {
      setStatus("unsupported");
      return;
    }

    setStatus(Notification.permission as PushStatus);

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false));
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return false;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);
      if (permission !== "granted") return false;

      const reg = await getRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: the DOM lib types applicationServerKey as BufferSource; a
          // Uint8Array is a valid BufferSource at runtime.
          applicationServerKey: urlBase64ToUint8Array(
            VAPID_PUBLIC_KEY
          ) as BufferSource,
        });
      }

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return false;
      }

      await subscribeMutation({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[push] subscribe failed:", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const { endpoint } = sub;
        await sub.unsubscribe();
        await unsubscribeMutation({ endpoint });
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("[push] unsubscribe failed:", err);
    } finally {
      setBusy(false);
    }
  }, [supported, unsubscribeMutation]);

  return { supported, status, isSubscribed, busy, subscribe, unsubscribe };
}
