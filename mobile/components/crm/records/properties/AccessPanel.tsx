/**
 * Which agents may see a property's private data: the agent owner(s) and any
 * collaborators. Port of the web PropertyAccess panel. Admins reassign
 * ownership; admins and owners manage collaborators.
 */
import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Body, Button, Card, ListItem, Loading, Section, Select, Sheet } from "../../../ui";
import { confirm, useRun } from "../../../../lib/useRun";
import { space } from "../../../../lib/theme";
import { agentOwnerSummary } from "../../../../lib/crm/records/properties/labels";
import { AgentPicker, type AgentChoice } from "./AgentPicker";

export function AccessPanel({
  propertyId,
  canManage,
  isAdmin,
  ownershipType,
  ownerUserIds = [],
  ownerNames = [],
}: {
  propertyId: Id<"properties">;
  canManage: boolean;
  isAdmin: boolean;
  ownershipType?: "agent" | "multiple" | "company";
  ownerUserIds?: Id<"users">[];
  ownerNames?: string[];
}) {
  const agents = useQuery(api.users.listForAssignment) ?? [];
  const collaborators = useQuery(api.properties.listCollaborators, { propertyId });
  const add = useMutation(api.properties.addCollaborator);
  const remove = useMutation(api.properties.removeCollaborator);
  const reassign = useMutation(api.properties.reassignOwnership);
  const { busy, run } = useRun();
  const [agent, setAgent] = useState<string>("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [choice, setChoice] = useState<AgentChoice>({ mode: "company", ids: [] });

  const taken = new Set<string>([...ownerUserIds, ...(collaborators ?? []).map((c) => c.agentId)]);
  const eligible = agents.filter((a) => !taken.has(a._id));

  const openReassign = () => {
    setChoice({ mode: ownershipType === "company" || !ownershipType ? "company" : "agents", ids: ownerUserIds });
    setReassignOpen(true);
  };

  return (
    <View style={{ gap: space.lg }}>
      <Section title="Agent ownership" right={isAdmin ? <Button small variant="ghost" title="Reassign" onPress={openReassign} /> : undefined}>
        <Card>
          <Body>{agentOwnerSummary(ownershipType, ownerNames)}</Body>
        </Card>
      </Section>

      <Section title="Collaborators">
        <Body small muted>Collaborators can see this property's documents and mandate without owning it.</Body>
        {collaborators === undefined ? (
          <Loading />
        ) : collaborators.length === 0 ? (
          <Body small muted>No collaborators yet.</Body>
        ) : (
          collaborators.map((c) => (
            <ListItem
              key={c._id}
              icon="person-outline"
              title={c.agentName}
              subtitle={`Granted by ${c.grantedByName}`}
              right={
                canManage ? (
                  <Button
                    small
                    variant="danger"
                    title="Remove"
                    disabled={busy}
                    onPress={async () => {
                      if (await confirm("Remove collaborator", `${c.agentName} will lose access to this property's private data.`, "Remove", true)) {
                        await run(() => remove({ propertyId, agentId: c.agentId }), { success: "Collaborator removed" });
                      }
                    }}
                  />
                ) : undefined
              }
            />
          ))
        )}
        {canManage && (
          <>
            <Select label="Add collaborator" value={agent} options={eligible.map((a) => ({ value: a._id as string, label: a.name }))} onChange={setAgent} placeholder="Choose an agent" />
            <Button
              variant="secondary"
              icon="person-add-outline"
              title="Add collaborator"
              disabled={!agent}
              loading={busy}
              onPress={async () => {
                const ok = await run(async () => {
                  await add({ propertyId, agentId: agent as Id<"users"> });
                  return true;
                });
                if (ok) setAgent("");
              }}
            />
          </>
        )}
      </Section>

      <Sheet
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Reassign ownership"
        footer={
          <Button
            title="Save"
            loading={busy}
            disabled={choice.mode === "agents" && choice.ids.length === 0}
            onPress={async () => {
              const ok = await run(async () => {
                await reassign({ propertyId, ownerUserIds: choice.mode === "company" ? [] : choice.ids });
                return true;
              });
              if (ok) setReassignOpen(false);
            }}
          />
        }
      >
        <AgentPicker value={choice} onChange={setChoice} />
      </Sheet>
    </View>
  );
}
