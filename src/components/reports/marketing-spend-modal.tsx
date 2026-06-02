"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { CurrencyInput } from "@/components/ui/currency-input";
import { LEAD_SOURCE_OPTIONS } from "@/lib/lead-sources";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

interface PropertyOption {
  _id: Id<"properties">;
  title: string;
}

export function MarketingSpendModal({
  open,
  onClose,
  properties,
}: {
  open: boolean;
  onClose: () => void;
  properties: PropertyOption[];
}) {
  const expenses = useQuery(api.marketing.listExpenses, open ? {} : "skip");
  const createExpense = useMutation(api.marketing.createExpense);
  const deleteExpense = useMutation(api.marketing.deleteExpense);

  const [channel, setChannel] = useState<string>("facebook");
  const [propertyId, setPropertyId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount greater than 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Record spend at midday local time on the chosen date.
      const spentAt = new Date(`${date}T12:00:00`).getTime();
      await createExpense({
        channel,
        propertyId: propertyId ? (propertyId as Id<"properties">) : undefined,
        amount: parsed,
        currency,
        spentAt,
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

  const propertyOptions = [
    { value: "", label: "Channel-wide (no property)" },
    ...properties.map((p) => ({ value: p._id as string, label: p.title })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Marketing spend"
      description="Log ad spend, boosted posts and other marketing costs."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add spend
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Channel</Label>
            <StaggeredDropDown
              value={channel}
              onChange={setChannel}
              options={LEAD_SOURCE_OPTIONS}
              portal
            />
          </div>
          <div className="space-y-2">
            <Label>Property</Label>
            <StaggeredDropDown
              value={propertyId}
              onChange={setPropertyId}
              options={propertyOptions}
              portal
              searchable
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Note (optional)</Label>
          <Input
            placeholder="e.g. Facebook boosted post"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Recent spend
          </h4>
          {expenses === undefined ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : expenses.length === 0 ? (
            <p className="text-sm text-text-muted">No marketing spend logged yet.</p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {expenses.slice(0, 25).map((e) => (
                <div
                  key={e._id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-row-hover"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{formatCurrency(e.amount, e.currency)}</span>{" "}
                    <span className="text-text-muted">· {e.channel}</span>
                    {e.propertyTitle ? (
                      <span className="text-text-dim"> · {e.propertyTitle}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-dim">
                    <span>{format(new Date(e.spentAt), "MMM d")}</span>
                    <button
                      type="button"
                      onClick={() => deleteExpense({ expenseId: e._id })}
                      className="text-red-500 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
