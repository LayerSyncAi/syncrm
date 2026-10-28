import { Stack } from "expo-router";
import { ModuleGate } from "../../components/ModuleGate";
import { colors } from "../../lib/theme";

export { ScreenError as ErrorBoundary } from "../../components/ScreenError";

/** Sync Stay: tabs for the main screens, everything else pushed on this stack. */
export default function Layout() {
  return (
    <ModuleGate module="stay">
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
