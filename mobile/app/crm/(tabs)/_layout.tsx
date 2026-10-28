import { Tabs } from "expo-router";
import { Ionicons } from "../../../components/ui";
import { moduleTabOptions } from "../../../components/Header";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={moduleTabOptions}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Ionicons name="speedometer-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="leads" options={{ title: "Leads", tabBarIcon: ({ color, size }) => <Ionicons name="git-network-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="properties" options={{ title: "Properties", tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" size={size} color={color as string} /> }} />
    </Tabs>
  );
}
