/**
 * New property (port of /app/properties/new). Documents, owners and sharing
 * need a saved property, so after saving the app opens the new listing where
 * those tabs live.
 */
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button, Screen, Section } from "../../../components/ui";
import { PropertyFields } from "../../../components/crm/records/properties/PropertyFields";
import { AgentPicker, useAgentChoice } from "../../../components/crm/records/properties/AgentPicker";
import { toPayload, usePropertyForm } from "../../../lib/crm/records/properties/form";
import { useSession } from "../../../lib/session";
import { useRun } from "../../../lib/useRun";

export default function NewProperty() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const create = useMutation(api.properties.create);
  const form = usePropertyForm();
  const [owners, setOwners] = useAgentChoice();
  const { busy, run } = useRun();

  const save = async () => {
    if (!form.check()) return;
    const id = await run(() =>
      create({
        ...toPayload(form.values),
        // Agents always own what they create; admins choose. Empty = company.
        ownerUserIds: isAdmin ? (owners.mode === "agents" ? owners.ids : []) : undefined,
      })
    );
    if (id) router.replace(`/crm/properties/${id}` as Href);
  };

  return (
    <>
      <Stack.Screen options={{ title: "New property" }} />
      <Screen>
        <PropertyFields values={form.values} set={form.set} errors={form.errors} />
        {isAdmin && (
          <Section title="Assigned agent">
            <AgentPicker value={owners} onChange={setOwners} />
          </Section>
        )}
        <Button
          title="Save property"
          icon="checkmark"
          onPress={save}
          loading={busy}
          disabled={isAdmin && owners.mode === "agents" && owners.ids.length === 0}
        />
      </Screen>
    </>
  );
}
