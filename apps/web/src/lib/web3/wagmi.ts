/**
 * Wagmi + RainbowKit configuration.
 *
 * One config per tab, memoised via module scope. Called from `providers.tsx`
 * which is a client component — never import this from a server component.
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { supportedChains, zgMainnet, zgTestnet } from "./chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "verdict-dev";

export const wagmiConfig = getDefaultConfig({
  appName: "Verdict",
  appDescription: "Verifiable AI Assertion Layer — built on 0G",
  projectId,
  chains: supportedChains,
  transports: {
    [zgMainnet.id]: http(zgMainnet.rpcUrls.default.http[0]),
    [zgTestnet.id]: http(zgTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});
