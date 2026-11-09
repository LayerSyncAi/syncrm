/**
 * Web Worker for offloading CSV parsing from the main thread.
 * Prevents UI freezing during large file imports (10,000+ rows).
 */

import {
  INTEREST_HEADER_ALIASES,
  PRIMARY_AGENT_HEADER_ALIASES,
} from "../../convex/lib/leadImportMatching";

/** Minimal CSV parser — handles quoted fields, newlines inside quotes, etc. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(field);
        field = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

interface LeadField {
  key: string;
  label: string;
  required?: boolean;
}

const LEAD_FIELDS: LeadField[] = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "interestType", label: "Interest Type" },
  { key: "budgetCurrency", label: "Budget Currency" },
  { key: "budgetMin", label: "Budget Min" },
  { key: "budgetMax", label: "Budget Max" },
  { key: "preferredAreas", label: "Preferred Areas" },
  { key: "notes", label: "Notes" },
  { key: "primaryAgent", label: "Primary Agent" },
];

// Other headers portals use for a field, compared in squashed form
// (lower-case, no spaces/underscores/hyphens).
const HEADER_ALIASES: Record<string, string[]> = {
  primaryAgent: PRIMARY_AGENT_HEADER_ALIASES,
  interestType: INTEREST_HEADER_ALIASES,
};

const squash = (h: string) => h.toLowerCase().replace(/[_\s\-./]/g, "");

function autoMapColumns(headers: string[]): Record<string, string> {
  const autoMap: Record<string, string> = {};
  for (const field of LEAD_FIELDS) {
    const match = headers.find(
      (h) =>
        h.toLowerCase().replace(/[_\s-]/g, "") ===
        field.key.toLowerCase().replace(/[_\s-]/g, "")
    );
    if (match) {
      autoMap[field.key] = match;
    } else {
      const labelMatch = headers.find(
        (h) =>
          h.toLowerCase().replace(/[_\s-]/g, "") ===
          field.label.toLowerCase().replace(/[_\s-]/g, "")
      );
      if (labelMatch) {
        autoMap[field.key] = labelMatch;
        continue;
      }
      // Aliases in priority order, skipping columns already claimed.
      const claimed = new Set(Object.values(autoMap));
      for (const alias of HEADER_ALIASES[field.key] ?? []) {
        const aliasMatch = headers.find((h) => !claimed.has(h) && squash(h) === alias);
        if (aliasMatch) {
          autoMap[field.key] = aliasMatch;
          break;
        }
      }
    }
  }
  return autoMap;
}

export type CsvWorkerMessage = {
  type: "parse";
  text: string;
};

export type CsvWorkerResult =
  | {
      type: "parsed";
      headers: string[];
      rows: string[][];
      autoMap: Record<string, string>;
    }
  | {
      type: "error";
      message: string;
    };

self.onmessage = (e: MessageEvent<CsvWorkerMessage>) => {
  const { type, text } = e.data;

  if (type === "parse") {
    try {
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        self.postMessage({
          type: "error",
          message: "CSV must have a header row and at least one data row",
        } satisfies CsvWorkerResult);
        return;
      }
      const headers = parsed[0].map((h) => h.trim());
      const rows = parsed.slice(1);
      const autoMap = autoMapColumns(headers);
      self.postMessage({
        type: "parsed",
        headers,
        rows,
        autoMap,
      } satisfies CsvWorkerResult);
    } catch (err: any) {
      self.postMessage({
        type: "error",
        message: err.message || "Failed to parse CSV",
      } satisfies CsvWorkerResult);
    }
  }
};
