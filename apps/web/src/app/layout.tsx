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
    default: "Verdict Layer — Verifiable AI Decisions on 0G",
    template: "%s · Verdict Layer",
  },
  description:
    "One primitive. TEE-attested judges. On-chain verdicts. Built on 0G.",
  metadataBase: new URL("https://verdictlayer.xyz"),
  keywords: [
    "0G",
    "verdict layer",
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
    title: "Verdict Layer — Verifiable AI Decisions on 0G",
    description:
      "One primitive. TEE-attested judges. On-chain verdicts. Built on 0G.",
    url: "https://verdictlayer.xyz",
    siteName: "Verdict Layer",
    type: "website",
    images: [{ url: "/logo.png", width: 1248, height: 1248, alt: "Verdict Layer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verdict Layer — Verifiable AI Decisions on 0G",
    description: "TEE-attested AI judges producing on-chain verdicts on 0G.",
    images: ["/logo.png"],
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
    ],
    apple: [{ url: "/logo.png", type: "image/png" }],
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
