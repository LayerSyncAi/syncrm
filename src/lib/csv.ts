/** Minimal CSV parser — handles quoted fields, newlines inside quotes, etc. */
export function parseCSV(text: string): string[][] {
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
        i++; // skip escaped quote
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
        if (ch === "\r") i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }
  // last field
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Generate a CSV string from header + rows */
export function generateCSV(
  headers: string[],
  rows: (string | number | undefined | null)[][]
): string {
  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map((v) => escape(String(v ?? ""))).join(","));
  }
  return lines.join("\n");
}

/** Trigger a browser download of a blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Normalize phone: strip spaces/symbols, keep leading + */
export function normalizePhone(phone: string): string {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/[^\d]/g, "");
  return hasPlus ? "+" + digits : digits;
}

/** Normalize email: trim + lowercase */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
