/** Tracked PropertyBook agencies (port of .../propertybook/tracked), admins only. */
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Button, Card, EmptyState, List, Loading, Row } from "../../../components/ui";
import { Logo } from "../../../components/crm/records/properties/PbParts";
import { confirm, useRun } from "../../../lib/useRun";
import { dateTimeLabel } from "../../../lib/format";
import { useSession } from "../../../lib/session";
import { colors, space } from "../../../lib/theme";

export default function TrackedAgencies() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const tracked = useQuery(api.propertyBook.listTrackedAgencies, isAdmin ? {} : "skip");
  const untrack = useMutation(api.propertyBook.untrackAgency);
  const { busy, run } = useRun();

  if (!user) return <Loading />;
  if (!isAdmin)
    return (
      <>
        <Stack.Screen options={{ title: "Tracked agencies" }} />
        <EmptyState icon="lock-closed-outline" title="Admins only" />
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: "Tracked agencies" }} />
      <List
        data={tracked}
        keyExtractor={(a) => a._id}
        header={
          <View style={{ gap: space.sm }}>
            <Body muted>These agencies refresh nightly. Price and status changes on propertybook.co.zw flow into listings you imported.</Body>
            <Button small variant="secondary" icon="arrow-back" title="Import more" onPress={() => router.push("/crm/properties/import")} />
          </View>
        }
        empty={<EmptyState icon="radio-outline" title="No agencies tracked yet" message="Import from an agency to start nightly refreshes." />}
        renderItem={({ item: a }) => (
          <Card>
            <Row>
              <Logo url={a.logoUrl} name={a.name} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: "600" }}>{a.name}</Body>
                <Body small muted>
                  {a.slug}
                  {a.lastRefreshAt ? ` · refreshed ${dateTimeLabel(a.lastRefreshAt)}` : ""}
                </Body>
              </View>
              {a.lastRefreshStatus === "error" && <Badge label="Error" tone="danger" />}
              {a.lastRefreshStatus === "ok" && <Badge label="OK" tone="success" />}
            </Row>
            {a.lastRefreshError ? (
              <Body small style={{ color: colors.danger }}>
                {a.lastRefreshError}
              </Body>
            ) : null}
            <Button
              small
              variant="ghost"
              title="Untrack"
              disabled={busy}
              onPress={async () => {
                if (await confirm("Untrack agency", `Stop nightly refreshes for ${a.name}?`, "Untrack", true)) {
                  await run(() => untrack({ id: a._id }), { success: `${a.name} untracked` });
                }
              }}
            />
          </Card>
        )}
      />
    </>
  );
}
