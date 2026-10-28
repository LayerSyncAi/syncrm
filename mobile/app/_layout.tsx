import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex, tokenStorage } from "../lib/convex";
import { SessionProvider, useSession } from "../lib/session";
import { colors } from "../lib/theme";
import { DeactivatedAccount, ForcedPasswordChange } from "../components/AccountGates";

export { ErrorBoundary } from "expo-router";

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

function RootStack() {
  const { loading, user, deactivated } = useSession();

  // The splash stays up until we know who is signed in.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

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
        <Stack.Screen name="media" options={{ headerShown: false }} />
        <Stack.Screen name="portal" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="platform" options={{ title: "Platform" }} />
        <Stack.Screen name="assistant" options={{ title: "Copilot" }} />
      </Stack>
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
