/** Roles: switch a user between admin and agent. The last admin cannot demote themselves. */
import { Switch, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Card, EmptyState, List, ListItem, Notice } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";
import { useSession } from "../../lib/session";
import { useRun } from "../../lib/useRun";
import { colors, space } from "../../lib/theme";

function Inner() {
  const { user: me } = useSession();
  const users = useQuery(api.users.adminListUsers);
  const adminCount = useQuery(api.users.getAdminCount);
  const setUserRole = useMutation(api.users.adminSetUserRole);
  const { busy, run } = useRun();

  const change = (userId: Id<"users">, role: "admin" | "agent") => run(() => setUserRole({ userId, role }));

  return (
    <List
      data={users}
      keyExtractor={(u) => u._id}
      header={
        <View style={{ gap: space.sm }}>
          <Body muted>
            {adminCount ?? 0} admin{adminCount === 1 ? "" : "s"}
          </Body>
          <Card style={{ gap: space.xs }}>
            <Body><Body style={{ fontWeight: "700" }}>Admin: </Body>Full access to all features, can manage users and roles</Body>
            <Body><Body style={{ fontWeight: "700" }}>Agent: </Body>Access to leads, contacts, properties, and tasks</Body>
          </Card>
        </View>
      }
      empty={<EmptyState icon="people-outline" title="No users found" />}
      renderItem={({ item: u }) => {
        const isAdmin = u.role === "admin";
        const cannotDemote = isAdmin && adminCount === 1 && u._id === me?._id;
        return (
          <ListItem
            title={`${u.fullName || u.name || "Unknown"}${u._id === me?._id ? " (you)" : ""}`}
            subtitle={u.email || undefined}
            meta={isAdmin ? "Admin" : "Agent"}
            right={
              <View style={{ alignItems: "flex-end", gap: space.xs }}>
                <Badge label={u.isActive ? "Active" : "Inactive"} tone={u.isActive ? "success" : "neutral"} />
                <Switch value={isAdmin} disabled={busy || cannotDemote} onValueChange={(v) => void change(u._id, v ? "admin" : "agent")} trackColor={{ true: colors.success }} />
              </View>
            }
          />
        );
      }}
    />
  );
}

export default function RolesScreen() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}
