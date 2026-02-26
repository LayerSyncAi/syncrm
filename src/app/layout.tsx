import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { AnimatedToaster } from "@/components/ui/animated-toaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SynCRM",
  description: "Real Estate Pipeline CRM",
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
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
