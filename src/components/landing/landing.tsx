/**
 * The SyncEstate landing page. Spec: docs/landing/MASTER_SPEC.md.
 * Server component; interactive pieces are client islands.
 */
import { Geist_Mono } from "next/font/google";
import "./landing.css";
import { Nav } from "./nav";
import { Hero } from "./hero";
import { TheSync } from "./the-sync/the-sync";
import { HubBento } from "./hub-bento";
import { ModuleShowcase } from "./module-showcase";
import { Integrations } from "./integrations";
import { AppComingSoon, FinalCta, Footer, HowItWorks, WhoItsFor, Zimbabwe } from "./sections";
import { Faq } from "./faq";
import { noFlashScript, ROOT_ID } from "./theme";
import { ButtonFX } from "./button-fx";
import { EnquiryDialog } from "./enquiry-dialog";
import { SyncSiteTracker } from "./syncsite";
import { Vsl } from "./vsl";
import { layerSyncUrl, salesPhoneE164, siteUrl } from "@/config/marketing";
import { faq } from "./content";

/** Structured data for search engines: the product, its maker and the FAQ. */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${layerSyncUrl}/#organization`,
        name: "LayerSync",
        url: layerSyncUrl,
        description: "End-to-end digital transformation specialists, based in Zimbabwe.",
        areaServed: { "@type": "Country", name: "Zimbabwe" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone: salesPhoneE164,
          availableLanguage: ["English"],
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "SyncEstate",
        url: `${siteUrl}/`,
        image: `${siteUrl}/landing/og.jpg`,
        description:
          "Leads, lettings, repairs, valuations, trust accounts and developments for estate agencies, on one login. Works in any phone browser; native iOS and Android apps are coming soon.",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        areaServed: { "@type": "Country", name: "Zimbabwe" },
        publisher: { "@id": `${layerSyncUrl}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
});

export function Landing() {
  return (
    <div id={ROOT_ID} className={`landing ${geistMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      <script
        type="application/ld+json"
        // JSON from our own constants; < is escaped so it can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }}
      />
      <a href="#main" className="l-skip">
        Skip to content
      </a>
      <div aria-hidden className="l-grain" />
      <ButtonFX />
      <Nav />
      <main id="main">
        <Hero />
        <Vsl />
        <TheSync />
        <HubBento />
        <ModuleShowcase />
        <Integrations />
        <WhoItsFor />
        <Zimbabwe />
        <HowItWorks />
        <AppComingSoon />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <EnquiryDialog />
      <SyncSiteTracker />
    </div>
  );
}
