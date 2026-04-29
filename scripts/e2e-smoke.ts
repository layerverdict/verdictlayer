/**
 * End-to-end smoke test against the live deployment.
 *
 * Submits a single Authenticity check with two fake hashes (same bytes)
 * so the TEE judge has an obvious TRUE path. Watches the on-chain
 * lifecycle and prints each event as it lands.
 *
 * Assumes:
 *   - /srv/verdict/app/.env has PRIVATE_KEY + RPC_URL + contract envs
 *   - the api + indexer + judgment worker are running on the same box
 *
 * Run: `tsx scripts/e2e-smoke.ts`
 */

import "dotenv/config";

import { ethers } from "ethers";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = requireEnv("RPC_URL");
const PRIVATE_KEY = requireEnv("PRIVATE_KEY");
const CHAIN_ID = Number(requireEnv("CHAIN_ID"));
const MANIFEST_PATH = resolve(
  __dirname,
  `../packages/shared/deployments/${CHAIN_ID}.json`,
);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function loadAbi(name: string): Promise<unknown[]> {
  const raw = await readFile(
    resolve(__dirname, `../packages/shared/abis/${name}.json`),
    "utf8",
  );
  return JSON.parse(raw);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, {
    staticNetwork: true,
  });
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log(`wallet  : ${wallet.address}`);
  console.log(`balance : ${ethers.formatEther(bal)} 0G`);
  if (bal < ethers.parseEther("0.005")) {
    throw new Error(
      "wallet has < 0.005 0G — run top-up from the Galileo faucet first",
    );
  }

  const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw) as {
    contracts: Record<string, string>;
  };
  const certifierAddr = manifest.contracts.authenticityCertifier;
  if (!certifierAddr) throw new Error("manifest missing AuthenticityCertifier");
  console.log(`certifier: ${certifierAddr}`);

  const [certAbi, registryAbi] = await Promise.all([
    loadAbi("AuthenticityCertifier"),
    loadAbi("AssertionRegistry"),
  ]);

  const cert = new ethers.Contract(
    certifierAddr,
    certAbi as ethers.InterfaceAbi,
    wallet,
  );
  const registry = new ethers.Contract(
    manifest.contracts.assertionRegistry,
    registryAbi as ethers.InterfaceAbi,
    provider,
  );

  const bond = (await cert.assertionBond()) as bigint;
  console.log(`bond    : ${ethers.formatEther(bond)} 0G`);

  // Same hash for both asset + reference — the canonical "TRUE" case
  // for the vision judge. If the judge says FALSE on this, something
  // is wrong with the transcript or provider selection.
  const assetHash = ethers.keccak256(ethers.toUtf8Bytes("verdict-e2e-asset"));
  const referenceHash = assetHash; // same
  console.log(`asset   : ${assetHash}`);
  console.log(`reference (identical): ${referenceHash}`);

  console.log("\n[1/4] submitCheck() …");
  const submitTx = (await cert.submitCheck(assetHash, referenceHash, {
    value: bond,
  })) as ethers.ContractTransactionResponse;
  console.log(`       tx: ${submitTx.hash}`);
  const submitRcpt = await submitTx.wait();
  if (!submitRcpt) throw new Error("submit receipt missing");
  console.log(`       mined in block ${submitRcpt.blockNumber}`);

  // Parse CheckSubmitted for the assertionId.
  let checkId: bigint | undefined;
  let assertionId: string | undefined;
  for (const log of submitRcpt.logs) {
    try {
      const parsed = cert.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed?.name === "CheckSubmitted") {
        checkId = parsed.args[0] as bigint;
        assertionId = parsed.args[4] as string;
        break;
      }
    } catch {
      // skip
    }
  }
  if (!checkId || !assertionId) throw new Error("CheckSubmitted not found");
  console.log(`       checkId: ${checkId}`);
  console.log(`       assertionId: ${assertionId}`);

  console.log("\n[2/4] waiting for judgment worker to submit a verdict …");
  const verdictDeadline = Date.now() + 120_000;
  let onchain = (await registry.getAssertion(assertionId)) as {
    status: number;
    outcome: number;
  };
  while (Date.now() < verdictDeadline && onchain.status === 0) {
    await sleep(3000);
    onchain = (await registry.getAssertion(assertionId)) as {
      status: number;
      outcome: number;
    };
    process.stdout.write(".");
  }
  console.log("");
  if (onchain.status === 0) {
    throw new Error(
      "timeout: no verdict landed in 120s — inspect verdict-api logs",
    );
  }

  console.log(
    `       status: ${statusName(onchain.status)}  outcome: ${outcomeName(onchain.outcome)}`,
  );

  console.log("\n[3/4] checking callback fired on certifier …");
  const check = (await cert.getCheck(checkId)) as {
    status: number;
    reasoningRoot: string;
  };
  console.log(`       check.status: ${checkStatusName(check.status)}`);
  console.log(`       reasoningRoot: ${check.reasoningRoot}`);

  console.log("\n[4/4] final wallet balance …");
  const finalBal = await provider.getBalance(wallet.address);
  console.log(
    `       before ${ethers.formatEther(bal)} 0G → after ${ethers.formatEther(finalBal)} 0G`,
  );

  if (check.status === 2) {
    console.log("\n✓ E2E smoke passed — certificate issued.");
  } else if (check.status === 3) {
    console.log("\n✗ E2E smoke: judge rejected identical hashes (unexpected).");
    process.exit(1);
  } else {
    console.log(`\n? E2E smoke: unexpected status ${check.status}`);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function statusName(n: number): string {
  return (
    { 0: "OPEN", 1: "VERDICTED", 2: "CHALLENGED", 3: "RESOLVED" }[n] ??
    String(n)
  );
}
function outcomeName(n: number): string {
  return (
    { 0: "PENDING", 1: "TRUE", 2: "FALSE", 3: "INVALID", 4: "ESCALATED" }[n] ??
    String(n)
  );
}
function checkStatusName(n: number): string {
  return (
    { 0: "NONE", 1: "PENDING", 2: "CERTIFIED", 3: "REJECTED" }[n] ?? String(n)
  );
}

main().catch((err) => {
  console.error("\n✗ E2E smoke failed:", err.message ?? err);
  process.exit(1);
});
