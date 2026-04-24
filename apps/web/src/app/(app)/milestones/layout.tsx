import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Milestones",
  description:
    "DAO grant vaults with per-milestone release. Grantees submit evidence, the judge verifies, the vault pays out the matching slice.",
};

export default function MilestonesLayout({ children }: { children: ReactNode }) {
  return children;
}
