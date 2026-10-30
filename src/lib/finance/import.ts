/**
 * SyncFinance "Import and migrate": the three Excel templates and the pure
 * parsers that turn sheet rows into importer batches (convex/finance/importer.ts).
 *
 *  - opening: balances at go-live per account, landlord and tenant deposit.
 *  - transactions: historical receipts and payments from a receipt book.
 *  - stands: clients already on instalment plans.
 *
 * Row numbers are spreadsheet rows (header is row 1). A row with an error is
 * left out and listed before anything is sent.
 */
import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { parseDateCell, batches } from "../stay/import";
import { datePrefix, todayLocal } from "./format";

export { parseDateCell, batches };

export type ImportKind = "opening" | "transactions" | "stands";
export type ImportError = { row: number; message: string };

export type OpeningRow = FunctionArgs<typeof api.finance.importer.openingBatch>["rows"][number];
export type TransactionRow = FunctionArgs<typeof api.finance.importer.transactionsBatch>["rows"][number];
export type StandRow = FunctionArgs<typeof api.finance.importer.standsBatch>["rows"][number];

/** The server takes at most 100 rows per call. */
export const BATCH_SIZE = 100;

type Column = { key: string; header: string; example: string | number };

export const OPENING_COLUMNS = [
  { key: "type", header: "Type (Account, Landlord or Deposit)", example: "Account" },
  { key: "name", header: "Name", example: "CBZ Trust Account" },
  { key: "phone", header: "Phone", example: "" },
  { key: "email", header: "Email", example: "" },
  { key: "currency", header: "Currency (USD or ZiG)", example: "USD" },
  { key: "amount", header: "Amount", example: 12500 },
  { key: "accountType", header: "Account type (Trust, Business or Cash)", example: "Trust" },
] as const satisfies readonly Column[];

export const OPENING_EXAMPLES: Array<Array<string | number>> = [
  ["Landlord", "Tendai Moyo", "+263 77 123 4567", "", "USD", 3200, ""],
  ["Deposit", "Rudo Chari", "", "rudo@example.com", "USD", 450, ""],
];

export const OPENING_NOTES = [
  "One row per balance at the go-live date. You choose the go-live date on the import screen.",
  "Account: a bank account or cash float. A new name adds the account; Account type says which kind (Trust if left blank).",
  "Landlord: money you hold for a landlord. The landlord must already exist in SyncStay or Owners.",
  "Deposit: a tenant deposit you hold. The tenant needs exactly one active lease in that currency in SyncStay.",
  "Trust account balances start as unallocated. Each landlord and deposit balance is taken from it, so what is left is money nobody has been matched to yet.",
  "Phone or email helps tell apart two people with the same name.",
  "Currency USD or ZiG. Amounts are never converted.",
  "If SyncStay already brought in tenant deposits while Finance was on, leave them out of this file.",
];

export const TRANSACTION_COLUMNS = [
  { key: "date", header: "Date", example: "2026-03-14" },
  { key: "account", header: "Account", example: "CBZ Trust Account" },
  { key: "direction", header: "Direction (In or Out)", example: "In" },
  { key: "amount", header: "Amount", example: 450 },
  { key: "description", header: "Description", example: "Rent March, 12 Kings Road Flat 1" },
  { key: "category", header: "Category", example: "" },
  { key: "number", header: "Receipt or voucher number", example: "RC-00123" },
  { key: "reference", header: "Reference", example: "" },
  { key: "party", header: "Paid by or to", example: "Rudo Chari" },
  { key: "landlord", header: "Landlord", example: "Tendai Moyo" },
] as const satisfies readonly Column[];

export const TRANSACTION_EXAMPLES: Array<Array<string | number>> = [
  ["2026-03-20", "CBZ Business Account", "Out", 60, "Fuel for site visits", "Fuel", "PV-00045", "", "Total Avondale", ""],
];

export const TRANSACTION_NOTES = [
  "One row per receipt or payment, for example a year of the receipt book.",
  "Account must match the name of an account in Finance settings. Its currency is used.",
  "Direction In is money received; Out is money paid.",
  "Fill in Landlord when the money belongs to a landlord. Leave it blank for the agency's own income or expense.",
  "Category is for the agency's own money. A new name adds the category; blank uses Other income or Other expenses.",
  "Receipt or voucher number keeps the number from the book.",
  "Dates as YYYY-MM-DD or DD/MM/YYYY, not in the future and not in a closed month.",
];

export const STAND_COLUMNS = [
  { key: "development", header: "Development", example: "Mount Pleasant Heights" },
  { key: "standNumber", header: "Stand", example: "45" },
  { key: "buyerName", header: "Buyer name", example: "Farai Ncube" },
  { key: "buyerPhone", header: "Phone", example: "+263 77 987 6543" },
  { key: "buyerEmail", header: "Email", example: "farai@example.com" },
  { key: "price", header: "Price", example: 24000 },
  { key: "deposit", header: "Deposit", example: 6000 },
  { key: "depositDue", header: "Deposit due", example: "2026-01-15" },
  { key: "instalments", header: "Number of instalments", example: 18 },
  { key: "firstDue", header: "First instalment due", example: "2026-02-15" },
  { key: "paidToDate", header: "Paid to date", example: 10000 },
] as const satisfies readonly Column[];

