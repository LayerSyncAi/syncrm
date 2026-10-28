/** Viewing forms: signed proof-of-viewing records, filtered by status and (for admins) agent. */
import { useState } from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Chips, EmptyState, Fab, List, ListItem, Select } from "../../../components/ui";
import { useSession } from "../../../lib/session";
import { dateLabel } from "../../../lib/format";
import { space } from "../../../lib/theme";

type Status = "" | "draft" | "completed";

export default function Viewings() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin" && !user?.agentMode;
  const [status, setStatus] = useState<Status>("");
  const [agent, setAgent] = useState("");
  const agents = useQuery(api.users.listForAssignment, isAdmin ? {} : "skip");
  const forms = useQuery(api.viewingForms.listForOrg, {
    status: status || undefined,
    agentUserId: (agent || undefined) as Id<"users"> | undefined,
  });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Viewings" }} />
      <List
        data={forms}
        keyExtractor={(f) => f._id}
        header={
          <View style={{ gap: space.md }}>
            <Body muted small>
              {isAdmin ? "Signed proof-of-viewing records across the agency." : "Your signed proof-of-viewing records."}
            </Body>
            <Chips<Status>
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "All" },
                { value: "draft", label: "Draft" },
                { value: "completed", label: "Completed" },
              ]}
            />
            {isAdmin && (
              <Select
                label="Agent"
                value={agent}
                onChange={setAgent}
                options={[{ value: "", label: "All agents" }, ...(agents ?? []).map((a) => ({ value: a._id as string, label: a.name }))]}
              />
            )}
          </View>
        }
        empty={<EmptyState icon="create-outline" title="No viewing forms found" message="Create one after showing a client a property to record proof of introduction." />}
        renderItem={({ item: f }) => (
          <ListItem
            icon="create-outline"
            title={f.clientName}
            subtitle={f.propertyAddress}
            meta={`${dateLabel(f.viewingDate)}${f.viewingTime ? ` ${f.viewingTime}` : ""} · ${f.agentName}`}
            right={<Badge label={f.status === "completed" ? "Completed" : "Draft"} tone={f.status === "completed" ? "success" : "warning"} />}
            onPress={() => router.push(`/crm/viewings/${f._id}`)}
          />
        )}
      />
      <Fab label="New viewing form" onPress={() => router.push("/crm/viewings/new")} />
    </View>
  );
}
