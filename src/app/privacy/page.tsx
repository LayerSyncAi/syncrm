import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/legal/legal-document";
import { LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · SynCRM",
  description: "How SynCRM collects, uses and protects personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      version={LEGAL_VERSIONS.privacy}
      effectiveDate="23 June 2026"
    >
      <p>
        This Privacy Policy explains how SynCRM (&ldquo;SynCRM&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, discloses and
        safeguards personal information when an estate agency
        (&ldquo;Customer&rdquo;) and its authorised users use the SynCRM real
        estate customer relationship management platform (the
        &ldquo;Service&rdquo;). It is written with the Cyber and Data Protection
        Act [Chapter 11:12] of Zimbabwe in mind, alongside general good-practice
        data protection principles.
      </p>

      <LegalSection heading="1. Who is responsible for your data">
        <p>
          The Customer (the estate agency that creates an account) is the data
          controller for the client, lead, contact and property information it
          enters into the Service. SynCRM acts as a data processor, handling that
          information on the Customer&rsquo;s behalf and in accordance with this
          policy and our agreement with the Customer. For account-level data
          about the Customer&rsquo;s own users, SynCRM acts as controller.
        </p>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account information:</strong> organisation name, user full
            name, email address, role and authentication credentials (passwords
            are stored only as salted hashes, never in plain text).
          </li>
          <li>
            <strong>CRM content entered by users:</strong> contact and lead
            details (names, phone numbers, email addresses, budgets, notes),
            property listings, viewings, tasks, activities and deal records.
          </li>
          <li>
            <strong>Usage and technical data:</strong> log records such as sign-in
            events, device and browser information, and timestamps necessary to
            operate and secure the Service.
          </li>
          <li>
            <strong>Acceptance records:</strong> the version of this policy and
            the Terms &amp; Conditions you accept, with the time of acceptance.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. How we use information">
        <ul className="list-disc space-y-1 pl-5">
          <li>To provide, maintain and improve the Service.</li>
          <li>To authenticate users and protect against unauthorised access.</li>
          <li>
            To send operational communications such as task reminders and
            account notices.
          </li>
          <li>
            To generate reports and analytics for the Customer about its own
            data.
          </li>
          <li>To comply with legal obligations and enforce our agreements.</li>
        </ul>
        <p>
          We do not sell personal information, and we do not use Customer CRM
          content for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="4. Lawful basis">
        <p>
          We process personal information where it is necessary to perform our
          contract with the Customer, where we have a legitimate interest in
          operating and securing the Service, where you have consented, or where
          processing is required to comply with the law.
        </p>
      </LegalSection>

      <LegalSection heading="5. Sharing and sub-processors">
        <p>
          We share information only with service providers that help us run the
          Service (for example cloud hosting, database, email delivery and, where
          enabled, AI-assistant providers). These providers act on our
          instructions under confidentiality obligations. We may also disclose
          information where required by law or to protect rights and safety.
        </p>
      </LegalSection>

      <LegalSection heading="6. AI assistant">
        <p>
          Where the Customer enables the AI Copilot, queries and the relevant CRM
          records needed to answer them are sent to our AI provider solely to
          generate a response for the user. This content is not used to train
          third-party models.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data retention">
        <p>
          We retain personal information for as long as the Customer&rsquo;s
          account is active and as needed to provide the Service. When an account
          is closed, we delete or anonymise data within a reasonable period
          unless retention is required by law.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          We use technical and organisational measures including encryption in
          transit, hashed credentials, access controls scoped to each
          organisation, and audit logging. No system is perfectly secure, but we
          work to protect information against loss, misuse and unauthorised
          access.
        </p>
      </LegalSection>

      <LegalSection heading="9. Your rights">
        <p>
          Subject to applicable law, individuals may request access to,
          correction of, or deletion of their personal information. Because the
          Customer controls CRM content, such requests for client and lead data
          should be directed to the relevant agency; we will assist the Customer
          in responding.
        </p>
      </LegalSection>

      <LegalSection heading="10. International transfers">
        <p>
          Some sub-processors may store or process data outside Zimbabwe. Where
          this occurs we take steps to ensure an appropriate level of protection
          for the information.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to this policy">
        <p>
          We may update this policy from time to time. When we make material
          changes we will update the version above and may require renewed
          acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact">
        <p>
          For privacy questions, contact your organisation administrator or
          SynCRM support at the address provided in your service agreement.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
