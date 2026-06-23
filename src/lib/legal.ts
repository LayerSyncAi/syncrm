// Versioned legal documents. Bump a version (use the publication date) whenever
// the corresponding document's text changes, so re-acceptance can be required
// and historical acceptances stay meaningful. The sign-up flow records the
// versions a user accepted against these values.

export type LegalDocumentType = "privacy" | "terms";

export const LEGAL_VERSIONS: Record<LegalDocumentType, string> = {
  privacy: "2026-06-23",
  terms: "2026-06-23",
};
