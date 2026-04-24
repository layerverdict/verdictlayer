import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "History",
  description:
    "Full assertion history indexed from 0G Chain. Filter by application, outcome, and jump straight to the on-chain verdict tx.",
};

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return children;
}
