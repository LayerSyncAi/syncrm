import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { AnimatedToaster } from "@/components/ui/animated-toaster";
import { PWARegister } from "@/components/pwa/pwa-register";
import { brand, brandThemeCss } from "@/config/brand";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: brand.metadata.title,
  description: brand.metadata.description,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brand.name,
    startupImage: brand.logos.appleTouch,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: brand.logos.favicon, sizes: "32x32", type: "image/png" },
      { url: brand.logos.icon, sizes: "192x192", type: "image/png" },
    ],
    apple: brand.logos.appleTouch,
    shortcut: brand.logos.favicon,
  },
  openGraph: {
    title: brand.metadata.title,
    description: brand.metadata.description,
    images: [{ url: brand.logos.og }],
  },
};

// theme-color and viewport must be exported separately in Next.js 14+
// Note: maximumScale and userScalable are intentionally omitted - disabling
// pinch-to-zoom breaks WCAG 1.4.4 and iOS ignores those attributes since iOS 10.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.metadata.themeColor },
    { media: "(prefers-color-scheme: dark)", color: brand.metadata.themeColor },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={inter.variable}>
        <body>
          {/* Brand colours: maps brand.ts values onto the --brand-* custom
              properties that globals.css reads. Inline so it applies at first
              paint (no flash). Defaults to SynCRM when no env vars are set. */}
          <style id="brand-theme" dangerouslySetInnerHTML={{ __html: brandThemeCss() }} />
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <AnimatedToaster />
          <PWARegister />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
