import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Verdict — Verifiable AI Assertion Layer",
    template: "%s · Verdict",
  },
  description:
    "One primitive. TEE-attested judges. On-chain verdicts. Built on 0G.",
  metadataBase: new URL("https://verdict.xyz"),
  keywords: [
    "0G",
    "verdict",
    "TEE",
    "AI",
    "decentralized arbitration",
    "optimistic oracle",
    "escrow",
    "parametric insurance",
    "DAO milestone",
    "blockchain",
  ],
  openGraph: {
    title: "Verdict — Verifiable AI Assertion Layer",
    description:
      "One primitive. TEE-attested judges. On-chain verdicts. Built on 0G.",
    url: "https://verdict.xyz",
    siteName: "Verdict",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Verdict — Verifiable AI Assertion Layer",
    description: "TEE-attested AI judges producing on-chain verdicts on 0G.",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} min-h-screen bg-black font-sans text-white antialiased selection:bg-white selection:text-black`}
      >
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
