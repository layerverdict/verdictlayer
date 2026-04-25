/**
 * Wagmi configuration for use with @privy-io/wagmi.
 *
 * PrivyProvider owns the connectors — here we only declare the chains
 * and the transport per chain. Keep this SSR-safe: `createConfig` runs
 * on both sides.
 */

import { createConfig } from "@privy-io/wagmi";
import { fallback, http } from "viem";

import { supportedChains, zgMainnet, zgTestnet } from "./chains";

// `fallback` keeps a second HTTP transport in the wings so a single
// slow/502 response from the primary RPC doesn't surface to the user.
// Both URLs currently point to the same endpoint (0G hasn't published
// a secondary public RPC), so the effective behaviour is a retry with
// a small backoff — still cheaper than re-rendering a failed query.
export const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: {
    [zgMainnet.id]: fallback([
      http(zgMainnet.rpcUrls.default.http[0], { retryCount: 2, retryDelay: 200 }),
      http(zgMainnet.rpcUrls.public.http[0]),
    ]),
    [zgTestnet.id]: fallback([
      http(zgTestnet.rpcUrls.default.http[0], { retryCount: 2, retryDelay: 200 }),
      http(zgTestnet.rpcUrls.public.http[0]),
    ]),
  },
});
