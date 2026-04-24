/**
 * 0G Compute broker loader.
 *
 * Why `createRequire`:
 *   `@0glabs/0g-serving-broker@0.6.x` ships a broken ESM build — one of
 *   its internal chunks (`lib.esm/index-*.js`) uses ESM `import`/`export`
 *   syntax but the package has no `"type": "module"`, so Node parses it
 *   as CJS and throws `SyntaxError: does not provide an export named
 *   'C'`. The CJS build (`lib.commonjs/index.js`) is fine, so we bypass
 *   module resolution and require() it directly.
 *
 *   The same workaround is used in `scripts/validate-tee.cts` (via a
 *   `.cts` extension). We can't do that here because the API is
 *   otherwise pure ESM, so we drop to CJS only at this boundary.
 */

import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);

// The broker module has no .d.ts shipped for CJS; type its surface as
// permissively as we need to consume it, but narrow at call sites.
export interface BrokerSDK {
  createZGComputeNetworkBroker: (signer: unknown) => Promise<ZGComputeBroker>;
}

export interface ZGComputeBroker {
  inference: InferenceBroker;
  ledger: LedgerBroker;
}

export interface InferenceBroker {
  listService: () => Promise<ServiceTuple[]>;
  acknowledgeProviderSigner: (providerAddress: string) => Promise<void>;
  getServiceMetadata: (providerAddress: string) => Promise<{ endpoint: string; model: string }>;
  getRequestHeaders: (providerAddress: string) => Promise<Record<string, string>>;
  processResponse: (
    providerAddress: string,
    chatId: string,
    usage: string,
  ) => Promise<void>;
}

export interface LedgerBroker {
  getLedger: () => Promise<LedgerTuple>;
  addLedger: (amount: number) => Promise<void>;
  depositFund: (amount: number) => Promise<void>;
}

export type ServiceTuple = [
  providerAddress: string,
  serviceType: string,
  url: string,
  inputPrice: bigint,
  outputPrice: bigint,
  updatedAt: bigint,
  model: string,
  verifiability: string,
  salt: string,
  expiry: bigint,
  teeVerified: boolean,
];

export type LedgerTuple = [
  user: string,
  totalBalance: bigint,
  availableBalance: bigint,
  ...unknown[],
];

let cached: BrokerSDK | undefined;

export function loadBrokerSDK(): BrokerSDK {
  if (!cached) {
    cached = cjsRequire("@0glabs/0g-serving-broker") as BrokerSDK;
  }
  return cached;
}
