import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Judges",
  description:
    "Every TEE judge that adjudicates on Verdict Layer owns a non-transferable ERC-7857 NFT. Browse reputation, verdict counts, and appeal losses on-chain.",
};

export default function JudgesLayout({ children }: { children: ReactNode }) {
  return children;
}
