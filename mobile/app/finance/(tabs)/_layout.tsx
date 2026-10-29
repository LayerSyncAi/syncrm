import { Tabs } from "expo-router";
import { Ionicons } from "../../../components/ui";
import { moduleTabOptions } from "../../../components/Header";
import { useFinanceRole } from "../../../lib/finance/hooks";

/** Property managers see only the dashboard and landlords; the rest is for accounts staff. */
export default function TabsLayout() {
  const role = useFinanceRole();
  const staff = !!role?.isStaff;
  return (
    <Tabs screenOptions={moduleTabOptions}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Ionicons name="speedometer-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="money" options={{ title: "Money", href: staff ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="swap-vertical-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="landlords" options={{ title: "Landlords", tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="instalments" options={{ title: "Instalments", href: staff ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color as string} /> }} />
      <Tabs.Screen name="payouts" options={{ title: "Payouts", href: staff ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="send-outline" size={size} color={color as string} /> }} />
    </Tabs>
  );
}
