/**
 * Verdict protocol contract addresses, sourced from NEXT_PUBLIC_* envs.
 *
 * Deployment is not yet canonical at build time — populate these once
 * `apps/contracts/scripts/deploy.ts` writes the manifest.
 */

import type { Address } from "viem";

type Name =
  | "assertionRegistry"
  | "verdictEnforcer"
  | "escalationManager"
  | "reputationRegistry"
  | "escrow"
  | "parametricInsurance"
  | "milestoneVault"
  | "authenticityCertifier"
  | "verdictUsdc";

const ENV_KEYS: Record<Name, string> = {
  assertionRegistry: "NEXT_PUBLIC_VERDICT_REGISTRY",
  verdictEnforcer: "NEXT_PUBLIC_VERDICT_ENFORCER",
  escalationManager: "NEXT_PUBLIC_ESCALATION_MANAGER",
  reputationRegistry: "NEXT_PUBLIC_REPUTATION_REGISTRY",
  escrow: "NEXT_PUBLIC_ESCROW",
  parametricInsurance: "NEXT_PUBLIC_PARAMETRIC_INSURANCE",
  milestoneVault: "NEXT_PUBLIC_MILESTONE_VAULT",
  authenticityCertifier: "NEXT_PUBLIC_AUTHENTICITY_CERTIFIER",
  verdictUsdc: "NEXT_PUBLIC_VERDICT_USDC",
};

// Inline the reads so Next.js can substitute them at build time — dynamic
// `process.env[key]` access is NOT inlined for `NEXT_PUBLIC_*` envs.
const RAW: Record<Name, string | undefined> = {
  assertionRegistry: process.env.NEXT_PUBLIC_VERDICT_REGISTRY,
  verdictEnforcer: process.env.NEXT_PUBLIC_VERDICT_ENFORCER,
  escalationManager: process.env.NEXT_PUBLIC_ESCALATION_MANAGER,
  reputationRegistry: process.env.NEXT_PUBLIC_REPUTATION_REGISTRY,
  escrow: process.env.NEXT_PUBLIC_ESCROW,
  parametricInsurance: process.env.NEXT_PUBLIC_PARAMETRIC_INSURANCE,
  milestoneVault: process.env.NEXT_PUBLIC_MILESTONE_VAULT,
  authenticityCertifier: process.env.NEXT_PUBLIC_AUTHENTICITY_CERTIFIER,
  verdictUsdc: process.env.NEXT_PUBLIC_VERDICT_USDC,
};

export function contractAddress(name: Name): Address {
  const raw = RAW[name];
  if (!raw) {
    throw new Error(
      `${ENV_KEYS[name]} not set — deploy contracts and re-export env before using '${name}'`,
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(`${ENV_KEYS[name]} is not a valid address: ${raw}`);
  }
  return raw as Address;
}

export function maybeContractAddress(name: Name): Address | undefined {
  const raw = RAW[name];
  return raw && /^0x[0-9a-fA-F]{40}$/.test(raw) ? (raw as Address) : undefined;
}
