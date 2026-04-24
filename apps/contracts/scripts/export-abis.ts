/**
 * Extract canonical ABIs from Hardhat artifacts into
 * packages/shared/abis/<Name>.json for consumption by api + web.
 *
 * Ran as part of `pnpm --filter @verdict/contracts build` via a
 * postbuild hook so the shared package is always in sync with the
 * deployed bytecode.
 *
 * Only the ABI is written (not the bytecode) to keep the shared
 * package small and free of build artifacts that would bloat the
 * frontend bundle.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Artifact {
  abi: unknown[];
  contractName: string;
}

const ROOT = resolve(__dirname, "..");
const ARTIFACTS = resolve(ROOT, "artifacts/contracts");
const OUT = resolve(ROOT, "../../packages/shared/abis");

const targets: { file: string; name: string }[] = [
  { file: "protocol/AssertionRegistry.sol/AssertionRegistry.json", name: "AssertionRegistry" },
  { file: "protocol/VerdictEnforcer.sol/VerdictEnforcer.json", name: "VerdictEnforcer" },
  { file: "protocol/EscalationManager.sol/EscalationManager.json", name: "EscalationManager" },
  { file: "reputation/ReputationRegistry.sol/ReputationRegistry.json", name: "ReputationRegistry" },
  { file: "applications/Escrow.sol/Escrow.json", name: "Escrow" },
  { file: "applications/ParametricInsurance.sol/ParametricInsurance.json", name: "ParametricInsurance" },
  { file: "applications/MilestoneVault.sol/MilestoneVault.json", name: "MilestoneVault" },
  { file: "applications/AuthenticityCertifier.sol/AuthenticityCertifier.json", name: "AuthenticityCertifier" },
  { file: "verifiers/Verifier.sol/Verifier.json", name: "Verifier" },
];

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

for (const t of targets) {
  const path = resolve(ARTIFACTS, t.file);
  if (!existsSync(path)) {
    console.warn(`  ✗ ${t.name} — missing artifact (run 'hardhat compile')`);
    continue;
  }
  const artifact = JSON.parse(readFileSync(path, "utf8")) as Artifact;
  const outPath = resolve(OUT, `${t.name}.json`);
  writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`  ✓ ${t.name} → ${outPath}`);
}
