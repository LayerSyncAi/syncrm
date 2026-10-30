/**
 * The SyncEstate Hub: a greeting and one-line summary, the person's modules
 * as a two-column launcher with their headline figures inside, everything a
 * module flags as needing attention, and recent alerts. Mirrors the website.
 */
import { Pressable, Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Badge, Body, Card, Ionicons, ListItem, Section, Screen, Title } from "../components/ui";
import { BellButton } from "../components/Header";
import { ProductIcon } from "../components/ProductIcon";
import { MODULES, MODULE_ORDER, UPCOMING, type ModuleKey } from "../lib/modules";
import { useSession } from "../lib/session";
import { appRoute } from "../lib/routes";
import { timeAgo } from "../lib/format";
import { colors, font, radius, space } from "../lib/theme";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** The square tile a product icon sits on. */
function IconTile({ product, muted }: { product: (typeof MODULES)[ModuleKey]["product"]; muted?: boolean }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ProductIcon name={product} size={22} color={muted ? colors.faint : colors.text} />
    </View>
  );
}

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
  const figures: Partial<Record<ModuleKey, typeof crm>> = { crm, stay, worth, finance, dev };
  const go = (href: string | null) => href && router.push(href as Href);
  const firstName = (user?.fullName || user?.name || "").split(" ")[0];

  // Anything a module flags as a warning (arrears, overdue, expiring).
  const attention = MODULE_ORDER.flatMap((k) =>
    mine.includes(k) ? (figures[k] ?? []).filter((f) => f.tone === "warning").map((f) => ({ ...f, module: k })) : []
  );
  const orgName = hub?.orgName ?? "your agency";
  const summary = attention.length
    ? `Here is ${orgName} at a glance, and ${attention.length} thing${attention.length === 1 ? " needs" : "s need"} your attention.`
    : `Here is ${orgName} at a glance. Nothing needs your attention right now.`;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const open = MODULE_ORDER.filter((k) => mine.includes(k));
  const closed = MODULE_ORDER.filter((k) => !mine.includes(k));

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: hub?.orgName ?? "SyncEstate",
          headerLeft: () => (
            <Pressable onPress={() => router.push("/account")} accessibilityLabel="Your account" hitSlop={10}>
              <Ionicons name="person-circle-outline" size={26} color={colors.brand} />
            </Pressable>
          ),
          headerRight: () => <BellButton />,
        }}
      />
      <Screen>
        <View style={{ gap: space.sm }}>
          <Text style={{ fontSize: font.xs, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>{today}</Text>
          <Title>{firstName ? `${greeting()}, ${firstName}` : greeting()}</Title>
          <Body muted>{summary}</Body>
        </View>

        {/* Launcher: two columns, each card with up to two headline figures. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {open.map((k) => {
            const m = MODULES[k];
            const figs = (figures[k] ?? []).slice(0, 2);
            return (
              <Card key={k} onPress={() => router.push(m.href as Href)} style={{ flexBasis: "47%", flexGrow: 1, gap: space.md }}>
                <IconTile product={m.product} />
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{m.name}</Text>
                {figs.length > 0 ? (
                  <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
                    {figs.map((f) => (
                      <View key={f.label}>
                        <Text style={{ fontSize: 20, fontWeight: "300", letterSpacing: -0.4, color: f.tone === "warning" ? colors.warning : colors.text }}>{f.value}</Text>
                        <Text style={{ fontSize: font.xs, color: colors.muted }} numberOfLines={1}>
                          {f.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: font.sm, color: colors.muted }}>{m.tagline}</Text>
                )}
              </Card>
            );
          })}
        </View>

        {attention.length > 0 && (
          <Section title="Needs attention">
            {attention.map((a) => (
              <ListItem
                key={`${a.module}-${a.label}`}
                title={a.label}
                subtitle={MODULES[a.module].name + (a.hint ? ` · ${a.hint}` : "")}
                right={<Badge label={a.value} tone="warning" />}
                onPress={a.href ? () => go(appRoute(a.href)) : undefined}
              />
            ))}
          </Section>
        )}

        {hub?.isAdmin && (
          <ListItem icon="settings-outline" title="Hub admin" subtitle="Users, roles, agency settings and logs" onPress={() => router.push("/admin")} />
        )}

        {notes && notes.length > 0 && (
          <Section title="Recent activity" right={<Text onPress={() => router.push("/notifications")} style={{ color: colors.brand, fontWeight: "600" }}>See all</Text>}>
            {notes.map((n) => (
              <ListItem key={n._id} title={n.title} subtitle={n.body} meta={timeAgo(n.createdAt)} onPress={n.href ? () => go(appRoute(n.href)) : undefined} />
            ))}
          </Section>
        )}

        {(closed.length > 0 || UPCOMING.length > 0) && (
          <View style={{ gap: space.sm }}>
            {closed.map((k) => {
              const m = MODULES[k];
              const onPlan = hub?.enabledModules.includes(k);
              return (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong }}>
                  <ProductIcon name={m.product} size={20} color={colors.faint} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{m.name}</Text>
                    <Text style={{ fontSize: font.xs, color: colors.muted }}>
                      {onPlan ? "Your role cannot open this" : hub?.isAdmin ? "Ask LayerSync to switch this on" : "Not on your plan"}
                    </Text>
                  </View>
                </View>
              );
            })}
            {UPCOMING.map((u) => (
              <View key={u.name} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong }}>
                <ProductIcon name={u.product} size={20} color={colors.faint} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{u.name}</Text>
                  <Text style={{ fontSize: font.xs, color: colors.muted }}>{u.tagline}</Text>
                </View>
                <Badge label="Coming soon" />
              </View>
            ))}
          </View>
        )}
      </Screen>
    </>
  );
}
