/**
 * 0G Network Configuration
 * Source: /Users/selahattin/repos/0g/.0g-skills/patterns/NETWORK_CONFIG.md
 */

export const NETWORKS = {
  testnet: {
    name: "0G-Galileo-Testnet",
    chainId: 16602,
    rpcUrl: "https://evmrpc-testnet.0g.ai",
    storageIndexer: "https://indexer-storage-testnet-turbo.0g.ai",
    storageRpc: "https://storagerpc-testnet.0g.ai",
    blockExplorer: "https://chainscan-galileo.0g.ai",
    currencySymbol: "0G",
  },
  mainnet: {
    name: "0G Mainnet",
    chainId: 16661,
    rpcUrl: "https://evmrpc.0g.ai",
    storageIndexer: "https://indexer-storage-turbo.0g.ai",
    storageRpc: "https://storagerpc.0g.ai",
    blockExplorer: "https://chainscan.0g.ai",
    currencySymbol: "0G",
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;
export type NetworkConfig = (typeof NETWORKS)[NetworkName];

export function getNetwork(chainId: number): NetworkConfig {
  if (chainId === NETWORKS.testnet.chainId) return NETWORKS.testnet;
  if (chainId === NETWORKS.mainnet.chainId) return NETWORKS.mainnet;
  throw new Error(`Unknown chainId: ${chainId}`);
}

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  return `${getNetwork(chainId).blockExplorer}/tx/${txHash}`;
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
  return `${getNetwork(chainId).blockExplorer}/address/${address}`;
}
