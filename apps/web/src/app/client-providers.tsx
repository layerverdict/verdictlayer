"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { zgMainnet, zgTestnet } from "@/lib/web3/chains";
import { wagmiConfig } from "@/lib/web3/wagmi";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Two discrete provider trees:
 *  - Production path: PrivyProvider → @privy-io/wagmi's WagmiProvider.
 *    Privy's WagmiProvider reads Privy context internally, so it can
 *    only be used inside a PrivyProvider.
 *  - Scaffolding path: stock wagmi's WagmiProvider for local work
 *    before Privy app id has been created.
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  if (!PRIVY_APP_ID) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#ffffff",
          showWalletLoginFirst: false,
          walletList: ["metamask", "rainbow", "coinbase_wallet", "wallet_connect"],
        },
        loginMethods: ["email", "wallet", "google", "twitter", "github"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        defaultChain: zgTestnet,
        supportedChains: [zgTestnet, zgMainnet],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>{children}</PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
