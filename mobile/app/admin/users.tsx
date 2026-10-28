/** Users: list, create, and edit role, Sync Estate roles, timezone, status and password. */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ESTATE_ROLE_LABELS, type EstateRole } from "../../../convex/lib/modules";
import { Badge, Body, Button, EmptyState, Fab, Field, List, ListItem, SearchBar, Select, Sheet, Toggle } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";
import { UserEditSheet } from "../../components/admin/UserEditSheet";
import { useSession } from "../../lib/session";
import { useRun } from "../../lib/useRun";
import { space } from "../../lib/theme";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function Inner() {
  const { user: me } = useSession();
  const users = useQuery(api.users.adminListUsers);
  const createUser = useAction(api.users.adminCreateUser);
  const { busy, run } = useRun();
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<Id<"users"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!users) return undefined;
    const q = search.trim().toLowerCase();
    return [...users]
      .filter((u) => !q || `${u.fullName ?? ""} ${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return (a.fullName || a.name || a.email || "").localeCompare(b.fullName || b.name || b.email || "");
      });
  }, [users, search]);

  const editing = users?.find((u) => u._id === editId) ?? null;

  const create = async () => {
    if (!fullName.trim()) return setError("Full name is required");
    if (!email.trim()) return setError("Email is required");
    if (!validEmail(email.trim())) return setError("Please enter a valid email address");
    setError(null);
    const ok = await run(
      async () => {
        await createUser({ fullName: fullName.trim(), email: email.trim().toLowerCase(), role, isActive });
        return true;
      },
      { success: `User created for ${fullName.trim()}. They must change their password on first login.` }
    );
    if (ok) {
      setCreating(false);
      setFullName("");
      setEmail("");
      setRole("agent");
      setIsActive(true);
    }
  };

  return (
    <>
      <List
        data={sorted}
        keyExtractor={(u) => u._id}
        header={<SearchBar value={search} onChangeText={setSearch} placeholder="Search users" />}
        empty={<EmptyState icon="people-outline" title="No users found" />}
        renderItem={({ item: u }) => {
          const roles = (u.estateRoles ?? []) as EstateRole[];
          return (
            <ListItem
              title={`${u.fullName || u.name || "Unknown"}${u._id === me?._id ? " (you)" : ""}`}
              subtitle={`${u.role === "admin" ? "Admin" : "Agent"}${u.email ? ` · ${u.email}` : ""}${
                u.role === "admin" ? " · All modules" : roles.length ? ` · ${roles.map((r) => ESTATE_ROLE_LABELS[r]).join(", ")}` : " · No roles"
              }`}
              right={
                <View style={{ alignItems: "flex-end", gap: space.xs }}>
                  <Badge label={u.isActive ? "Active" : "Inactive"} tone={u.isActive ? "success" : "neutral"} />
                  {u.resetPasswordOnNextLogin ? <Badge label="Reset pending" tone="warning" /> : null}
                </View>
              }
              onPress={() => setEditId(u._id)}
            />
          );
        }}
      />
      <Fab label="Create user" icon="person-add" onPress={() => setCreating(true)} />
      <UserEditSheet user={editing} meId={me?._id} onClose={() => setEditId(null)} />
      <Sheet open={creating} onClose={() => setCreating(false)} title="Create user" footer={<Button title="Create user" loading={busy} onPress={create} />}>
        {error ? <Body style={{ color: "#dc2626" }}>{error}</Body> : null}
        <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="John Doe" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="john@agency.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          hint="This email will be used for login. A temporary password will be assigned."
        />
        <Select
          label="Role"
          value={role}
          options={[
            { value: "agent", label: "Agent" },
            { value: "admin", label: "Admin" },
          ]}
          onChange={setRole}
          hint="Admins can manage users, stages, and all settings"
        />
        <Toggle label="Active" hint="Inactive users cannot log in" value={isActive} onChange={setIsActive} />
      </Sheet>
    </>
  );
}

export default function UsersScreen() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}
