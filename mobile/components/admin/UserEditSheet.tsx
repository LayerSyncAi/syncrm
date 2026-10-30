/** Edit one user: role, SyncEstate roles, branch, timezone, active status and password reset. */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { ESTATE_ROLES, ESTATE_ROLE_LABELS, type EstateRole } from "../../../convex/lib/modules";
import { TIMEZONES } from "@/lib/timezones";
import { Badge, Body, Button, Card, CheckList, Row, Select, Sheet } from "../ui";
import { confirm, useRun } from "../../lib/useRun";
import { reportSignIn } from "../../lib/admin/signIn";
import { colors, font, space } from "../../lib/theme";

type User = Doc<"users">;
const nameOf = (u: User) => u.fullName || u.name || u.email || "Unknown";

export function UserEditSheet({ user, meId, onClose }: { user: User | null; meId: string | undefined; onClose: () => void }) {
  const setUserActive = useMutation(api.users.adminSetUserActive);
  const setUserRole = useMutation(api.users.adminSetUserRole);
  const setTimezone = useMutation(api.users.adminUpdateUserTimezone);
  const resetPassword = useAction(api.users.adminResetUserPassword);
  const setEstateRoles = useMutation(api.hub.adminSetEstateRoles);
  const setBranch = useMutation(api.users.adminSetUserBranch);
  const branches = useQuery(api.hub.listBranches);
  const { busy, run } = useRun();
  const [draft, setDraft] = useState<EstateRole[]>([]);

  // Seed the roles draft whenever a different user is opened.
  const userId = user?._id;
  useEffect(() => {
    setDraft((user?.estateRoles ?? []) as EstateRole[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!user) return <Sheet open={false} onClose={onClose} title="Edit user">{null}</Sheet>;

  const saved = (user.estateRoles ?? []) as EstateRole[];
  const dirty = draft.length !== saved.length || draft.some((r) => !saved.includes(r));

  return (
    <Sheet open onClose={onClose} title={`Edit ${nameOf(user)}`}>
      {user.email ? <Body muted>{user.email}</Body> : null}

      <Select
        label="Role"
        value={user.role}
        options={[
          { value: "agent", label: "Agent" },
          { value: "admin", label: "Admin" },
        ]}
        onChange={(role) => user.role !== role && run(() => setUserRole({ userId: user._id, role }), { success: role === "admin" ? "Upgraded to Admin." : "Downgraded to Agent." })}
        hint="Admins can manage users, stages, and all settings."
      />

      <View style={{ gap: space.sm }}>
        <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.muted }}>SyncEstate roles</Text>
        {user.role === "admin" ? (
          <Body small muted>Admins open every module and need no roles.</Body>
        ) : (
          <>
            <CheckList options={ESTATE_ROLES.map((r) => ({ value: r, label: ESTATE_ROLE_LABELS[r] }))} value={draft} onChange={setDraft} />
            <Body small muted>
              Roles decide which modules an agent can open. Property manager and Accounts open SyncStay. Valuer, Signing valuer, Valuations admin and Accounts open SyncWorth. Admins open everything.
            </Body>
            <Button title="Save roles" small disabled={busy || !dirty} onPress={() => run(() => setEstateRoles({ userId: user._id, roles: draft }), { success: "SyncEstate roles updated." })} />
          </>
        )}
      </View>

      {branches && branches.length > 0 ? (
        <Select
          label="Branch"
          value={user.branchId ?? ""}
          options={[{ value: "", label: "No branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          onChange={(branchId) =>
            (user.branchId ?? "") !== branchId &&
            run(() => setBranch({ userId: user._id, branchId: branchId || undefined }), { success: "Branch updated." })
          }
        />
      ) : null}

      <Select
        label="Timezone"
        value={user.timezone ?? ""}
        placeholder="Not set"
        options={[{ value: "", label: "Not set" }, ...TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label }))]}
        onChange={(timezone) => run(() => setTimezone({ userId: user._id, timezone }))}
      />

      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>Account status</Text>
          <Badge label={user.isActive ? "Active" : "Inactive"} tone={user.isActive ? "success" : "danger"} />
        </Row>
        <Body small muted>{user.isActive ? "User can sign in and use the app." : "User is blocked from signing in."}</Body>
        <Button
          title={user.isActive ? "Deactivate" : "Activate"}
          variant={user.isActive ? "danger" : "primary"}
          disabled={busy}
          onPress={() => run(() => setUserActive({ userId: user._id, isActive: !user.isActive }), { success: user.isActive ? "User deactivated." : "User activated." })}
        />
      </Card>

      {user._id !== meId && (
        <Card style={{ gap: space.sm }}>
          <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>Reset password</Text>
          <Body small muted>
            {user.resetPasswordOnNextLogin
              ? "A temporary password is pending. Resetting again emails a new one and the old one stops working."
              : "Emails them a new temporary password. They must change it when they next sign in."}
          </Body>
          <Button
            title="Reset password"
            variant="secondary"
            disabled={busy}
            onPress={async () => {
              if (!(await confirm("Reset password?", `${nameOf(user)} is emailed a new temporary password.`, "Reset", true))) return;
              const result = await run(() => resetPassword({ targetUserId: user._id }));
              reportSignIn(result, { name: nameOf(user), email: user.email ?? "" }, "New temporary password emailed.");
            }}
          />
        </Card>
      )}
    </Sheet>
  );
}
