"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

// Every web3 layer lives inside a purely-client chunk. This prevents
// Next from trying to execute Privy / IndexedDB access during SSG /
// RSC rendering, which crashes the build on Next 16.
const ClientProviders = dynamic(
  () => import("./client-providers").then((m) => m.ClientProviders),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientProviders>{children}</ClientProviders>
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: "rgba(10, 10, 10, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "#fff",
            backdropFilter: "blur(12px)",
          },
        }}
      />
    </>
  );
}
