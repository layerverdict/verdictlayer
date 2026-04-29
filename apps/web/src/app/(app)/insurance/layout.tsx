import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Insurance",
  description:
    "Parametric insurance on Verdict Layer. Collateralise the payout, then let the judge verify the trigger condition against oracle evidence.",
};

export default function InsuranceLayout({ children }: { children: ReactNode }) {
  return children;
}
