/**
 * Deployment manifest loader.
 *
 * `apps/contracts/scripts/deploy.ts` writes a per-chainId JSON file here:
 *
 *   packages/shared/deployments/<chainId>.json
 *
 * At runtime, api + web import this module to resolve contract addresses
 * for the chain they're targeting. Manifests are checked into git because
 * they are the canonical source for the frontend/backend wiring.
 */

import type { Address } from "./types.js";

export interface DeploymentManifest {
  chainId: number;
  network: string;
  deployedAt: string;
  deployer: Address;
  judgeRelayer: Address;
  feeSink: Address;
  bonds: {
    escrow: string;
    insurance: string;
    milestoneVault: string;
    authenticity: string;
  };
  contracts: {
    verifier: Address;
    reputationRegistry: Address;
    assertionRegistry: Address;
    verdictEnforcer: Address;
    escalationManager: Address;
    escrow: Address;
    parametricInsurance: Address;
    milestoneVault: Address;
    authenticityCertifier: Address;
  };
}

/**
 * Load the deployment manifest for a given chainId.
 *
 * Callers are expected to supply the manifest content — this keeps the
 * package free of Node fs dependencies so it also works in a browser
 * bundle where manifests are imported as JSON at build time.
 */
export function parseDeployment(raw: unknown): DeploymentManifest {
  if (raw == null || typeof raw !== "object") {
    throw new Error("Invalid deployment manifest: expected object");
  }
  const m = raw as Record<string, unknown>;
  const required = [
    "chainId",
    "network",
    "deployedAt",
    "deployer",
    "judgeRelayer",
    "feeSink",
    "bonds",
    "contracts",
  ] as const;
  for (const key of required) {
    if (!(key in m)) {
      throw new Error(`Invalid deployment manifest: missing '${key}'`);
    }
  }
  return m as unknown as DeploymentManifest;
}

/**
 * Convenience: node-side loader.
 *
 * `readFileSync` usage is kept behind a function so browser bundlers
 * never see it unless explicitly imported.
 */
export async function loadDeployment(chainId: number): Promise<DeploymentManifest> {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, `../deployments/${chainId}.json`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return parseDeployment(raw);
}
