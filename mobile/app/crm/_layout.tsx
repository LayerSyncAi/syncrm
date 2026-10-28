import { Stack } from "expo-router";
import { colors } from "../../lib/theme";

/** SynCRM: tabs for the main screens, everything else pushed on this stack. */
export default function Layout() {
  return (
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
  );
}
