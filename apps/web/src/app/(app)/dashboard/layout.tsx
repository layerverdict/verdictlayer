import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Live totals from every Verdict Layer application plus the newest assertions mirrored from 0G Chain.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
