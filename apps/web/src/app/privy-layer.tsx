"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useMemo, type ReactNode } from "react";

import { PrivyAuthContext } from "@/lib/auth";
import { truncateAddress } from "@/lib/format";
import { zgMainnet, zgTestnet } from "@/lib/web3/chains";

/**
 * Isolated Privy provider module.
 *
 * Lives in its own file so `next/dynamic` can split it into a separate
 * client chunk. The root client-providers.tsx mounts WagmiProvider
 * first, then pulls this module in on an idle callback — dashboards
 * and listing pages never parse Privy for their initial render.
 *
 * Privy's own `WagmiProvider` is intentionally not used: wagmi's stock
 * provider is already mounted upstream, and stacking them fights for
 * the same context. Privy attaches wallets to the shared wagmi config
 * via its internal connector flow.
 */
export function PrivyLayer({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
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
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

/**
 * Thin bridge — pulls Privy's hook-based API and republishes it via
 * the shared AuthContext so the rest of the app can read auth state
 * without importing `@privy-io/react-auth` directly (avoids dragging
 * the bundle back into the critical path of unrelated components).
 */
function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const value = useMemo(() => {
    const wallet = wallets[0];
    const address = (wallet?.address ?? user?.wallet?.address ?? undefined) as
      | `0x${string}`
      | undefined;
    const label = pickLoginLabel(user, address);
    return { ready, authenticated, login, logout, label, address };
  }, [ready, authenticated, user, wallets, login, logout]);

  return (
    <PrivyAuthContext.Provider value={value}>
      {children}
    </PrivyAuthContext.Provider>
  );
}

function pickLoginLabel(
  user: ReturnType<typeof usePrivy>["user"],
  address?: `0x${string}`,
): string {
  if (user?.email?.address) return user.email.address;
  if (user?.google?.email) return user.google.email;
  if (user?.twitter?.username) return `@${user.twitter.username}`;
  if (user?.github?.username) return user.github.username;
  if (address) return truncateAddress(address, 4);
  return "Anonymous";
}
