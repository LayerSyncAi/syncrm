/**
 * Landlord and tenant portal shell: the agency name in the header, a sign-out
 * button, and bottom tabs that differ by kind. Tabs of the other kind are
 * hidden, and each screen also checks the kind itself.
 */
import { Pressable, Text, View } from "react-native";
import { Redirect, Tabs, useRouter } from "expo-router";
import { useSignOut } from "../../lib/useSignOut";
import { Ionicons, Loading } from "../../components/ui";
import { usePortal } from "../../components/portal/common";
import { useSession } from "../../lib/session";
import { colors, font } from "../../lib/theme";

export { ScreenError as ErrorBoundary } from "../../components/ScreenError";

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} size={size} color={color as string} />;

export default function PortalLayout() {
  const { loading, signedIn, user } = useSession();
  const portal = usePortal();
  const signOut = useSignOut();
  const router = useRouter();

  if (loading) return <Loading />;
  if (!signedIn || !user) return <Redirect href="/sign-in" />;
  // Staff belong in the main app.
  if (!user.portalKind) return <Redirect href="/" />;
  if (portal === undefined) return <Loading />;

  const tenant = user.portalKind === "tenant";
  const landlord = !tenant;

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => (
          <View>
            <Text numberOfLines={1} style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>
              {portal?.orgName ?? "Portal"}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: font.xs, color: colors.muted }}>
              {tenant ? "Tenant portal" : "Landlord portal"}
              {portal?.name ? ` · ${portal.name}` : ""}
            </Text>
          </View>
        ),
        headerRight: () => (
          <Pressable
            onPress={async () => {
              await signOut();
              router.replace("/sign-in");
            }}
            accessibilityLabel="Sign out"
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14 }}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: font.sm }}>Sign out</Text>
          </Pressable>
        ),
        headerStyle: { backgroundColor: colors.card },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faint,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="lease" options={{ title: "Lease", tabBarIcon: icon("document-text-outline"), href: tenant ? undefined : null }} />
      <Tabs.Screen name="payments" options={{ title: "Payments", tabBarIcon: icon("receipt-outline"), href: tenant ? undefined : null }} />
      <Tabs.Screen name="properties" options={{ title: "Properties", tabBarIcon: icon("business-outline"), href: landlord ? undefined : null }} />
      <Tabs.Screen name="maintenance" options={{ title: "Repairs", tabBarIcon: icon("construct-outline") }} />
      <Tabs.Screen name="inspections" options={{ title: "Inspections", tabBarIcon: icon("clipboard-outline"), href: landlord ? undefined : null }} />
      <Tabs.Screen name="statements" options={{ title: "Statements", tabBarIcon: icon("cash-outline"), href: landlord ? undefined : null }} />
      <Tabs.Screen
        name="inspections/[id]"
        options={{
          href: null,
          title: "Report",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={10} style={{ paddingLeft: 14 }}>
              <Ionicons name="chevron-back" size={24} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}
