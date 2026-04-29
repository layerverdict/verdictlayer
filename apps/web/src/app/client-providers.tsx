"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/web3/wagmi";

import { PrivyLayer } from "./privy-layer";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Provider tree is stable across the session — mounting PrivyLayer
 * conditionally (e.g. via requestIdleCallback) used to swap the
 * parent type of the page tree and React would unmount + remount
 * everything underneath, which read visually like a second page
 * load. PrivyProvider is a plain context; its initialisation cost is
 * small compared to the remount churn it used to cause.
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            // 0G RPC occasionally returns 5xx under burst load; two retries
            // mask a transient blip without delaying the UI past 5s.
            retry: 2,
          },
        },
      }),
  );

  const body = PRIVY_APP_ID ? (
    <PrivyLayer appId={PRIVY_APP_ID}>{children}</PrivyLayer>
  ) : (
    children
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>{body}</WagmiProvider>
    </QueryClientProvider>
  );
}
