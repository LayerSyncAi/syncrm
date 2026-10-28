import { Tabs } from "expo-router";
import { Ionicons } from "../../../components/ui";
import { moduleTabOptions } from "../../../components/Header";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={moduleTabOptions}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Ionicons name="speedometer-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="properties" options={{ title: "Properties", tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="leases" options={{ title: "Leases", tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="arrears" options={{ title: "Arrears", tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" size={size} color={color as string} /> }} />
    </Tabs>
  );
}
