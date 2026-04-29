/**
 * Wagmi configuration (standalone — no Privy wrapper).
 *
 * Privy sits on top of wagmi via its own connector flow; keeping the
 * base config in pure wagmi lets the initial page render import wagmi
 * without dragging Privy's ~330KB chunk into the critical path.
 * Privy is mounted later by `client-providers.tsx` on an idle tick.
 */

import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { fallback, http } from "viem";

import { supportedChains, zgMainnet, zgTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected()],
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
  ssr: true,
});
