import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex, tokenStorage } from "../lib/convex";
import { SessionProvider, useSession } from "../lib/session";
import { colors } from "../lib/theme";
import { DeactivatedAccount, ForcedPasswordChange } from "../components/AccountGates";
import { PushBridge } from "../components/PushBridge";
import { OfflineBanner } from "../components/OfflineBanner";
import { ToastHost } from "../lib/toast";

export { ScreenError as ErrorBoundary } from "../components/ScreenError";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={tokenStorage}>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootStack />
      </SessionProvider>
    </ConvexAuthProvider>
  );
}

/** Screens anyone may open without signing in. */
const PUBLIC = new Set(["sign-in", "forgot-password"]);

function RootStack() {
  const { loading, signedIn, user, deactivated, isPortal } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const first = segments[0] ?? "";

  // The splash stays up until we know who is signed in.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Keep everyone where they belong, whatever link opened the app: signed-out
  // people go to sign-in, portal users stay in the portal and staff out of it.
  useEffect(() => {
    if (loading) return;
    if (!signedIn || !user) {
      if (!PUBLIC.has(first)) router.replace("/sign-in");
    } else if (PUBLIC.has(first)) {
      router.replace("/");
    } else if (isPortal && first !== "portal") {
      router.replace("/portal");
    } else if (!isPortal && first === "portal") {
      router.replace("/");
    }
  }, [loading, signedIn, user, isPortal, first, router]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerTintColor: colors.brand,
          headerTitleStyle: { color: colors.text, fontWeight: "700" },
          headerStyle: { backgroundColor: colors.card },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
        <Stack.Screen name="hub" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="account" options={{ title: "Your account" }} />
        <Stack.Screen name="crm" options={{ headerShown: false }} />
        <Stack.Screen name="stay" options={{ headerShown: false }} />
        <Stack.Screen name="worth" options={{ headerShown: false }} />
        <Stack.Screen name="finance" options={{ headerShown: false }} />
        <Stack.Screen name="media" options={{ headerShown: false }} />
        <Stack.Screen name="portal" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="platform" options={{ title: "Platform" }} />
        <Stack.Screen name="assistant" options={{ title: "Copilot" }} />
      </Stack>
      <PushBridge />
      <OfflineBanner />
      <ToastHost />
      {deactivated && (
        <View style={StyleSheet.absoluteFill}>
          <DeactivatedAccount />
        </View>
      )}
      {user?.resetPasswordOnNextLogin && (
        <View style={StyleSheet.absoluteFill}>
          <ForcedPasswordChange />
        </View>
      )}
    </View>
  );
}
