import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "../../components/ui";
import { colors } from "../../lib/theme";

export { ScreenError as ErrorBoundary } from "../../components/ScreenError";

/** Hub admin: a menu, with each setting pushed on this stack. */
export default function Layout() {
  const router = useRouter();
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
      <Stack.Screen
        name="index"
        options={{
          title: "Hub admin",
          headerLeft: () => (
            <Pressable onPress={() => router.navigate("/hub")} accessibilityLabel="Back to the Hub" hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="users" options={{ title: "Users" }} />
      <Stack.Screen name="roles" options={{ title: "Roles" }} />
      <Stack.Screen name="settings" options={{ title: "Agency settings" }} />
      <Stack.Screen name="logs" options={{ title: "Logs" }} />
      <Stack.Screen name="stages" options={{ title: "Pipeline stages" }} />
      <Stack.Screen name="lead-scoring" options={{ title: "Lead scoring" }} />
      <Stack.Screen name="commissions" options={{ title: "Commissions" }} />
    </Stack>
  );
}
