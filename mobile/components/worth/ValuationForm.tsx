/**
 * Values, method, calculators, workings and narrative (VW-40..43, VW-52).
 * The report reads these fields; nothing is typed into report text.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { comparisonValue, costValue, incomeValue, roundTo } from "@/lib/worth/calculators";
import { api } from "../../../convex/_generated/api";
import type { WorthCurrency, WorthMethod, WorthValueKey } from "../../../convex/worth/lib";
import { Body, Button, CheckList, Field, Ionicons, Notice, Row, Select } from "../ui";
import { colors, font, radius, space } from "../../lib/theme";
import {
  CURRENCY_OPTIONS,
  METHOD_LABELS,
  VALUE_KEYS,
  VALUE_LABELS,
  formatArea,
  formatMoney,
  formatNumber,
  isEditableStatus,
  numOrUndef,
  numStr,
  type JobView,
} from "../../lib/worth/util";
import { ErrorNote, Pair, Panel } from "./bits";

type ValueRow = { amount: string; currency: WorthCurrency };
type CostBuilding = { name: string; areaM2: string; rateM2: string };

/** A calculator's working and the button to use its result. */
function CalcResult({ text, onUse }: { text: string; onUse?: () => void }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
      <Text style={{ fontSize: font.sm, color: colors.text, lineHeight: 19 }}>{text}</Text>
      {onUse && <Button small variant="secondary" title="Use, rounded to nearest 1,000" onPress={onUse} />}
    </View>
  );
}

