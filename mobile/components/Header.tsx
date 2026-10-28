/** Header buttons every module shares: back to the Hub, and the notification bell. */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Ionicons } from "./ui";
import { colors } from "../lib/theme";
import { useSession } from "../lib/session";

export function HubButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.navigate("/hub")} accessibilityLabel="Back to the Hub" hitSlop={10} style={{ paddingHorizontal: 4 }}>
      <Ionicons name="apps" size={22} color={colors.brand} />
    </Pressable>
  );
}

export function BellButton() {
  const router = useRouter();
  const { user } = useSession();
  const unread = useQuery(api.notifications.unreadCount, user?.orgId || user?.platformViewOrgId ? {} : "skip");
  return (
    <Pressable onPress={() => router.push("/notifications")} accessibilityLabel="Notifications" hitSlop={10} style={{ paddingHorizontal: 4 }}>
      <Ionicons name="notifications-outline" size={22} color={colors.brand} />
      {!!unread && (
        <View style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Screen options for a module's tab navigator: Hub on the left, bell on the right. */
export const moduleTabOptions = {
  headerLeft: () => (
    <View style={{ paddingLeft: 12 }}>
      <HubButton />
    </View>
  ),
  headerRight: () => (
    <View style={{ paddingRight: 14 }}>
      <BellButton />
    </View>
  ),
  headerTitleStyle: { color: colors.text, fontWeight: "700" as const },
  headerStyle: { backgroundColor: colors.card },
  tabBarActiveTintColor: colors.brand,
  tabBarInactiveTintColor: colors.faint,
  sceneStyle: { backgroundColor: colors.background },
};
