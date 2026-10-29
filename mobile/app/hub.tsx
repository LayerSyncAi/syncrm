/** The Sync Estate Hub: modules the person can open, director figures and recent alerts. */
import { Pressable, Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Body, Card, Ionicons, ListItem, Section, Stat, StatGrid, Screen, Title, Badge } from "../components/ui";
import { BellButton } from "../components/Header";
import { MODULES, MODULE_ORDER, UPCOMING, type ModuleKey } from "../lib/modules";
import { useSession } from "../lib/session";
import { appRoute } from "../lib/routes";
import { timeAgo } from "../lib/format";
import { colors, font, radius, space } from "../lib/theme";

export default function Hub() {
  const router = useRouter();
  const { user, hub } = useSession();
  const mine = hub?.myModules ?? [];
  const crm = useQuery(api.hub.crmSummary, mine.includes("crm") ? {} : "skip");
  const stay = useQuery(api.stay.dashboard.hubSummary, mine.includes("stay") ? {} : "skip");
  const worth = useQuery(api.worth.dashboard.hubSummary, mine.includes("worth") ? {} : "skip");
  const finance = useQuery(api.finance.reports.hubSummary, mine.includes("finance") ? {} : "skip");
  const dev = useQuery(api.dev.dashboard.hubSummary, mine.includes("dev") ? {} : "skip");
  const notes = useQuery(api.notifications.listMine, hub ? { limit: 5 } : "skip");
  const figures: Array<[ModuleKey, typeof crm]> = [
    ["crm", crm],
    ["stay", stay],
    ["worth", worth],
    ["finance", finance],
    ["dev", dev],
  ];
  const go = (href: string | null) => href && router.push(href as Href);
  const firstName = (user?.fullName || user?.name || "").split(" ")[0];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: hub?.orgName ?? "Sync Estate",
          headerLeft: () => (
            <Pressable onPress={() => router.push("/account")} accessibilityLabel="Your account" hitSlop={10}>
              <Ionicons name="person-circle-outline" size={26} color={colors.brand} />
            </Pressable>
          ),
          headerRight: () => <BellButton />,
        }}
      />
      <Screen>
        <View>
          <Title>{firstName ? `Hello ${firstName}` : "Hello"}</Title>
          <Body muted>Open a module to get to work.</Body>
        </View>

        <View style={{ gap: space.sm }}>
          {MODULE_ORDER.map((k) => {
            const m = MODULES[k];
            const open = mine.includes(k);
            const onPlan = hub?.enabledModules.includes(k);
            return (
              <Card key={k} onPress={open ? () => router.push(m.href as Href) : undefined} style={[{ flexDirection: "row", alignItems: "center", gap: space.md }, !open && { opacity: 0.6 }]}>
                <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: m.color, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={m.icon} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{m.name}</Text>
                  <Text style={{ fontSize: font.sm, color: colors.muted }}>
                    {open ? m.tagline : !onPlan ? (hub?.isAdmin ? "Ask LayerSync to switch this on" : "Not on your plan") : "Your role cannot open this"}
                  </Text>
                </View>
                {open && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
              </Card>
            );
          })}
          {hub?.isAdmin && (
            <ListItem icon="settings-outline" title="Hub admin" subtitle="Users, roles, agency settings and logs" onPress={() => router.push("/admin")} />
          )}
          {UPCOMING.map((u) => (
            <Card key={u.name} style={{ flexDirection: "row", alignItems: "center", gap: space.md, opacity: 0.6 }}>
              <Ionicons name={u.icon} size={22} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{u.name}</Text>
                <Text style={{ fontSize: font.sm, color: colors.muted }}>{u.tagline}</Text>
              </View>
              <Badge label="Coming soon" />
            </Card>
          ))}
        </View>

        {figures.map(([k, list]) =>
          list && list.length > 0 ? (
            <Section key={k} title={MODULES[k].name}>
              <StatGrid>
                {list.map((f) => (
                  <Stat key={f.label} label={f.label} value={f.value} hint={f.hint} tone={f.tone === "default" ? undefined : f.tone} onPress={f.href ? () => go(appRoute(f.href)) : undefined} />
                ))}
              </StatGrid>
            </Section>
          ) : null
        )}

        {notes && notes.length > 0 && (
          <Section title="Recent notifications" right={<Text onPress={() => router.push("/notifications")} style={{ color: colors.brand, fontWeight: "600" }}>See all</Text>}>
            {notes.map((n) => (
              <ListItem key={n._id} title={n.title} subtitle={n.body} meta={timeAgo(n.createdAt)} onPress={n.href ? () => go(appRoute(n.href)) : undefined} />
            ))}
          </Section>
        )}
      </Screen>
    </>
  );
}
