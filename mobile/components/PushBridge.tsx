/**
 * Keeps push working without anyone having to think about it: offers it once
 * after the first sign-in, re-registers the token on each launch when
 * permission was already given, and opens the right screen when a
 * notification is tapped (also from a cold start).
 */
import { useEffect } from "react";
import { Alert, Platform } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import { api } from "../../convex/_generated/api";
import { useSession } from "../lib/session";
import { enablePush, shouldOfferPush, urlOf } from "../lib/push";
import { appRoute } from "../lib/routes";

export function PushBridge() {
  const { user } = useSession();
  const register = useMutation(api.push.registerExpoToken);
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      // Silent re-registration when permission was already given.
      await enablePush(register, false).catch(() => {});
      if (cancelled || !(await shouldOfferPush().catch(() => false))) return;
      Alert.alert(
        "Turn on notifications?",
        "Get reminders, your daily agenda and alerts such as rent paid, repairs and valuations on this phone. You can change this on your account screen.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Turn on", onPress: () => void enablePush(register, true).catch(() => {}) },
        ]
      );
    })();
    return () => {
      cancelled = true;
    };
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
