"use client";

/**
 * Values, method, calculators, workings and narrative (VW-40..43, VW-52).
 * The report reads these fields; nothing is typed into report text.
 */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { comparisonValue, costValue, incomeValue, roundTo } from "@/lib/worth/calculators";
import { METHOD_LABELS, VALUE_KEYS, VALUE_LABELS, formatArea, formatMoney, formatNumber } from "@/lib/worth/format";
import type { WorthCurrency, WorthMethod, WorthValueKey } from "../../../convex/worth/lib";
import { Checkbox, ErrorNote, Field, Section, numOrUndef, numStr, worthToast } from "./ui";
import type { JobView } from "./job-overview";

type ValueRow = { amount: string; currency: WorthCurrency };
type CostBuilding = { name: string; areaM2: string; rateM2: string };

export function ValuationForm({ job }: { job: JobView }) {
  const save = useMutation(api.worth.valuation.saveValuation);
  const comps = useQuery(api.worth.comparables.listForJob, { jobId: job._id });
  const inspection = useQuery(api.worth.inspections.get, { jobId: job._id });
  const editable = job.canWork && ["new", "assigned", "inspected", "draft"].includes(job.status);
  const ccy = job.currency;

  const [values, setValues] = React.useState<Record<WorthValueKey, ValueRow>>(
    () =>
      Object.fromEntries(
        VALUE_KEYS.map((k) => [k, { amount: numStr(job.values[k]?.amount), currency: job.values[k]?.currency ?? ccy }])
      ) as Record<WorthValueKey, ValueRow>
  );
  const [methods, setMethods] = React.useState<WorthMethod[]>(job.methods);
  const [workings, setWorkings] = React.useState(job.workings);
  const [narrative, setNarrative] = React.useState({
    location: job.narrative.location ?? "",
    description: job.narrative.description ?? "",
    market: job.narrative.market ?? "",
  });
  const [reportForm, setReportForm] = React.useState(job.reportForm);
  const calc = job.calculations;
  const [cmp, setCmp] = React.useState({
    basis: (calc?.comparison?.basis ?? "building") as "building" | "land",
    subjectAreaM2: numStr(calc?.comparison?.subjectAreaM2),
  });
  const [inc, setInc] = React.useState({
    monthlyRent: numStr(calc?.income?.monthlyRent),
    annualOutgoings: numStr(calc?.income?.annualOutgoings),
    yieldPct: numStr(calc?.income?.yieldPct),
  });
  const [cost, setCost] = React.useState({
    landValue: numStr(calc?.cost?.landValue),
    depreciationPct: numStr(calc?.cost?.depreciationPct),
    externalWorks: numStr(calc?.cost?.externalWorks),
    buildings: (calc?.cost?.buildings.map((b) => ({ name: b.name, areaM2: String(b.areaM2), rateM2: String(b.rateM2) })) ?? []) as CostBuilding[],
  });
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const touch = () => setDirty(true);

  // Default the subject area and cost buildings from the inspection once it loads.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || !inspection) return;
    seeded.current = true;
    const building = inspection.buildingAreas.reduce((s, b) => s + b.areaM2, 0);
    if (!cmp.subjectAreaM2) {
      const area = cmp.basis === "land" ? inspection.landSizeM2 : building;
      if (area) setCmp((c) => ({ ...c, subjectAreaM2: String(area) }));
    }
    if (cost.buildings.length === 0 && inspection.buildingAreas.length) {
      setCost((c) => ({
        ...c,
        buildings: inspection.buildingAreas.map((b) => ({ name: b.name, areaM2: String(b.areaM2), rateM2: "" })),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspection]);

  // Calculator results (pure, recomputed on every change).
  const sameCcy = (comps ?? []).filter((c) => c.comparable.currency === ccy && c.comparable.kind !== "rental");
  const cmpResult = comparisonValue(
    sameCcy.map((c) => ({
      price: c.comparable.price,
      landSizeM2: c.comparable.landSizeM2,
      buildingSizeM2: c.comparable.buildingSizeM2,
      adjustmentPct: c.adjustmentPct,
    })),
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
            ? {
                basis: cmp.basis,
                subjectAreaM2: numOrUndef(cmp.subjectAreaM2) ?? 0,
                averageRateM2: cmpResult.averageRateM2,
                result: cmpResult.value,
              }
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
      worthToast.done("Valuation saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!job.caps.seesValues) {
    return <p className="text-sm text-text-muted">Values are visible to the valuation team only.</p>;
  }

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      {job.returnComment && job.status === "draft" && (
        <div className="rounded-[12px] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-fg)]">
          <span className="font-medium">Returned for changes:</span> {job.returnComment}
        </div>
      )}
      <ErrorNote message={error} />

      <fieldset disabled={!editable} className="space-y-4">
        <Section title="Values" description="Record the values this purpose needs. Rental is per month.">
          <div className="space-y-3">
            {VALUE_KEYS.map((k) => (
              <div key={k} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[220px_1fr_auto]">
                <p className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-2.5">{VALUE_LABELS[k]}</p>
                <Input
                  inputMode="decimal"
                  value={values[k].amount}
                  placeholder="Not needed"
                  onChange={(e) => {
                    setValues({ ...values, [k]: { ...values[k], amount: e.target.value } });
                    touch();
                  }}
                />
                <Select
                  className="w-24"
                  value={values[k].currency}
                  onChange={(e) => {
                    setValues({ ...values, [k]: { ...values[k], currency: e.target.value as WorthCurrency } });
                    touch();
                  }}
                >
                  <option value="USD">USD</option>
                  <option value="ZiG">ZiG</option>
                </Select>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(Object.keys(METHOD_LABELS) as WorthMethod[]).map((m) => (
              <Checkbox
                key={m}
                label={`${METHOD_LABELS[m]} method`}
                checked={methods.includes(m)}
                disabled={!editable}
                onChange={(on) => {
                  setMethods(on ? [...methods, m] : methods.filter((x) => x !== m));
                  touch();
                }}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Comparison calculator"
          description={`Average adjusted rate per m² from this job's ${ccy} sale and valuation evidence.`}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Rate basis">
              <Select
                value={cmp.basis}
                onChange={(e) => {
                  setCmp({ ...cmp, basis: e.target.value as "building" | "land" });
                  touch();
                }}
              >
                <option value="building">Building area</option>
                <option value="land">Land area</option>
              </Select>
            </Field>
            <Field label="Subject area (m²)">
              <Input
                inputMode="decimal"
                value={cmp.subjectAreaM2}
                onChange={(e) => {
                  setCmp({ ...cmp, subjectAreaM2: e.target.value });
                  touch();
                }}
              />
            </Field>
            <CalcResult
              text={
                cmpResult
                  ? `${formatMoney(cmpResult.averageRateM2, ccy)}/m² × ${formatArea(numOrUndef(cmp.subjectAreaM2))} = ${formatMoney(cmpResult.value, ccy)}`
                  : sameCcy.length
                    ? "Enter the subject area."
                    : "Add comparables with a price and size on the Evidence tab."
              }
              onUse={cmpResult && editable ? () => applyResult("market", cmpResult.value, "comparison") : undefined}
            />
          </div>
          {cmpResult && (
            <p className="mt-2 text-xs text-text-muted">
              {cmpResult.rates.length} comparable{cmpResult.rates.length === 1 ? "" : "s"} used. Median adjusted rate{" "}
              {formatMoney(cmpResult.medianRateM2, ccy)}/m².
            </p>
          )}
        </Section>

        <Section title="Income calculator" description="Net annual rent capitalised at a chosen yield.">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={`Monthly rent (${ccy})`}>
              <Input inputMode="decimal" value={inc.monthlyRent} onChange={(e) => { setInc({ ...inc, monthlyRent: e.target.value }); touch(); }} />
            </Field>
            <Field label="Annual outgoings">
              <Input inputMode="decimal" value={inc.annualOutgoings} onChange={(e) => { setInc({ ...inc, annualOutgoings: e.target.value }); touch(); }} />
            </Field>
            <Field label="Yield (%)">
              <Input inputMode="decimal" value={inc.yieldPct} onChange={(e) => { setInc({ ...inc, yieldPct: e.target.value }); touch(); }} />
            </Field>
            <CalcResult
              text={
                incResult
                  ? `${formatMoney(incResult.netAnnualRent, ccy)} ÷ ${formatNumber(numOrUndef(inc.yieldPct), 2)}% = ${formatMoney(incResult.value, ccy)}`
                  : "Enter rent and yield."
              }
              onUse={incResult && editable ? () => applyResult("market", incResult.value, "income") : undefined}
            />
          </div>
        </Section>

        <Section title="Cost calculator" description="Land value plus building replacement cost, less depreciation.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Land value (${ccy})`}>
              <Input inputMode="decimal" value={cost.landValue} onChange={(e) => { setCost({ ...cost, landValue: e.target.value }); touch(); }} />
            </Field>
            <Field label="External works">
              <Input inputMode="decimal" value={cost.externalWorks} onChange={(e) => { setCost({ ...cost, externalWorks: e.target.value }); touch(); }} />
            </Field>
            <Field label="Depreciation (%)">
              <Input inputMode="decimal" value={cost.depreciationPct} onChange={(e) => { setCost({ ...cost, depreciationPct: e.target.value }); touch(); }} />
            </Field>
          </div>
          <div className="mt-3 space-y-2">
            {cost.buildings.map((b, i) => {
              const upd = (patch: Partial<CostBuilding>) => {
                setCost({ ...cost, buildings: cost.buildings.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                touch();
              };
              return (
                <div key={i} className="flex items-end gap-2">
                  <Field label={i === 0 ? "Building" : ""} className="flex-1">
                    <Input value={b.name} onChange={(e) => upd({ name: e.target.value })} />
                  </Field>
                  <Field label={i === 0 ? "m²" : ""} className="w-20">
                    <Input inputMode="decimal" value={b.areaM2} onChange={(e) => upd({ areaM2: e.target.value })} />
                  </Field>
                  <Field label={i === 0 ? "Rate/m²" : ""} className="w-24">
                    <Input inputMode="decimal" value={b.rateM2} onChange={(e) => upd({ rateM2: e.target.value })} />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    aria-label="Remove building"
                    onClick={() => {
                      setCost({ ...cost, buildings: cost.buildings.filter((_, j) => j !== i) });
                      touch();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setCost({ ...cost, buildings: [...cost.buildings, { name: "", areaM2: "", rateM2: "" }] })}
            >
              <Plus className="h-4 w-4" />
              Add building
            </Button>
          </div>
          <div className="mt-3">
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
                      job.purpose === "insurance"
                        ? applyResult("insurance", costResult.replacementCost, "cost")
                        : applyResult("market", costResult.value, "cost")
                  : undefined
              }
            />
          </div>
        </Section>

        <Section title="Workings" description="Shown in the report under Valuation and workings.">
          <Textarea rows={5} value={workings} onChange={(e) => { setWorkings(e.target.value); touch(); }} placeholder="How the evidence and calculators support the values" />
        </Section>

        <Section title="Report narrative" description="Edit before submitting for review.">
          <div className="space-y-3">
            <Field label="Location">
              <Textarea rows={4} value={narrative.location} onChange={(e) => { setNarrative({ ...narrative, location: e.target.value }); touch(); }} />
            </Field>
            <Field label="Property description">
              <Textarea rows={4} value={narrative.description} onChange={(e) => { setNarrative({ ...narrative, description: e.target.value }); touch(); }} />
            </Field>
            <Field label="Market commentary" hint="Left out of the short-form report.">
              <Textarea rows={4} value={narrative.market} onChange={(e) => { setNarrative({ ...narrative, market: e.target.value }); touch(); }} />
            </Field>
            <Field label="Report form">
              <Select value={reportForm} onChange={(e) => { setReportForm(e.target.value as "standard" | "short"); touch(); }}>
                <option value="standard">Standard report</option>
                <option value="short">Short form (simple residential)</option>
              </Select>
            </Field>
          </div>
        </Section>
      </fieldset>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-card-bg/95 p-3 backdrop-blur md:static md:z-auto md:justify-end md:border-0 md:bg-transparent md:p-0">
          {dirty && <span className="text-xs text-text-muted">Unsaved changes</span>}
          <Button className="flex-1 md:flex-none" onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save valuation"}
          </Button>
        </div>
      )}
    </div>
  );
}

function CalcResult({ text, onUse }: { text: string; onUse?: () => void }) {
  return (
    <div className="flex flex-col justify-end gap-1.5 sm:col-span-1">
      <p className="text-sm">{text}</p>
      {onUse && (
        <Button type="button" size="sm" variant="secondary" onClick={onUse} className="self-start">
          Use, rounded to nearest 1,000
        </Button>
      )}
    </div>
  );
}
