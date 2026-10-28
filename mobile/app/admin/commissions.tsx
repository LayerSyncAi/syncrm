/** Commissions: split scenarios (create, edit, delete) and deal commissions with status changes. */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { COMMISSION_RATE_PERCENT } from "../../../convex/commissionLib";
import { Badge, Body, Button, Card, Chips, EmptyState, Fab, Field, List, Row, Select, Sheet, Toggle } from "../../components/ui";
import { AdminGuard } from "../../components/admin/AdminGuard";
import { CommissionDetails, SplitBar, STATUS_TONE, cap, commissionAmountOf } from "../../components/admin/CommissionParts";
import { SCENARIO_DESCRIPTIONS, SCENARIO_LABELS, type Scenario } from "../../lib/admin/labels";
import { confirm, useRun } from "../../lib/useRun";
import { money } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

type Tab = "configs" | "commissions";
type Form = { name: string; description: string; scenario: Scenario; propertyAgentPercent: string; leadAgentPercent: string; companyPercent: string; isDefault: boolean };
const EMPTY: Form = { name: "", description: "", scenario: "shared_deal", propertyAgentPercent: "40", leadAgentPercent: "40", companyPercent: "20", isDefault: true };
const PAGE_SIZE = 25;

function Configs() {
  const configs = useQuery(api.commissions.listConfigs);
  const create = useMutation(api.commissions.createConfig);
  const update = useMutation(api.commissions.updateConfig);
  const remove = useMutation(api.commissions.deleteConfig);
  const seed = useMutation(api.commissions.seedDefaultConfigs);
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"commissionConfigs"> | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Same as the website: an empty list is seeded with the defaults.
  useEffect(() => {
    if (configs !== undefined && configs.length === 0) seed().catch(() => {});
  }, [configs, seed]);

  const total = (parseFloat(form.propertyAgentPercent) || 0) + (parseFloat(form.leadAgentPercent) || 0) + (parseFloat(form.companyPercent) || 0);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };
  const openEdit = (id: Id<"commissionConfigs">) => {
    const c = configs?.find((x) => x._id === id);
    if (!c) return;
    setEditId(id);
    setForm({ name: c.name, description: c.description ?? "", scenario: c.scenario, propertyAgentPercent: String(c.propertyAgentPercent), leadAgentPercent: String(c.leadAgentPercent), companyPercent: String(c.companyPercent), isDefault: c.isDefault });
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return setError("Config name is required");
    if (Math.abs(total - 100) > 0.01) return setError(`Percentages must sum to 100%. Current total: ${total}%`);
    setError(null);
    const common = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      propertyAgentPercent: parseFloat(form.propertyAgentPercent) || 0,
      leadAgentPercent: parseFloat(form.leadAgentPercent) || 0,
      companyPercent: parseFloat(form.companyPercent) || 0,
      isDefault: form.isDefault,
    };
    const ok = await run(async () => {
      if (editId) await update({ configId: editId, ...common });
      else await create({ scenario: form.scenario, ...common });
      return true;
    });
    if (ok) setOpen(false);
  };

  const del = async (id: Id<"commissionConfigs">, name: string) => {
    if (!(await confirm("Delete scenario", `Delete "${name}"? If any deals have used this config you will not be able to delete it.`, "Delete", true))) return;
    await run(() => remove({ configId: id }));
  };

  return (
    <>
      <List
        data={configs}
        keyExtractor={(c) => c._id}
        empty={<EmptyState icon="cash-outline" title="No commission scenarios configured" />}
        renderItem={({ item: c }) => (
          <Card style={{ gap: space.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{c.name}</Text>
                <Body small muted>{SCENARIO_LABELS[c.scenario]}</Body>
              </View>
              {c.isDefault && <Badge label="Default" tone="success" />}
            </Row>
            {c.description ? <Body small muted>{c.description}</Body> : null}
            <Row style={{ justifyContent: "space-between" }}><Body muted>Property agent (A)</Body><Body>{c.propertyAgentPercent}%</Body></Row>
            <Row style={{ justifyContent: "space-between" }}><Body muted>Lead agent (B)</Body><Body>{c.leadAgentPercent}%</Body></Row>
            <Row style={{ justifyContent: "space-between" }}><Body muted>Company</Body><Body>{c.companyPercent}%</Body></Row>
            <SplitBar a={c.propertyAgentPercent} b={c.leadAgentPercent} c={c.companyPercent} />
            <Row>
              <Button title="Edit" icon="create-outline" small variant="secondary" onPress={() => openEdit(c._id)} />
              <Button title="Delete" icon="trash-outline" small variant="danger" disabled={busy} onPress={() => del(c._id, c.name)} />
            </Row>
          </Card>
        )}
      />
      <Fab label="Add scenario" onPress={openNew} />
      <Sheet open={open} onClose={() => setOpen(false)} title={editId ? "Edit commission scenario" : "New commission scenario"} footer={<Button title={editId ? "Save changes" : "Create scenario"} loading={busy} onPress={submit} />}>
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        <Field label="Name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="e.g. Standard shared deal" />
        {editId ? (
          <Field label="Scenario type" value={SCENARIO_LABELS[form.scenario]} editable={false} hint={SCENARIO_DESCRIPTIONS[form.scenario]} />
        ) : (
          <Select
            label="Scenario type"
            value={form.scenario}
            options={(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => ({ value: s, label: SCENARIO_LABELS[s] }))}
            onChange={(v) => set("scenario", v)}
            hint={SCENARIO_DESCRIPTIONS[form.scenario]}
          />
        )}
        <Field label="Description" value={form.description} onChangeText={(v) => set("description", v)} multiline numberOfLines={2} />
        <Body small muted>Percentages must sum to 100% of the commission ({COMMISSION_RATE_PERCENT}% of the sale value).</Body>
        <Field label="Property agent (A) %" value={form.propertyAgentPercent} onChangeText={(v) => set("propertyAgentPercent", v)} keyboardType="decimal-pad" />
        <Field label="Lead agent (B) %" value={form.leadAgentPercent} onChangeText={(v) => set("leadAgentPercent", v)} keyboardType="decimal-pad" />
        <Field label="Company %" value={form.companyPercent} onChangeText={(v) => set("companyPercent", v)} keyboardType="decimal-pad" />
        <SplitBar a={parseFloat(form.propertyAgentPercent) || 0} b={parseFloat(form.leadAgentPercent) || 0} c={parseFloat(form.companyPercent) || 0} />
        <Text style={{ fontWeight: "600", color: Math.abs(total - 100) > 0.01 ? colors.danger : colors.success }}>Total: {total}%</Text>
        <Toggle label="Set as default for this scenario" value={form.isDefault} onChange={(v) => set("isDefault", v)} />
      </Sheet>
    </>
  );
}

function DealCommissions() {
  const [page, setPage] = useState(0);
  const res = useQuery(api.commissions.listDealCommissions, { page: page > 0 ? page : undefined, pageSize: PAGE_SIZE });
  const [detailId, setDetailId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = res ? ((res as any).items as any[]) : undefined;
  const detail = items?.find((c) => c._id === detailId) ?? null;
  return (
    <>
      <List
        data={items}
        keyExtractor={(c) => c._id}
        empty={<EmptyState icon="cash-outline" title="No deal commissions yet" message="Commissions are generated when deals are won with a deal value." />}
        renderItem={({ item: c }) => {
          const fmt = (n: number) => money(n, c.dealCurrency);
          return (
            <Card onPress={() => setDetailId(c._id)} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{c.leadName}</Text>
                  {c.propertyTitle ? <Body small muted>{c.propertyTitle}</Body> : null}
                </View>
                <Badge label={cap(c.status)} tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE]} />
              </Row>
              <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{fmt(c.dealValue)}</Text>
              <Body small style={{ color: colors.brand }}>Commission ({COMMISSION_RATE_PERCENT}%): {fmt(commissionAmountOf(c))}</Body>
              <Body small muted>{c.contactOwnerName || c.leadAgentName} {c.leadAgentPercent}% · {fmt(c.leadAgentAmount)}</Body>
              {c.propertyAgentName !== "—" && <Body small muted>{c.propertyOwnerName || c.propertyAgentName} {c.propertyAgentPercent}% · {fmt(c.propertyAgentAmount)}</Body>}
              <Body small muted>Company {c.companyPercent}% · {fmt(c.companyAmount)}</Body>
            </Card>
          );
        }}
        ListFooterComponent={
          res && (page > 0 || (res as { hasMore?: boolean }).hasMore) ? (
            <Row style={{ justifyContent: "space-between", paddingTop: space.md }}>
              <Button title="Previous" small variant="secondary" disabled={page === 0} onPress={() => setPage((p) => Math.max(0, p - 1))} />
              <Body muted>Page {page + 1}</Body>
              <Button title="Next" small variant="secondary" disabled={!(res as { hasMore?: boolean }).hasMore} onPress={() => setPage((p) => p + 1)} />
            </Row>
          ) : undefined
        }
      />
      <CommissionDetails commission={detail} onClose={() => setDetailId(null)} />
    </>
  );
}

function Inner() {
  const [tab, setTab] = useState<Tab>("configs");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Chips
          options={[
            { value: "configs", label: "Split scenarios" },
            { value: "commissions", label: "Deal commissions" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "configs" ? <Configs /> : <DealCommissions />}
    </View>
  );
}

export default function CommissionsScreen() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}
