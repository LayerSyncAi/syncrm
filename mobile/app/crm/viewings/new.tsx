/**
 * New viewing form. Other screens can prefill it through the route, e.g.
 * /crm/viewings/new?leadId=...&propertyId=...&propertyAddress=...&clientName=...
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Screen } from "../../../components/ui";
import { ViewingForm } from "../../../components/crm/records/viewings/ViewingForm";

type Params = {
  propertyId?: string;
  contactId?: string;
  leadId?: string;
  propertyAddress?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  agentUserId?: string;
};

export default function NewViewing() {
  const router = useRouter();
  const p = useLocalSearchParams<Params>();
  return (
    <Screen>
      <Stack.Screen options={{ title: "New viewing form" }} />
      <ViewingForm
        prefill={{
          propertyId: p.propertyId as Id<"properties"> | undefined,
          contactId: p.contactId as Id<"contacts"> | undefined,
          leadId: p.leadId as Id<"leads"> | undefined,
          propertyAddress: p.propertyAddress,
          clientName: p.clientName,
          clientPhone: p.clientPhone,
          clientEmail: p.clientEmail,
          agentUserId: p.agentUserId as Id<"users"> | undefined,
        }}
        onSaved={(id) => router.replace(`/crm/viewings/${id}`)}
        onCancel={() => router.back()}
      />
    </Screen>
  );
}