export const STAND_EXAMPLES: Array<Array<string | number>> = [];

export const STAND_NOTES = [
  "One row per stand sold on instalments.",
  "The development must already exist, with the same name.",
  "Amounts are in the development's currency.",
  "The balance after the deposit is split into equal monthly instalments from the first due date.",
  "Paid to date is everything the buyer has paid so far. It is set against the oldest instalments first.",
  "Dates as YYYY-MM-DD or DD/MM/YYYY.",
];

export const IMPORT_SPECS = {
  opening: {
    title: "Opening balances",
    sheet: "Opening balances",
    file: "Sync_Finance_opening_balances_template",
    columns: OPENING_COLUMNS as readonly Column[],
    examples: OPENING_EXAMPLES,
    notes: OPENING_NOTES,
  },
  transactions: {
    title: "Historical transactions",
    sheet: "Transactions",
    file: "Sync_Finance_transactions_template",
    columns: TRANSACTION_COLUMNS as readonly Column[],
    examples: TRANSACTION_EXAMPLES,
    notes: TRANSACTION_NOTES,
  },
  stands: {
    title: "Clients on instalments",
    sheet: "Instalments",
    file: "Sync_Finance_instalments_template",
    columns: STAND_COLUMNS as readonly Column[],
    examples: STAND_EXAMPLES,
    notes: STAND_NOTES,
  },
} as const;

// ── Templates and reading files ──────────────────────────────────────

/** `file` names the download (after the YYMMDD_ prefix); defaults to the kind's own. */
export async function downloadTemplate(kind: ImportKind, file?: string): Promise<void> {
  const spec = IMPORT_SPECS[kind];
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const headers = spec.columns.map((c) => c.header);
  const sheet = XLSX.utils.aoa_to_sheet([headers, spec.columns.map((c) => c.example), ...spec.examples]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, Math.min(36, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, sheet, spec.sheet);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["How to fill in this template"], ...spec.notes.map((n) => [n])]), "Notes");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${datePrefix()}${file ?? spec.file}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The first sheet that is not "Notes", as rows keyed by header. */
export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const name = wb.SheetNames.find((n) => n.toLowerCase() !== "notes") ?? wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "", raw: true });
}

// ── Cell helpers ─────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function headerMap(columns: readonly Column[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of columns) {
    m.set(norm(c.header), c.key);
    m.set(norm(c.header.split("(")[0]), c.key);
    m.set(norm(c.key), c.key);
  }
  return m;
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[^\d.-]/g, "");
  if (!s) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const opt = (v: unknown) => text(v) || undefined;

function currencyOf(v: unknown): "USD" | "ZiG" | null {
  const c = text(v).toUpperCase();
  return c === "USD" ? "USD" : c === "ZIG" ? "ZiG" : null;
}

/** Walk the rows, mapping headers to keys and skipping blank lines. */
function eachRow(
  rows: Record<string, unknown>[],
  columns: readonly Column[],
  fn: (r: Record<string, unknown>, row: number, err: (message: string) => void) => void
): ImportError[] {
  const map = headerMap(columns);
  const errors: ImportError[] = [];
  rows.forEach((raw, i) => {
    const row = i + 2;
    const r: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(raw)) {
      const key = map.get(norm(k));
      if (key) r[key] = val;
    }
    if (Object.values(r).every((x) => text(x) === "")) return;
    fn(r, row, (message) => errors.push({ row, message }));
  });
  return errors;
}

/** Headers the sheet must have, by key. Returns a message or null. */
function missingHeaders(rows: Record<string, unknown>[], columns: readonly Column[], required: string[]): string | null {
  if (!rows.length) return null;
  const map = headerMap(columns);
  const seen = new Set(Object.keys(rows[0]).map((k) => map.get(norm(k))));
  const missing = columns.filter((c) => required.includes(c.key) && !seen.has(c.key)).map((c) => c.header.split(" (")[0]);
  return missing.length ? `The file has no ${missing.join(", ")} column. Use the template.` : null;
}

// ── Parsers ──────────────────────────────────────────────────────────

export type Parsed<T> = { rows: T[]; errors: ImportError[]; fatal?: string };

export function parseOpeningRows(raw: Record<string, unknown>[]): Parsed<OpeningRow> {
  const fatal = missingHeaders(raw, OPENING_COLUMNS, ["type", "name", "currency", "amount"]);
  if (fatal) return { rows: [], errors: [], fatal };
  const rows: OpeningRow[] = [];
  const errors = eachRow(raw, OPENING_COLUMNS, (r, row, err) => {
    const t = text(r.type).toLowerCase();
    const type = t === "account" ? "account" : t === "landlord" ? "landlord" : t === "deposit" || t === "tenant deposit" ? "deposit" : null;
    if (!type) return err(`Type must be Account, Landlord or Deposit, not "${text(r.type)}"`);
    const name = text(r.name);
    if (!name) return err("Name is missing");
    const currency = currencyOf(r.currency);
    if (!currency) return err(`Currency must be USD or ZiG, not "${text(r.currency)}"`);
    const amount = num(r.amount);
    if (amount === undefined || isNaN(amount)) return err("Amount must be a number");
    if (amount === 0) return err("Amount is zero");
    const at = text(r.accountType).toLowerCase();
    const accountType = at === "" ? undefined : at === "trust" || at === "business" || at === "cash" ? at : null;
    if (accountType === null) return err(`Account type must be Trust, Business or Cash, not "${text(r.accountType)}"`);
    rows.push({
      row,
      type,
      name,
      phone: opt(r.phone),
      email: opt(r.email),
      currency,
      amount,
      accountType: type === "account" ? accountType : undefined,
    });
  });
  return { rows, errors };
}