export function ValuationForm({ job }: { job: JobView }) {
  const save = useMutation(api.worth.valuation.saveValuation);
  const comps = useQuery(api.worth.comparables.listForJob, { jobId: job._id });
  const inspection = useQuery(api.worth.inspections.get, { jobId: job._id });
  const editable = job.canWork && isEditableStatus(job.status);
  const ccy = job.currency;
  const calc = job.calculations;

  const [values, setValues] = useState<Record<WorthValueKey, ValueRow>>(
    () => Object.fromEntries(VALUE_KEYS.map((k) => [k, { amount: numStr(job.values[k]?.amount), currency: job.values[k]?.currency ?? ccy }])) as Record<WorthValueKey, ValueRow>
  );
  const [methods, setMethods] = useState<WorthMethod[]>(job.methods);
  const [workings, setWorkings] = useState(job.workings);
  const [narrative, setNarrative] = useState({
    location: job.narrative.location ?? "",
    description: job.narrative.description ?? "",
    market: job.narrative.market ?? "",
  });
  const [reportForm, setReportForm] = useState(job.reportForm);
  const [cmp, setCmp] = useState({
    basis: (calc?.comparison?.basis ?? "building") as "building" | "land",
    subjectAreaM2: numStr(calc?.comparison?.subjectAreaM2),
  });
  const [inc, setInc] = useState({
    monthlyRent: numStr(calc?.income?.monthlyRent),
    annualOutgoings: numStr(calc?.income?.annualOutgoings),
    yieldPct: numStr(calc?.income?.yieldPct),
  });
  const [cost, setCost] = useState({
    landValue: numStr(calc?.cost?.landValue),
    depreciationPct: numStr(calc?.cost?.depreciationPct),
    externalWorks: numStr(calc?.cost?.externalWorks),
    buildings: (calc?.cost?.buildings.map((b) => ({ name: b.name, areaM2: String(b.areaM2), rateM2: String(b.rateM2) })) ?? []) as CostBuilding[],
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = () => setDirty(true);

  // Default the subject area and cost buildings from the inspection once it loads.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !inspection) return;
    seeded.current = true;
    const building = inspection.buildingAreas.reduce((s, b) => s + b.areaM2, 0);
    if (!cmp.subjectAreaM2) {
      const area = cmp.basis === "land" ? inspection.landSizeM2 : building;
      if (area) setCmp((c) => ({ ...c, subjectAreaM2: String(area) }));
    }
    if (cost.buildings.length === 0 && inspection.buildingAreas.length) {
      setCost((c) => ({ ...c, buildings: inspection.buildingAreas.map((b) => ({ name: b.name, areaM2: String(b.areaM2), rateM2: "" })) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspection]);

  if (!job.caps.seesValues) return <Body muted>Values are visible to the valuation team only.</Body>;

  // Calculator results (pure, recomputed on every change).
  const sameCcy = (comps ?? []).filter((c) => c.comparable.currency === ccy && c.comparable.kind !== "rental");
  const cmpResult = comparisonValue(
    sameCcy.map((c) => ({ price: c.comparable.price, landSizeM2: c.comparable.landSizeM2, buildingSizeM2: c.comparable.buildingSizeM2, adjustmentPct: c.adjustmentPct })),
    numOrUndef(cmp.subjectAreaM2) ?? 0,
    cmp.basis
  );
  const incResult = incomeValue(numOrUndef(inc.monthlyRent) ?? 0, numOrUndef(inc.annualOutgoings) ?? 0, numOrUndef(inc.yieldPct) ?? 0);
  const costBuildings = cost.buildings.map((b) => ({ name: b.name, areaM2: numOrUndef(b.areaM2) ?? 0, rateM2: numOrUndef(b.rateM2) ?? 0 }));
  const costReady = costBuildings.some((b) => b.areaM2 > 0 && b.rateM2 > 0) || (numOrUndef(cost.landValue) ?? 0) > 0;
  const costResult = costReady
    ? costValue({
        landValue: numOrUndef(cost.landValue) ?? 0,
        buildings: costBuildings,
        depreciationPct: numOrUndef(cost.depreciationPct) ?? 0,
        externalWorks: numOrUndef(cost.externalWorks) ?? 0,
      })
    : null;

  const applyResult = (key: WorthValueKey, amount: number, method: WorthMethod) => {
    setValues((v) => ({ ...v, [key]: { amount: String(roundTo(amount, 1000)), currency: ccy } }));
    if (!methods.includes(method)) setMethods([...methods, method]);
    touch();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const vals: Partial<Record<WorthValueKey, { amount: number; currency: WorthCurrency }>> = {};
    for (const k of VALUE_KEYS) {
      const n = numOrUndef(values[k].amount);
      if (n !== undefined && n > 0) vals[k] = { amount: n, currency: values[k].currency };
    }
    try {
      await save({
        jobId: job._id,
        values: vals,
        methods,
        workings,
        narrative,
        reportForm,
        calculations: {
          comparison: cmpResult
            ? { basis: cmp.basis, subjectAreaM2: numOrUndef(cmp.subjectAreaM2) ?? 0, averageRateM2: cmpResult.averageRateM2, result: cmpResult.value }
            : undefined,
          income: incResult
            ? {
                monthlyRent: numOrUndef(inc.monthlyRent) ?? 0,
                annualOutgoings: numOrUndef(inc.annualOutgoings) ?? 0,
                yieldPct: numOrUndef(inc.yieldPct) ?? 0,
                result: incResult.value,
              }
            : undefined,
          cost: costResult
            ? {
                landValue: numOrUndef(cost.landValue) ?? 0,
                buildings: costBuildings.filter((b) => b.areaM2 > 0),
                depreciationPct: numOrUndef(cost.depreciationPct) ?? 0,
                externalWorks: numOrUndef(cost.externalWorks) ?? 0,
                result: costResult.value,
              }
            : undefined,
        },
      });
      setDirty(false);
      Alert.alert("Valuation saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const num = { keyboardType: "decimal-pad" as const, editable };

  return (
    <View style={{ gap: space.lg }}>
      {job.returnComment && job.status === "draft" ? <Notice tone="warning">Returned for changes: {job.returnComment}</Notice> : null}
      <ErrorNote message={error} />

      <View pointerEvents={editable ? "auto" : "none"} style={{ gap: space.lg }}>
        <Panel title="Values" description="Record the values this purpose needs. Rental is per month.">
          {VALUE_KEYS.map((k) => (
            <Row key={k} style={{ alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={VALUE_LABELS[k]}
                  value={values[k].amount}
                  placeholder="Not needed"
                  {...num}
                  onChangeText={(t) => {
                    setValues({ ...values, [k]: { ...values[k], amount: t } });
                    touch();
                  }}
                />
              </View>
              <View style={{ width: 96 }}>
                <Select
                  label=" "
                  value={values[k].currency}
                  options={CURRENCY_OPTIONS}
                  onChange={(c) => {
                    setValues({ ...values, [k]: { ...values[k], currency: c } });
                    touch();
                  }}
                />
              </View>
            </Row>
          ))}
          <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Method</Text>
          <CheckList
            options={(Object.keys(METHOD_LABELS) as WorthMethod[]).map((m) => ({ value: m, label: `${METHOD_LABELS[m]} method` }))}
            value={methods}
            onChange={(v) => {
              setMethods(v);
              touch();
            }}
          />
        </Panel>

        <Panel title="Comparison calculator" description={`Average adjusted rate per m² from this job's ${ccy} sale and valuation evidence.`}>
          <Pair>
            <Select
              label="Rate basis"
              value={cmp.basis}
              options={[
                { value: "building", label: "Building area" },
                { value: "land", label: "Land area" },
              ]}
              onChange={(v) => {
                setCmp({ ...cmp, basis: v });
                touch();
              }}
            />
            <Field
              label="Subject area (m²)"
              value={cmp.subjectAreaM2}
              {...num}
              onChangeText={(t) => {
                setCmp({ ...cmp, subjectAreaM2: t });
                touch();
              }}
            />
          </Pair>
          <CalcResult
            text={
              cmpResult
                ? `${formatMoney(cmpResult.averageRateM2, ccy)}/m² × ${formatArea(numOrUndef(cmp.subjectAreaM2))} = ${formatMoney(cmpResult.value, ccy)}\n${cmpResult.rates.length} comparable${cmpResult.rates.length === 1 ? "" : "s"} used. Median adjusted rate ${formatMoney(cmpResult.medianRateM2, ccy)}/m².`
                : sameCcy.length
                  ? "Enter the subject area."
                  : "Add comparables with a price and size under Evidence."
            }
            onUse={cmpResult && editable ? () => applyResult("market", cmpResult.value, "comparison") : undefined}
          />
        </Panel>

        <Panel title="Income calculator" description="Net annual rent capitalised at a chosen yield.">
          <Field label={`Monthly rent (${ccy})`} value={inc.monthlyRent} {...num} onChangeText={(t) => { setInc({ ...inc, monthlyRent: t }); touch(); }} />
          <Pair>
            <Field label="Annual outgoings" value={inc.annualOutgoings} {...num} onChangeText={(t) => { setInc({ ...inc, annualOutgoings: t }); touch(); }} />
            <Field label="Yield (%)" value={inc.yieldPct} {...num} onChangeText={(t) => { setInc({ ...inc, yieldPct: t }); touch(); }} />
          </Pair>
          <CalcResult
            text={
              incResult
                ? `${formatMoney(incResult.netAnnualRent, ccy)} ÷ ${formatNumber(numOrUndef(inc.yieldPct), 2)}% = ${formatMoney(incResult.value, ccy)}`
                : "Enter rent and yield."
            }
            onUse={incResult && editable ? () => applyResult("market", incResult.value, "income") : undefined}
          />
        </Panel>

        <Panel title="Cost calculator" description="Land value plus building replacement cost, less depreciation.">
          <Field label={`Land value (${ccy})`} value={cost.landValue} {...num} onChangeText={(t) => { setCost({ ...cost, landValue: t }); touch(); }} />
          <Pair>
            <Field label="External works" value={cost.externalWorks} {...num} onChangeText={(t) => { setCost({ ...cost, externalWorks: t }); touch(); }} />
            <Field label="Depreciation (%)" value={cost.depreciationPct} {...num} onChangeText={(t) => { setCost({ ...cost, depreciationPct: t }); touch(); }} />
          </Pair>
          {cost.buildings.map((b, i) => {
            const upd = (patch: Partial<CostBuilding>) => {
              setCost({ ...cost, buildings: cost.buildings.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              touch();
            };
            return (
              <View key={i} style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
                <Row style={{ alignItems: "flex-end" }}>
                  <View style={{ flex: 1 }}>
                    <Field label="Building" value={b.name} editable={editable} onChangeText={(t) => upd({ name: t })} />
                  </View>
                  {editable && (
                    <Pressable
                      accessibilityLabel="Remove building"
                      hitSlop={8}
                      style={{ paddingBottom: 14 }}
                      onPress={() => {
                        setCost({ ...cost, buildings: cost.buildings.filter((_, j) => j !== i) });
                        touch();
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </Pressable>
                  )}
                </Row>
                <Pair>
                  <Field label="Area (m²)" value={b.areaM2} {...num} onChangeText={(t) => upd({ areaM2: t })} />
                  <Field label="Rate per m²" value={b.rateM2} {...num} onChangeText={(t) => upd({ rateM2: t })} />
                </Pair>
              </View>
            );
          })}
          {editable && (
            <Button small variant="secondary" icon="add" title="Add building" onPress={() => setCost({ ...cost, buildings: [...cost.buildings, { name: "", areaM2: "", rateM2: "" }] })} />
          )}
          <CalcResult
            text={
              costResult
                ? `Replacement ${formatMoney(costResult.replacementCost, ccy)} less ${formatMoney(costResult.depreciation, ccy)} plus land = ${formatMoney(costResult.value, ccy)}`
                : "Enter land value or building rates."
            }
            onUse={
              costResult && editable
                ? () =>
                    // Insurance cover is the replacement cost of the buildings, without land.
                    job.purpose === "insurance" ? applyResult("insurance", costResult.replacementCost, "cost") : applyResult("market", costResult.value, "cost")
                : undefined
            }
          />
        </Panel>

        <Panel title="Workings" description="Shown in the report under Valuation and workings.">
          <Field label="Workings" value={workings} editable={editable} multiline placeholder="How the evidence and calculators support the values" onChangeText={(t) => { setWorkings(t); touch(); }} />
        </Panel>

        <Panel title="Report narrative" description="Edit before submitting for review.">
          <Field label="Location" value={narrative.location} editable={editable} multiline onChangeText={(t) => { setNarrative({ ...narrative, location: t }); touch(); }} />
          <Field label="Property description" value={narrative.description} editable={editable} multiline onChangeText={(t) => { setNarrative({ ...narrative, description: t }); touch(); }} />
          <Field
            label="Market commentary"
            hint="Left out of the short-form report."
            value={narrative.market}
            editable={editable}
            multiline
            onChangeText={(t) => { setNarrative({ ...narrative, market: t }); touch(); }}
          />
          <Select
            label="Report form"
            value={reportForm}
            options={[
              { value: "standard", label: "Standard report" },
              { value: "short", label: "Short form (simple residential)" },
            ]}
            onChange={(v) => {
              setReportForm(v);
              touch();
            }}
          />
        </Panel>
      </View>

      {editable && (
        <View style={{ gap: space.xs }}>
          {dirty && <Body small muted>Unsaved changes</Body>}
          <Button title="Save valuation" loading={busy} onPress={submit} />
        </View>
      )}
    </View>
  );
}
