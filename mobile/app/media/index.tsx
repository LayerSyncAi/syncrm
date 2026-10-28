/** My brochures: drafts are private to the agent who made them. */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, EmptyState, Fab, Ionicons, List } from "../../components/ui";
import { HubButton } from "../../components/Header";
import { BrochureThumb } from "../../components/media/BrochureThumb";
import { docFromBrochure, useBrandKit } from "../../lib/media/doc";
import { getFormat } from "@/lib/syncmedia/formats";
import { getTemplate } from "@/lib/syncmedia/templates";
import { useSession } from "../../lib/session";
import { confirm, useRun } from "../../lib/useRun";
import { timeAgo } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

export default function MediaHome() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  const { hub } = useSession();
  const brochures = useQuery(api.syncmedia.listMine, {});
  const { kit } = useBrandKit();
  const remove = useMutation(api.syncmedia.remove);
  const { run } = useRun();
  const [refreshing, setRefreshing] = useState(false);

  // Convex queries are live, so a pull only needs to feel like a refresh.
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  // Arriving from a property opens the studio on it straight away.
  const startHref = useMemo(
    () => ({ pathname: "/media/new" as const, params: propertyId ? { propertyId } : {} }),
    [propertyId]
  );

  async function handleDelete(id: Id<"brochures">, title: string) {
    if (!(await confirm("Delete brochure", `Delete "${title || "Untitled brochure"}"? This cannot be undone.`, "Delete", true))) return;
    await run(() => remove({ id }));
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "SyncMedia",
          headerLeft: () => <HubButton />,
          headerRight: hub?.isAdmin
            ? () => (
                <Pressable onPress={() => router.push("/media/brand-kit")} accessibilityLabel="Brand kit" hitSlop={10}>
                  <Ionicons name="color-palette-outline" size={24} color={colors.brand} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <List
        data={brochures}
        keyExtractor={(b) => b._id}
        refreshing={refreshing}
        onRefresh={refresh}
        header={
          <View style={{ gap: space.md }}>
            <Body muted>Property brochures for social posts, WhatsApp and print. Your drafts are private to you.</Body>
            {propertyId ? <Button title="New brochure for this property" icon="add" variant="brand" onPress={() => router.push(startHref)} /> : null}
          </View>
        }
        empty={
          <EmptyState
            icon="megaphone-outline"
            title="No brochures yet"
            message="Pick a property, choose a layout and share a post-ready image or an A4 flyer."
            action={<Button title="Create your first brochure" icon="add" onPress={() => router.push(startHref)} />}
          />
        }
        renderItem={({ item }) => {
          const doc = docFromBrochure(item);
          const preset = getFormat(doc.formatKey);
          const template = getTemplate(doc.templateId);
          return (
            <Card
              onPress={() =>
                router.push({ pathname: "/media/new", params: item.propertyId ? { propertyId: item.propertyId, id: item._id } : { id: item._id } })
              }
              style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}
            >
              <BrochureThumb doc={doc} brand={kit} width={72} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
                  {item.title || "Untitled brochure"}
                </Text>
                <Body small muted numberOfLines={1}>
                  {template.name} · {preset.label}
                </Body>
                <Body small muted>
                  Edited {timeAgo(item.updatedAt)}
                </Body>
              </View>
              <Pressable onPress={() => handleDelete(item._id, item.title)} hitSlop={10} accessibilityLabel="Delete brochure">
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </Card>
          );
        }}
      />
      {brochures && brochures.length > 0 ? <Fab label="New brochure" onPress={() => router.push(startHref)} /> : null}
    </>
  );
}
