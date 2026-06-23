"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { addToCurrencyMap } from "../../../convex/reportingLib";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrency } from "@/lib/currency";
import { MARKETING_CHANNEL_OPTIONS, marketingChannelLabel } from "@/lib/marketing-channels";

/** Convert a date-input value (yyyy-MM-dd) to a midday-local timestamp. */
function dateToTs(date: string): number {
  return new Date(`${date}T12:00:00`).getTime();
}

/** Convert a stored timestamp to a yyyy-MM-dd value for a date input. */
function tsToDate(ts: number | undefined): string {
  return typeof ts === "number" ? format(new Date(ts), "yyyy-MM-dd") : "";
}

export function PropertyMarketingTab({
  propertyId,
  listedOnMarketAt,
  canEdit,
  isAdmin,
}: {
  propertyId: Id<"properties">;
  listedOnMarketAt: number | undefined;
  /** True when the user (admin or property creator) may set the listing date. */
  canEdit: boolean;
  /** Marketing spend create/delete is admin-only (enforced server-side too). */
  isAdmin: boolean;
}) {
  const expenses = useQuery(api.marketing.listExpenses, { propertyId });
  const updateProperty = useMutation(api.properties.update);
  const createExpense = useMutation(api.marketing.createExpense);
  const deleteExpense = useMutation(api.marketing.deleteExpense);

  const [listedDate, setListedDate] = useState(() => tsToDate(listedOnMarketAt));
  const [savingDate, setSavingDate] = useState(false);

  const [channel, setChannel] = useState<string>("facebook");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [spendDate, setSpendDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSaveDate = async () => {
    setSavingDate(true);
    setError(null);
    try {
      await updateProperty({
        propertyId,
        // null clears the field; a number sets it.
        listedOnMarketAt: listedDate ? dateToTs(listedDate) : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save listing date");
    } finally {
      setSavingDate(false);
    }
  };

  const handleAddSpend = async () => {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount greater than 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createExpense({
        propertyId,
        channel,
        amount: parsed,
        currency,
        spentAt: dateToTs(spendDate),
        note: note.trim() || undefined,
      });
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log spend");
    } finally {
      setSubmitting(false);
    }
  };

  // Per-currency total, reusing the shared currency-accumulation helper so the
  // formatting matches the reports' formatCurrencyMap (blank currency -> USD,
  // zero entries dropped). Memoized so it recomputes only when expenses change,
  // not on every keystroke in the form inputs.
  const totalText = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses ?? []) addToCurrencyMap(map, e.currency, e.amount);
    const entries = Object.entries(map).filter(([, v]) => v !== 0);
    if (entries.length === 0) return formatCurrency(0, "USD");
    return entries.map(([c, v]) => formatCurrency(v, c)).join(" + ");
  }, [expenses]);

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {/* Date listed on market */}
      <div className="space-y-2">
        <Label>Date listed on market</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={listedDate}
            onChange={(e) => setListedDate(e.target.value)}
            disabled={!canEdit}
            className="w-[200px]"
          />
          {canEdit ? (
            <Button variant="secondary" onClick={handleSaveDate} disabled={savingDate}>
              {savingDate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save date
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-text-dim">
          When this property first went on the market. Used for days-on-market and
          marketing reports.
        </p>
      </div>

      {/* Add marketing spend (admin only) */}
      {isAdmin ? (
        <div className="space-y-4 border-t border-border pt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Log marketing spend
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Channel</Label>
              <StaggeredDropDown
                value={channel}
                onChange={setChannel}
                options={MARKETING_CHANNEL_OPTIONS}
                portal
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={spendDate}
                onChange={(e) => setSpendDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                currency={currency}
                onCurrencyChange={setCurrency}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g. Boosted post"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAddSpend} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add spend
            </Button>
          </div>
        </div>
      ) : null}

      {/* Spend history */}
      <div className="space-y-2 border-t border-border pt-5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Marketing history
          </h4>
          <span className="text-sm font-medium">{totalText}</span>
        </div>
        {expenses === undefined ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-text-muted">No marketing spend logged for this property yet.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {expenses.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-row-hover"
              >
                <div className="min-w-0">
                  <span className="font-medium">{formatCurrency(e.amount, e.currency)}</span>{" "}
                  <span className="text-text-muted">· {marketingChannelLabel(e.channel)}</span>
                  {e.note ? <span className="text-text-dim"> · {e.note}</span> : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-text-dim">
                  <span>{format(new Date(e.spentAt), "MMM d, yyyy")}</span>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => deleteExpense({ expenseId: e._id })}
                      className="text-red-500 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
