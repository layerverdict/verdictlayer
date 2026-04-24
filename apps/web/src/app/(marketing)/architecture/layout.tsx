import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "How Verdict splits into four on-chain contracts (AssertionRegistry, VerdictEnforcer, EscalationManager, ReputationRegistry) and three off-chain services.",
};

export default function ArchitectureLayout({ children }: { children: ReactNode }) {
  return children;
}