export function parseTransactionRows(raw: Record<string, unknown>[]): Parsed<TransactionRow> {
  const fatal = missingHeaders(raw, TRANSACTION_COLUMNS, ["date", "account", "direction", "amount"]);
  if (fatal) return { rows: [], errors: [], fatal };
  const today = todayLocal();
  const rows: TransactionRow[] = [];
  const errors = eachRow(raw, TRANSACTION_COLUMNS, (r, row, err) => {
    const date = parseDateCell(r.date);
    if (!date) return err("Date is not a valid date");
    if (date > today) return err("Date is in the future");
    const account = text(r.account);
    if (!account) return err("Account is missing");
    const d = text(r.direction).toLowerCase();
    const direction = ["in", "money in", "receipt", "received"].includes(d) ? "in" : ["out", "money out", "payment", "paid"].includes(d) ? "out" : null;
    if (!direction) return err(`Direction must be In or Out, not "${text(r.direction)}"`);
    const amount = num(r.amount);
    if (amount === undefined || isNaN(amount) || amount === 0) return err("Amount must be a number more than zero");
    rows.push({
      row,
      date,
      account,
      direction,
      amount: Math.abs(amount),
      description: text(r.description),
      category: opt(r.category),
      number: opt(r.number),
      reference: opt(r.reference),
      party: opt(r.party),
      landlord: opt(r.landlord),
    });
  });
  return { rows, errors };
}

export function parseStandRows(raw: Record<string, unknown>[]): Parsed<StandRow> {
  const fatal = missingHeaders(raw, STAND_COLUMNS, ["development", "standNumber", "buyerName", "price"]);
  if (fatal) return { rows: [], errors: [], fatal };
  const rows: StandRow[] = [];
  const seen = new Set<string>();
  const errors = eachRow(raw, STAND_COLUMNS, (r, row, err) => {
    const development = text(r.development);
    if (!development) return err("Development is missing");
    const standNumber = text(r.standNumber);
    if (!standNumber) return err("Stand is missing");
    const dupe = `${development.toLowerCase()}|${standNumber.toLowerCase()}`;
    if (seen.has(dupe)) return err(`Stand ${standNumber} in ${development} appears twice`);
    const buyerName = text(r.buyerName);
    if (!buyerName) return err("Buyer name is missing");
    const price = num(r.price);
    if (price === undefined || isNaN(price) || price <= 0) return err("Price must be more than zero");
    const deposit = num(r.deposit) ?? 0;
    if (isNaN(deposit) || deposit < 0) return err("Deposit must be a number");
    if (deposit > price) return err("Deposit is more than the price");
    const depositDue = parseDateCell(r.depositDue);
    if (deposit > 0 && !depositDue) return err("Deposit due is not a valid date");
    const count = num(r.instalments) ?? 0;
    if (isNaN(count) || count < 0 || !Number.isInteger(count)) return err("Number of instalments must be a whole number");
    const rest = price - deposit;
    const firstDue = parseDateCell(r.firstDue);
    if (rest > 0 && !firstDue) return err("First instalment due is not a valid date");
    const paidToDate = num(r.paidToDate) ?? 0;
    if (isNaN(paidToDate) || paidToDate < 0) return err("Paid to date must be a number");
    if (paidToDate > price) return err("Paid to date is more than the price");
    seen.add(dupe);
    rows.push({
      row,
      development,
      standNumber,
      buyerName,
      buyerPhone: opt(r.buyerPhone),
      buyerEmail: opt(r.buyerEmail),
      price,
      deposit,
      depositDue: depositDue ?? firstDue ?? "",
      instalments: count,
      firstDue: firstDue ?? depositDue ?? "",
      paidToDate,
    });
  });
  return { rows, errors };
}

/** A short label for a parsed row, used in the results list. */
export function rowLabel(kind: ImportKind, r: OpeningRow | TransactionRow | StandRow): string {
  if (kind === "opening") {
    const o = r as OpeningRow;
    return `${o.type === "account" ? "Account" : o.type === "landlord" ? "Landlord" : "Deposit"}: ${o.name}`;
  }
  if (kind === "transactions") {
    const t = r as TransactionRow;
    return `${t.date}, ${t.direction === "in" ? "money in" : "money out"}, ${t.account}${t.number ? `, ${t.number}` : ""}`;
  }
  const s = r as StandRow;
  return `Stand ${s.standNumber}, ${s.development}: ${s.buyerName}`;
}
