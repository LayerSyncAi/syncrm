import { Stack } from "expo-router";
import { ModuleGate } from "../../components/ModuleGate";
import { colors } from "../../lib/theme";

export { ScreenError as ErrorBoundary } from "../../components/ScreenError";

/** SyncMedia: the brochure list, the studio and the brand kit, all on one stack. */
export default function Layout() {
  return (
    <ModuleGate module="media">
      <Stack
        screenOptions={{
          headerTintColor: colors.brand,
          headerTitleStyle: { color: colors.text, fontWeight: "700" },
          headerStyle: { backgroundColor: colors.card },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ title: "SyncMedia" }} />
        <Stack.Screen name="new" options={{ title: "Brochure" }} />
        <Stack.Screen name="brand-kit" options={{ title: "Brand kit" }} />
      </Stack>
    </ModuleGate>
  );
}
