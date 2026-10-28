import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Button, Card, Facts, ListItem, Screen, Section, Select, Toggle, Badge } from "../components/ui";
import { useSession } from "../lib/session";
import { useRun } from "../lib/useRun";
import { ESTATE_ROLE_LABELS } from "../../convex/lib/modules";

const TIMEZONES = ["Africa/Harare", "Africa/Johannesburg", "Africa/Lusaka", "Africa/Windhoek", "Africa/Kinshasa", "Africa/Nairobi", "Europe/London", "UTC"];

export default function Account() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { user, hub } = useSession();
  const setTz = useMutation(api.users.updateMyTimezone);
  const setMode = useMutation(api.users.setMyViewMode);
  const { run } = useRun();
  if (!user) return null;
  const isRealAdmin = user.role === "admin" && !!user.orgId;
  return (
    <Screen>
      <Card>
        <Facts
          items={[
            { label: "Name", value: user.fullName || user.name || "" },
            { label: "Email", value: user.email ?? "" },
            { label: "Agency", value: hub?.orgName ?? "" },
            { label: "Access", value: user.portalKind ? `${user.portalKind === "tenant" ? "Tenant" : "Landlord"} portal` : user.role === "admin" ? "Admin" : "Agent" },
          ]}
        />
        {(user.estateRoles ?? []).length > 0 && (
          <Facts items={[{ label: "Roles", value: (user.estateRoles ?? []).map((r) => ESTATE_ROLE_LABELS[r]).join(", ") }]} />
        )}
      </Card>
      {!user.portalKind && (
        <Section title="Preferences">
          <Card>
            <Select
              label="Time zone"
              value={user.timezone ?? "Africa/Harare"}
              options={TIMEZONES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
              onChange={(timezone) => run(() => setTz({ timezone }))}
              hint="Reminders and the daily agenda use this time zone."
            />
            {isRealAdmin && (
              <Toggle
                label="Agent mode"
                value={!!user.agentMode}
                onChange={(agentMode) => run(() => setMode({ agentMode }))}
                hint="See only your own work, as an agent would. Your permissions do not change."
              />
            )}
          </Card>
        </Section>
      )}
      {user.isPlatformAdmin && <ListItem icon="server-outline" title="Platform" subtitle="Organisations and modules" onPress={() => router.push("/platform")} right={<Badge label="LayerSync" tone="info" />} />}
      <Button
        title="Sign out"
        variant="danger"
        icon="log-out-outline"
        onPress={async () => {
          await signOut();
          router.replace("/sign-in");
        }}
      />
    </Screen>
  );
}
