/**
 * Wagmi configuration for use with @privy-io/wagmi.
 *
 * PrivyProvider owns the connectors — here we only declare the chains
 * and the transport per chain. Keep this SSR-safe: `createConfig` runs
 * on both sides.
 */

import { createConfig } from "@privy-io/wagmi";
import { http } from "viem";

import { supportedChains, zgMainnet, zgTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: {
    [zgMainnet.id]: http(zgMainnet.rpcUrls.default.http[0]),
    [zgTestnet.id]: http(zgTestnet.rpcUrls.default.http[0]),
  },
});
