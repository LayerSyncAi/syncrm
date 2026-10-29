import { Tabs } from "expo-router";
import { Ionicons } from "../../../components/ui";
import { moduleTabOptions } from "../../../components/Header";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={moduleTabOptions}>
      <Tabs.Screen name="index" options={{ title: "Developments", tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="buyers" options={{ title: "Buyers", tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color as string} /> }} />
    </Tabs>
  );
}
