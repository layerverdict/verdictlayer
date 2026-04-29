"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/web3/wagmi";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Privy weighs ~330KB gzipped and only matters when a visitor actually
 * tries to sign in — the browse-first dashboard shouldn't pay for it on
 * initial page load. Dynamic import defers the chunk to an idle
 * callback, and `ssr: false` keeps the server render from including any
 * Privy imports in the initial HTML. The Suspense boundary is handled
 * by next/dynamic's `loading` prop — a no-op render here, since the
 * app already mounted underneath.
 */
const PrivyLayer = dynamic(
  () => import("./privy-layer").then((m) => m.PrivyLayer),
  { ssr: false, loading: () => null },
);

export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            // 0G testnet RPC flakes intermittently; two retries is enough
            // to mask a single 502 without delaying the UI past 5s.
            retry: 2,
          },
        },
      }),
  );

  // Privy mounts on the next idle tick so the initial hydration path is
  // free of its bundle. In the no-Privy scaffolding build (no app id)
  // we skip it entirely.
  const [privyMounted, setPrivyMounted] = useState(false);
  useEffect(() => {
    if (!PRIVY_APP_ID) return;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window === "undefined") return;
    const hasIdle =
      typeof (window as Window & { requestIdleCallback?: unknown })
        .requestIdleCallback === "function";
    if (hasIdle) {
      idleId = (window as Window & typeof globalThis).requestIdleCallback(
        () => setPrivyMounted(true),
        { timeout: 2000 },
      );
    } else {
      timeoutId = setTimeout(() => setPrivyMounted(true), 500);
    }
    return () => {
      if (typeof window === "undefined") return;
      if (idleId !== undefined && hasIdle) {
        (window as Window & typeof globalThis).cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        {PRIVY_APP_ID && privyMounted ? (
          <PrivyLayer appId={PRIVY_APP_ID}>{children}</PrivyLayer>
        ) : (
          children
        )}
      </WagmiProvider>
    </QueryClientProvider>
  );
}
