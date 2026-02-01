// Common currencies including Zimbabwe currencies
export const currencies = [
  // Zimbabwe
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "ZWL", symbol: "Z$", name: "Zimbabwe Dollar" },
  { code: "ZiG", symbol: "ZiG", name: "Zimbabwe Gold" },
  // Major world currencies
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "BWP", symbol: "P", name: "Botswana Pula" },
  { code: "MZN", symbol: "MT", name: "Mozambican Metical" },
  { code: "ZMW", symbol: "ZK", name: "Zambian Kwacha" },
  // Other common currencies
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi" },
];

export function getCurrencySymbol(code: string): string {
  const currency = currencies.find((c) => c.code === code);
  return currency?.symbol || code;
}

export function formatCurrency(
  value: number | string | undefined,
  currencyCode: string = "USD"
): string {
  if (value === undefined || value === "" || value === null) return "";

  const numValue = typeof value === "string" ? parseFloat(value.replace(/[^\d.-]/g, "")) : value;

  if (isNaN(numValue)) return "";

  const symbol = getCurrencySymbol(currencyCode);
  const formatted = numValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatted}`;
}

export function parseCurrencyInput(value: string): string {
  // Remove all non-numeric characters except decimal point and minus
  return value.replace(/[^\d.-]/g, "");
}

export function formatCurrencyInput(value: string): string {
  // Parse the raw value
  const cleanValue = parseCurrencyInput(value);

  if (!cleanValue || cleanValue === "-") return cleanValue;

  const numValue = parseFloat(cleanValue);

  if (isNaN(numValue)) return "";

  // Format with thousand separators
  return numValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function validateCurrencyInput(value: string): { isValid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { isValid: true }; // Empty is valid (for optional fields)
  }

  const cleanValue = parseCurrencyInput(value);
  const numValue = parseFloat(cleanValue);

  if (isNaN(numValue)) {
    return { isValid: false, error: "Please enter a valid number" };
  }

  if (numValue < 0) {
    return { isValid: false, error: "Amount cannot be negative" };
  }

  return { isValid: true };
}
