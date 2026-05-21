import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { AnimatedToaster } from "@/components/ui/animated-toaster";
import { PWARegister } from "@/components/pwa/pwa-register";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SynCRM",
  description: "Real Estate Pipeline CRM",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SynCRM",
    startupImage: "/icons/apple-touch-icon.png",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon-32x32.png",
  },
};

// theme-color and viewport must be exported separately in Next.js 14+
// Note: maximumScale and userScalable are intentionally omitted - disabling
// pinch-to-zoom breaks WCAG 1.4.4 and iOS ignores those attributes since iOS 10.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eca400" },
    { media: "(prefers-color-scheme: dark)", color: "#eca400" },
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
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <AnimatedToaster />
          <PWARegister />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
