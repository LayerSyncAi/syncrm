/**
 * Edit a property (the website's Details and Gallery tabs in the property
 * modal). Admins and the property's agent owners may edit; on the website
 * only admins change the price and currency, so the same applies here.
 */
import { useEffect, useRef } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button, EmptyState, Loading, Notice, Screen } from "../../../../components/ui";
import { PropertyFields } from "../../../../components/crm/records/properties/PropertyFields";
import { formFromProperty, toPayload, usePropertyForm } from "../../../../lib/crm/records/properties/form";
import { useSession } from "../../../../lib/session";
import { useRun } from "../../../../lib/useRun";

export default function EditProperty() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const propertyId = id as Id<"properties">;
  const router = useRouter();
  const { user } = useSession();
  const property = useQuery(api.properties.getById, { propertyId });
  const update = useMutation(api.properties.update);
  const form = usePropertyForm();
  const { busy, run } = useRun();
  const loaded = useRef(false);

  // Fill the form once, so live updates do not overwrite typing.
  useEffect(() => {
    if (property && !loaded.current) {
      loaded.current = true;
      form.setValues(formFromProperty(property));
    }
  }, [property, form]);

  if (property === undefined) return <Loading />;
  if (property === null) return <EmptyState icon="business-outline" title="Property not found" />;

  const save = async () => {
    if (!form.check()) return;
    const ok = await run(async () => {
      await update({ propertyId, ...toPayload(form.values) });
      return true;
    });
    if (ok) router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: "Edit property" }} />
      <Screen>
        {!property.canManage ? (
          <Notice tone="warning">Only admins and the property's assigned agents can edit it.</Notice>
        ) : (
          <>
            <PropertyFields values={form.values} set={form.set} errors={form.errors} canEditPrice={user?.role === "admin"} />
            <Button title="Save changes" icon="checkmark" onPress={save} loading={busy} />
          </>
        )}
      </Screen>
    </>
  );
}
