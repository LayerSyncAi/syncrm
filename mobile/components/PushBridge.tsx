/**
 * Keeps push working without anyone having to think about it: re-registers
 * the token on each launch when permission was already given, and opens the
 * right screen when a notification is tapped (also from a cold start).
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import { api } from "../../convex/_generated/api";
import { useSession } from "../lib/session";
import { enablePush, urlOf } from "../lib/push";
import { appRoute } from "../lib/routes";

export function PushBridge() {
  const { user } = useSession();
  const register = useMutation(api.push.registerExpoToken);
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn) return;
    // Silent: never prompts here; the prompt lives on the account screen.
    enablePush(register, false).catch(() => {});
  }, [signedIn, register]);

  // Notification taps exist on phones only; the web preview has none.
  return Platform.OS === "ios" || Platform.OS === "android" ? <TapRouting signedIn={signedIn} /> : null;
}

function TapRouting({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || !signedIn) return;
    const raw = urlOf(last);
    // Portal users get portal paths; everyone else website paths, mapped across.
    const to = raw?.startsWith("/portal") ? raw : appRoute(raw);
    if (to) router.push(to as Href);
  }, [last, signedIn, router]);
  return null;
}
