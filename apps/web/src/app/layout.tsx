import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verdict — Verifiable AI Assertion Layer",
  description:
    "One primitive. TEE-attested judges. On-chain verdicts. Built on 0G.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
