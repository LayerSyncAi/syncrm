/**
 * Path data for the SyncEstate product icons: one monochrome line icon per
 * product on a 24-unit grid, drawn with a 1.5 stroke, round caps and joins.
 * Plain data so the website (Lucide) and the phone app (react-native-svg)
 * draw exactly the same icons.
 */
export type ProductIconKey = "estate" | "crm" | "stay" | "worth" | "media" | "finance" | "dev" | "hr";

export const PRODUCT_ICON_PATHS: Record<ProductIconKey, string[]> = {
  /** SyncEstate itself, the Hub: a house with a chimney. */
  estate: [
    "M3 10.5 12 3l9 7.5",
    "M15.5 5.92V3.5H18V8",
    "M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9",
    "M10 21v-5a2 2 0 0 1 4 0v5",
  ],
  /** SynCRM: a funnel. */
  crm: ["M3.5 4.5h17L14 12.5v6l-4 2v-8z"],
  /** SyncStay: a house with a padlock. */
  stay: [
    "M3 10.5 12 3l9 7.5",
    "M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9",
    "M10 14.5h4a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5z",
    "M10.75 14.5v-1.25a1.25 1.25 0 0 1 2.5 0v1.25",
  ],
  /** SyncWorth: a price tag. */
  worth: [
    "M20 4v6.6a1.5 1.5 0 0 1-.44 1.06l-7.86 7.84a1.5 1.5 0 0 1-2.12 0L4.5 14.42a1.5 1.5 0 0 1 0-2.12l7.84-7.86A1.5 1.5 0 0 1 13.4 4z",
    "M16.5 6.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 1 1 0-2.5",
  ],
  /** SyncMedia: a picture. */
  media: [
    "M5 3.5h14A1.5 1.5 0 0 1 20.5 5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z",
    "m3.5 16.5 5-5 5.5 5.5",
    "m12.5 15.5 3-3 5 5",
    "M15.5 6.75a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 1 1 0-3.5",
  ],
  /** SyncFinance: a bank. */
  finance: ["M3 9.5 12 4l9 5.5z", "M6 12.5v5", "M10 12.5v5", "M14 12.5v5", "M18 12.5v5", "M4.5 17.5h15", "M3 20.5h18"],
  /** SyncDev: a plan with a plus. */
  dev: [
    "M11 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l5 5v3",
    "M13 3v5h5",
    "M8.5 9h2",
    "M8.5 12.5h4",
    "M17 13a4 4 0 1 1 0 8 4 4 0 1 1 0-8",
    "M17 15.25v3.5",
    "M15.25 17h3.5",
  ],
  /** SyncHR: two people. */
  hr: [
    "M9 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7",
    "M2.5 20.5V19A4.5 4.5 0 0 1 7 14.5h4a4.5 4.5 0 0 1 4.5 4.5v1.5",
    "M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
    "M21.5 20.5V19a4.5 4.5 0 0 0-3.3-4.33",
  ],
};
