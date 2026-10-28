import { dateLabel, money, type StayCurrency } from "@/lib/stay/format";

export type StatementLineView = {
  date: string;
  kind: "charge" | "payment" | "reversal" | "deposit_applied";
  description: string;
  refId: string;
  debit: number;
  credit: number;
  balance: number;
};

/** Running statement: charges, payments and balance (BRD ST-26). */
export function StatementTable({ lines, currency }: { lines: StatementLineView[]; currency: StayCurrency }) {
  if (!lines.length) {
    return <p className="text-sm text-text-muted">No charges or payments yet.</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Details</th>
              <th className="py-2 pr-3 text-right">Charged</th>
              <th className="py-2 pr-3 text-right">Paid</th>
              <th className="py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2 pr-3 whitespace-nowrap">{dateLabel(l.date)}</td>
                <td className={`py-2 pr-3 ${l.kind === "reversal" ? "text-danger" : ""}`}>{l.description}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{l.debit ? money(l.debit, currency) : ""}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{l.credit ? money(l.credit, currency) : ""}</td>
                <td className="py-2 text-right font-medium whitespace-nowrap">{money(l.balance, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {lines
          .slice()
          .reverse()
          .map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 text-sm">
              <div className="min-w-0">
                <p className={l.kind === "reversal" ? "text-danger" : ""}>{l.description}</p>
                <p className="text-xs text-text-muted">{dateLabel(l.date)}</p>
              </div>
              <div className="text-right">
                <p className={l.credit ? "text-[var(--status-success-fg)]" : ""}>
                  {l.debit ? money(l.debit, currency) : `- ${money(l.credit, currency)}`}
                </p>
                <p className="text-xs text-text-muted">Bal {money(l.balance, currency)}</p>
              </div>
            </li>
          ))}
      </ul>
    </>
  );
}
