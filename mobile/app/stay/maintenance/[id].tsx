import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Chips, DateField, EmptyState, Field, Loading, Notice, Row, Screen, Section, Select, Title, Toggle } from "../../../components/ui";
import { PhotoStrip } from "../../../components/stay/ops/photo-strip";
import { dateLabel, money, parseAmount, todayIso } from "../../../lib/format";
import { confirm, useRun } from "../../../lib/useRun";
import { toPhotoItems } from "../../../lib/stay-ops/photos";
import { colors, font, space } from "../../../lib/theme";
import { MAINTENANCE_STATUSES, maintenanceStatusVariant } from "@/lib/stay-ops/labels";

/** One request: status, assignee, photos, cost and landlord approval. */
export default function MaintenanceDetail() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId as Id<"stayMaintenance">;

  const req = useQuery(api.stay.maintenance.get, { id });
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const update = useMutation(api.stay.maintenance.update);
  const setStatus = useMutation(api.stay.maintenance.setStatus);
  const recordCost = useMutation(api.stay.maintenance.recordCost);
  const setApproval = useMutation(api.stay.maintenance.setLandlordApproval);
  const remove = useMutation(api.stay.maintenance.remove);
  const { busy, run } = useRun();

  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ZiG">("USD");
  const [supplier, setSupplier] = useState("");
  const [recharge, setRecharge] = useState(true);
  const [date, setDate] = useState(todayIso());
  const seeded = useRef(false);

  // Fill the cost form once from what is already recorded.
  useEffect(() => {
    if (!req || seeded.current) return;
    seeded.current = true;
    if (req.cost != null) setCost(String(req.cost));
    if (req.currency) setCurrency(req.currency);
    if (req.expense) {
      setSupplier(req.expense.supplier ?? "");
      setRecharge(req.expense.rechargeToLandlord);
      setDate(req.expense.date);
    }
  }, [req]);

  if (req === undefined) return <Loading />;
  if (req === null) return <EmptyState icon="construct-outline" title="Request not found" />;

  const approval = req.landlordApproval;
  const approvalTone = approval?.status === "approved" ? "success" : approval?.status === "declined" ? "danger" : "warning";

  const saveCost = () =>
    run(async () => {
      const amount = parseAmount(cost);
      if (!amount || amount <= 0) throw new Error("Enter a cost above zero.");
      await recordCost({ id, cost: amount, currency, supplier: supplier || undefined, rechargeToLandlord: recharge, date });
    }, { success: req.expenseId ? "Cost updated" : "Cost recorded" });

  return (
    <Screen contentStyle={{ gap: space.lg }}>
      <Stack.Screen options={{ title: "Request" }} />
      <View style={{ gap: space.xs }}>
        <Row>
          <Title style={{ flex: 1 }}>{req.title}</Title>
          <Badge label={req.statusLabel} tone={maintenanceStatusVariant[req.status]} />
        </Row>
        <Body muted small>
          {`${req.propertyTitle}, ${req.unitLabel}${req.tenantName ? `. Tenant: ${req.tenantName}` : ""}. Logged by ${req.raisedByName} on ${dateLabel(req.createdAt)}.`}
        </Body>
      </View>

      <Section title="Status">
        <Card style={{ gap: space.md }}>
          <Row>
            {MAINTENANCE_STATUSES.map((s) => (
              <Button
                key={s.value}
                style={{ flex: 1 }}
                small
                variant={req.status === s.value ? "primary" : "secondary"}
                title={s.label}
                disabled={busy}
                onPress={() => run(() => setStatus({ id, status: s.value }))}
              />
            ))}
          </Row>
          <Body small muted>The tenant is emailed when the status changes.</Body>
          <Select
            label="Assigned to"
            value={req.assigneeUserId ?? ""}
            onChange={(v) => run(() => update({ id, assigneeUserId: v ? (v as Id<"users">) : null }))}
            options={[{ value: "", label: "Unassigned" }, ...(staff ?? []).map((s) => ({ value: s._id as string, label: s.name }))]}
          />
        </Card>
      </Section>

      <Section title="Details">
        <Card style={{ gap: space.md }}>
          <Body>{req.description || "No description."}</Body>
          <PhotoStrip
            photos={toPhotoItems(req.photos, req.photoUrls)}
            onChange={(next) => run(() => update({ id, photos: next.map((p) => p.storageId as Id<"_storage">) }))}
          />
          {req.inspectionId && (
            <Button small variant="ghost" title="Raised from an inspection report" onPress={() => router.push(`/stay/inspections/${req.inspectionId}` as Href)} />
          )}
        </Card>
      </Section>

      <Section title="Cost">
        <Card style={{ gap: space.md }}>
          {req.cost != null && req.currency && (
            <Body>
              {`Recorded: ${money(req.cost, req.currency)}${req.expense?.supplier ? ` to ${req.expense.supplier}` : ""}${
                req.expense ? (req.expense.rechargeToLandlord ? ". Recharged to the landlord." : ". Not recharged.") : ""
              }`}
            </Body>
          )}
          <Field label="Amount" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" />
          <View style={{ gap: space.xs }}>
            <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Currency</Text>
            <Chips<"USD" | "ZiG"> value={currency} onChange={setCurrency} options={[{ value: "USD", label: "USD" }, { value: "ZiG", label: "ZiG" }]} />
          </View>
          <Field label="Supplier" value={supplier} onChangeText={setSupplier} />
          <DateField label="Date" value={date} onChange={setDate} />
          <Toggle label="Recharge to the landlord on their statement" value={recharge} onChange={setRecharge} />
          <Button title={req.expenseId ? "Update cost" : "Record cost"} loading={busy} onPress={saveCost} />
        </Card>
      </Section>

      {approval && (
        <Section title="Landlord approval" right={<Badge label={approval.status === "approved" ? "Approved" : approval.status === "declined" ? "Declined" : "Pending"} tone={approvalTone} />}>
          <Card style={{ gap: space.md }}>
            <Body small muted>
              {`The cost is above the property's repair threshold${req.repairApprovalThreshold != null ? ` of ${req.repairApprovalThreshold}` : ""}. Record the landlord's decision here.`}
            </Body>
            {approval.note ? <Body>{approval.note}</Body> : null}
            <Row>
              <Button style={{ flex: 1 }} title="Mark approved" disabled={busy} onPress={() => run(() => setApproval({ id, status: "approved" }))} />
              <Button style={{ flex: 1 }} variant="secondary" title="Mark declined" disabled={busy} onPress={() => run(() => setApproval({ id, status: "declined" }))} />
            </Row>
          </Card>
        </Section>
      )}

      {req.expenseId ? (
        <Notice>A request with a recorded cost cannot be deleted.</Notice>
      ) : (
        <Button
          variant="danger"
          title="Delete request"
          disabled={busy}
          onPress={async () => {
            if (!(await confirm("Delete request", "Delete this request and its photos?", "Delete", true))) return;
            const ok = await run(async () => {
              await remove({ id });
              return true;
            });
            if (ok) router.back();
          }}
        />
      )}
    </Screen>
  );
}
