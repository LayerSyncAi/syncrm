import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, EmptyState, List, ListItem, Badge } from "../components/ui";
import { appRoute } from "../lib/routes";
import { timeAgo } from "../lib/format";
import { MODULES } from "../lib/modules";

export default function Notifications() {
  const router = useRouter();
  const list = useQuery(api.notifications.listMine, { limit: 100 });
  const markRead = useMutation(api.notifications.markRead);
  const markAll = useMutation(api.notifications.markAllRead);
  return (
    <List
      data={list}
      keyExtractor={(n) => n._id}
      header={list && list.some((n) => !n.readAt) ? <Button title="Mark all read" variant="secondary" small onPress={() => markAll().catch(() => {})} /> : null}
      empty={<EmptyState icon="notifications-off-outline" title="No notifications" message="Alerts from every module appear here." />}
      renderItem={({ item: n }) => (
        <ListItem
          title={n.title}
          subtitle={n.body}
          meta={`${n.module === "hub" ? "Hub" : MODULES[n.module].name} · ${timeAgo(n.createdAt)}`}
          right={!n.readAt ? <Badge label="New" tone="warning" /> : undefined}
          onPress={() => {
            if (!n.readAt) markRead({ notificationId: n._id }).catch(() => {});
            const to = appRoute(n.href);
            if (to) router.push(to as Href);
          }}
        />
      )}
    />
  );
}
