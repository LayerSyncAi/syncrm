import { Tabs } from "expo-router";
import { Ionicons } from "../../../components/ui";
import { moduleTabOptions } from "../../../components/Header";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={moduleTabOptions}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Ionicons name="speedometer-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="jobs" options={{ title: "Jobs", tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="comparables" options={{ title: "Comparables", tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" size={size} color={color as string} /> }} />
    </Tabs>
  );
}
