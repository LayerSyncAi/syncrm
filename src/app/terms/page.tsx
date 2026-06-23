import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/legal/legal-document";
import { LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions · SynCRM",
  description: "The terms governing use of the SynCRM platform.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms & Conditions"
      version={LEGAL_VERSIONS.terms}
      effectiveDate="23 June 2026"
    >
      <p>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern access to and
        use of the SynCRM real estate CRM platform (the &ldquo;Service&rdquo;).
        By creating an account or using the Service you agree to these Terms on
        behalf of yourself and the organisation you represent.
      </p>

      <LegalSection heading="1. Accounts and eligibility">
        <p>
          You must provide accurate registration information and are responsible
          for keeping your credentials confidential. The person who registers an
          organisation becomes its administrator and is responsible for managing
          that organisation&rsquo;s users and data. You must be authorised to act
          for the organisation you register.
        </p>
      </LegalSection>

      <LegalSection heading="2. Acceptable use">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Use the Service only for lawful real estate business purposes.
          </li>
          <li>
            Do not upload unlawful content or personal data you are not entitled
            to process.
          </li>
          <li>
            Do not attempt to disrupt, reverse engineer, or gain unauthorised
            access to the Service or other organisations&rsquo; data.
          </li>
          <li>
            Do not use the Service to send unsolicited communications in breach
            of applicable law.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Customer data and ownership">
        <p>
          As between you and SynCRM, your organisation owns the contact, lead,
          property and other content it enters (&ldquo;Customer Data&rdquo;). You
          grant SynCRM the rights needed to host and process Customer Data to
          provide the Service. You are responsible for the accuracy and legality
          of Customer Data and for having a lawful basis to process the personal
          information of clients and leads you record.
        </p>
      </LegalSection>

      <LegalSection heading="4. Privacy">
        <p>
          Our handling of personal information is described in the Privacy
          Policy, which forms part of these Terms. By accepting these Terms you
          confirm you have read the Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection heading="5. Commission and financial figures">
        <p>
          The Service assists with recording deals and calculating commissions
          based on the values and splits you enter. SynCRM does not guarantee the
          accuracy of any financial figure and is not a substitute for your own
          accounting or professional advice. You are responsible for verifying
          commission calculations and deal records before relying on them.
        </p>
      </LegalSection>

      <LegalSection heading="6. Beta features">
        <p>
          The Service may include beta or preview features that are provided
          &ldquo;as is&rdquo;, may change or be withdrawn, and may be less
          reliable than generally available features. Feedback you provide may be
          used to improve the Service.
        </p>
      </LegalSection>

      <LegalSection heading="7. Availability and changes">
        <p>
          We aim to keep the Service available but do not guarantee uninterrupted
          access. We may modify, suspend or discontinue features, and will give
          reasonable notice of material changes where practicable.
        </p>
      </LegalSection>

      <LegalSection heading="8. Suspension and termination">
        <p>
          We may suspend or terminate access for breach of these Terms or to
          protect the Service or other users. You may stop using the Service at
          any time. On termination, the data provisions of the Privacy Policy
          apply.
        </p>
      </LegalSection>

      <LegalSection heading="9. Disclaimers and liability">
        <p>
          To the maximum extent permitted by law, the Service is provided without
          warranties of any kind, and SynCRM is not liable for indirect or
          consequential losses, loss of profits, or loss of data arising from use
          of the Service. Nothing in these Terms limits liability that cannot be
          limited by law.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law">
        <p>
          These Terms are governed by the laws of Zimbabwe, and the courts of
          Zimbabwe have jurisdiction over any disputes, without prejudice to any
          mandatory rights you may have.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to these Terms">
        <p>
          We may update these Terms from time to time. When we make material
          changes we will update the version above and may require renewed
          acceptance before continued use.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact">
        <p>
          Questions about these Terms can be directed to your organisation
          administrator or SynCRM support at the address in your service
          agreement.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
