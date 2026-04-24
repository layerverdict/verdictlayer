import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Escrow",
  description:
    "Freelance escrow on 0G. Lock funds against a scope and let a TEE-attested judge settle disputes in seconds.",
};

export default function EscrowLayout({ children }: { children: ReactNode }) {
  return children;
}
