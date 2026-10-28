/**
 * Push notifications on the phone, through Expo's push service. The backend
 * sends the same alerts it sends to browsers (convex/pushSender.ts): activity
 * reminders and the daily agenda. Tapping one opens the matching screen.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const TOKEN_KEY = "syncestate.pushToken";

// Show alerts even while the app is open, as the website's toasts do.
if (Platform.OS !== "web") Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushResult = { ok: true; token: string } | { ok: false; reason: string };

/** The EAS project id the push token is issued for (set by `eas init`). */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Ask for permission (only when `prompt` is true), get this phone's Expo
 * push token and register it with `save` (api.push.registerExpoToken).
 */
export async function enablePush(
  save: (args: { token: string; platform: "ios" | "android" }) => Promise<unknown>,
  prompt: boolean
): Promise<PushResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return { ok: false, reason: "Push works on phones only." };
  if (!Device.isDevice) return { ok: false, reason: "Push notifications need a real phone, not a simulator." };
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Reminders and alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && prompt) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return { ok: false, reason: "Notifications are switched off for this app in Settings." };
  const id = projectId();
  if (!id) return { ok: false, reason: "This build has no EAS project id, so it cannot receive push notifications." };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  await save({ token, platform: Platform.OS });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return { ok: true, token };
}

/** Forget this phone's token on sign-out or when the user turns push off. */
export async function disablePush(remove: (args: { token: string }) => Promise<unknown>): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  try {
    await remove({ token });
  } finally {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function pushEnabledHere(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(TOKEN_KEY));
}

/** The website path a notification opens, from its data payload. */
export function urlOf(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as { url?: unknown } | undefined;
  return typeof data?.url === "string" ? data.url : null;
}
