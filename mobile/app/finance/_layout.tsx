import { useEffect } from "react";
import { Stack } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ModuleGate } from "../../components/ModuleGate";
import { colors } from "../../lib/theme";

export { ScreenError as ErrorBoundary } from "../../components/ScreenError";

/** SyncFinance: tabs for the main screens, everything else pushed on this stack. */
export default function Layout() {
  return (
    <ModuleGate module="finance">
      <SeedDefaults />
      <Stack
        screenOptions={{
          headerTintColor: colors.brand,
          headerTitleStyle: { color: colors.text, fontWeight: "700" },
          headerStyle: { backgroundColor: colors.card },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ModuleGate>
  );
}

/** Seeds the agency's default settings and categories on first open, as the website does. */
function SeedDefaults() {
  const init = useMutation(api.finance.settings.init);
  useEffect(() => {
    init({}).catch(() => {});
  }, [init]);
  return null;
}
