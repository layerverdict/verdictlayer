import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Authenticity",
  description:
    "NFT + document authenticity checks. A vision-aware TEE judge compares perceptual hashes and metadata, then issues an on-chain certificate.",
};

export default function AuthenticityLayout({ children }: { children: ReactNode }) {
  return children;
}
