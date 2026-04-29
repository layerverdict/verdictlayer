/**
 * Viem chain definitions for 0G.
 *
 * Mirrors `@verdict/shared/network` but rendered as viem `Chain` objects so
 * wagmi can consume them. Keep in sync with `packages/shared/src/network.ts`.
 */

import type { Chain } from "viem";

export const zgMainnet = {
  id: 16661,
  name: "0G Mainnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://evmrpc.0g.ai"] },
    public: { http: ["https://evmrpc.0g.ai"] },
  },
  blockExplorers: {
    default: { name: "0G Chain Scan", url: "https://chainscan.0g.ai" },
  },
} as const satisfies Chain;

export const supportedChains = [zgMainnet] as const;

export function chainFor(chainId: number): Chain {
  if (chainId === zgMainnet.id) return zgMainnet;
  throw new Error(`unsupported chainId: ${chainId}`);
}

export function explorerTx(chainId: number, hash: string): string {
  return `${chainFor(chainId).blockExplorers!.default.url}/tx/${hash}`;
}

export function explorerAddress(chainId: number, address: string): string {
  return `${chainFor(chainId).blockExplorers!.default.url}/address/${address}`;
}
