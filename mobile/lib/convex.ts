import { Platform } from "react-native";
import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "@convex-dev/auth/react";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set. It comes from mobile/.env locally and from eas.json in store builds."
  );
}

/** The same Convex deployment as the website: one backend for both. */
export const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });

/**
 * Where the sign-in session lives between launches: the iOS Keychain or the
 * Android Keystore, not plain app storage. The web preview has neither and
 * falls back to localStorage.
 */
export const tokenStorage: TokenStorage | undefined =
  Platform.OS === "ios" || Platform.OS === "android"
    ? {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        removeItem: SecureStore.deleteItemAsync,
      }
    : undefined;

/**
 * The website, for the few things that live in its Next.js API routes
 * (the AI assistant, SyncMedia image proxy) and for password-reset links.
 */
export const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/$/, "");
