/**
 * Deploy VerdictUSDC — a demo ERC-20 used by the Escrow and
 * MilestoneVault reference apps. Reads the existing manifest at
 * packages/shared/deployments/<chainId>.json, deploys the token,
 * and appends a `demoUsdc` field to it so the frontend can
 * pre-fill the token address on the Escrow / Milestone forms.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";

const MANIFEST_DIR = resolve(__dirname, "../../../packages/shared/deployments");

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("no signer found — set PRIVATE_KEY in .env");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`deployer=${deployer.address} chainId=${chainId} network=${network.name}`);

  const factory = await ethers.getContractFactory("VerdictUSDC");
  const token = await factory.deploy(deployer.address);
  await token.waitForDeployment();
  const address = await token.getAddress();
  console.log(`VerdictUSDC deployed at ${address}`);

  // Mint the deployer 100,000 vUSDC so canned demo runs (single wallet
  // playing both client + freelancer / DAO + grantee) work without
  // first having to hit the faucet.
  const seed = 100_000n * 10n ** 6n;
  const tx = await (token as unknown as {
    mint: (to: string, amount: bigint) => Promise<{ wait: () => Promise<unknown> }>;
  }).mint(deployer.address, seed);
  await tx.wait();
  console.log(`seeded deployer with ${seed} micro-vUSDC (100,000.000000 vUSDC)`);

  // Merge into the existing manifest.
  const manifestPath = resolve(MANIFEST_DIR, `${chainId}.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(
      `manifest missing at ${manifestPath} — run the main deploy first`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    contracts: Record<string, string>;
    demo?: Record<string, string>;
  };
  manifest.demo ??= {};
  manifest.demo.verdictUsdc = address;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest updated: ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
