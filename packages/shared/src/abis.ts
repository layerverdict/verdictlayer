/**
 * ABI loader.
 *
 * Canonical ABIs are exported by `apps/contracts/scripts/export-abis.ts`
 * into `packages/shared/abis/<Name>.json`. This module provides Node-side
 * accessors; browser bundlers should import the JSON files directly (via
 * a bundler alias) so they can be tree-shaken.
 */

export const ABI_NAMES = [
  "AssertionRegistry",
  "VerdictEnforcer",
  "EscalationManager",
  "ReputationRegistry",
  "Escrow",
  "ParametricInsurance",
  "MilestoneVault",
  "AuthenticityCertifier",
  "Verifier",
] as const;

export type AbiName = (typeof ABI_NAMES)[number];

/**
 * Load one ABI at runtime. Only usable in Node. Returns `unknown[]` since
 * ethers accepts any compatible ABI fragment array.
 */
export async function loadAbi(name: AbiName): Promise<unknown[]> {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, `../abis/${name}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as unknown[];
}
