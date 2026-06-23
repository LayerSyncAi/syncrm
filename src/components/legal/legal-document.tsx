import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Shared shell for the Privacy Policy and Terms pages. */
export function LegalDocument({
  title,
  version,
  effectiveDate,
  children,
}: {
  title: string;
  version: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>

      <h1 className="text-3xl font-bold text-text">{title}</h1>
      <p className="mt-2 text-sm text-text-muted">
        Version {version} · Effective {effectiveDate}
      </p>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This document is a working draft pending review by qualified legal
        counsel. It is provided for product implementation and beta use and does
        not constitute legal advice.
      </div>

      <article className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-text">
        {children}
      </article>
    </div>
  );
}

/** A titled section within a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-text">{heading}</h2>
      {children}
    </section>
  );
}
