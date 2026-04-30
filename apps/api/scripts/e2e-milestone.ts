/**
 * E2E MilestoneVault run on 0G Mainnet with demo vUSDC.
 *
 * Plays the DAO role from the deployer wallet, the grantee role from
 * a fresh wallet. Creates a 3-milestone grant, submits the first
 * milestone with evidence, waits for the TEE verdict.
 */
import { ethers } from "ethers";

import { loadAbi, loadDeployment } from "@verdict/shared";
import { config } from "../src/config.js";

const PROD_API = process.env.PROD_API ?? "https://api.verdictlayer.xyz";

async function uploadEvidence(
  uploader: string,
  text: string,
  label: string,
): Promise<`0x${string}`> {
  const form = new FormData();
  form.set("uploader", uploader);
  form.set("file", new Blob([text], { type: "text/plain" }), label);
  const res = await fetch(`${PROD_API}/api/evidence`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`evidence upload ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as {
    evidence: { rootHash: `0x${string}` };
    upload: { txHash: string };
  };
  console.log(`  evidence "${label}" root=${j.evidence.rootHash} flowTx=${j.upload.txHash}`);
  return j.evidence.rootHash;
}

async function attach(
  rootHash: string,
  assertionId: string,
  uploader: string,
): Promise<void> {
  const r = await fetch(`${PROD_API}/api/evidence/attach`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootHash, assertionId, uploader }),
  });
  console.log(`  attach ${rootHash.slice(0, 10)}: ${r.status} ${await r.text()}`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, {
    staticNetwork: true,
  });
  const dao = new ethers.Wallet(config.PRIVATE_KEY, provider);
  console.log("DAO     :", dao.address);

  const granteeKey = ethers.hexlify(ethers.randomBytes(32));
  const grantee = new ethers.Wallet(granteeKey, provider);
  console.log("GRANTEE :", grantee.address, "(fresh)");

  const manifest = await loadDeployment(config.CHAIN_ID);
  const usdcAddress = manifest.demo?.verdictUsdc;
  if (!usdcAddress) throw new Error("demo.verdictUsdc missing");
  console.log("vUSDC   :", usdcAddress);

  const vaultAbi = await loadAbi("MilestoneVault");
  const registryAbi = await loadAbi("AssertionRegistry");
  const vault = new ethers.Contract(
    manifest.contracts.milestoneVault,
    vaultAbi as ethers.InterfaceAbi,
    dao,
  );
  const registry = new ethers.Contract(
    manifest.contracts.assertionRegistry,
    registryAbi as ethers.InterfaceAbi,
    provider,
  );
  const vUsdc = new ethers.Contract(
    usdcAddress,
    [
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ],
    dao,
  );

  console.log("\n[1] Funding grantee with 0.015 0G for gas...");
  const fundTx = await dao.sendTransaction({
    to: grantee.address,
    value: ethers.parseEther("0.015"),
  });
  await fundTx.wait();
  console.log("  fund tx:", fundTx.hash);

  console.log("\n[2] approve(vault, 10 vUSDC) + createGrant()...");
  const milestones = [2n * 10n ** 6n, 3n * 10n ** 6n, 5n * 10n ** 6n];
  const total = milestones.reduce((a, b) => a + b);
  const approveTx = await (vUsdc as unknown as {
    approve: (a: string, v: bigint) => Promise<ethers.TransactionResponse>;
  }).approve(manifest.contracts.milestoneVault, total);
  await approveTx.wait();
  console.log("  approve tx:", approveTx.hash);

  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 90 * 24 * 3600);
  const createTx = await (vault as unknown as {
    createGrant: (
      g: string,
      t: string,
      amounts: bigint[],
      criteria: string[],
      exp: bigint,
    ) => Promise<ethers.TransactionResponse>;
  }).createGrant(
    grantee.address,
    usdcAddress,
    milestones,
    [
      "Milestone 1: MVP dashboard — login + listing view, Lighthouse perf > 85",
      "Milestone 2: payment integration + e2e tests covering the happy + failure paths",
      "Milestone 3: public launch + >500 MAU for 30 days",
    ],
    expiresAt,
  );
  const createRcpt = await createTx.wait();
  if (!createRcpt || createRcpt.status !== 1) throw new Error("createGrant failed");
  const created = createRcpt.logs
    .map((l) => {
      try {
        return vault.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "GrantCreated");
  if (!created) throw new Error("no GrantCreated event");
  const grantId = created.args[0] as bigint;
  console.log(`  grantId=${grantId} tx=${createRcpt.hash}`);

  console.log("\n[3] Grantee uploads milestone 1 evidence + submitMilestone()...");
  const evidenceText = [
    "MILESTONE 1 DELIVERABLE — MVP dashboard",
    "repo commit: github.com/grantee/dash#c2f7a1b",
    "deploy: https://dash.verdict.demo (staging)",
    "lighthouse mobile: perf 88, a11y 95, seo 92, bp 89",
    "coverage: auth suite 24/24 passing, listing suite 17/17 passing",
    "demo walkthrough: loom.com/share/d3f4",
    "built: 30 Apr 2026",
    "",
    "Acceptance criteria check:",
    "  'login + listing view' — IMPLEMENTED (screenshots + loom)",
    "  'Lighthouse perf > 85' — PASSED (mobile perf 88)",
  ].join("\n");
  const evidenceRoot = await uploadEvidence(
    grantee.address,
    evidenceText,
    "milestone-1.txt",
  );

  const vaultAsGrantee = vault.connect(grantee) as typeof vault;
  const bond = BigInt(manifest.bonds.milestoneVault);
  const submitTx = await (vaultAsGrantee as unknown as {
    submitMilestone: (
      id: bigint,
      idx: bigint,
      root: string,
      opts: { value: bigint },
    ) => Promise<ethers.TransactionResponse>;
  }).submitMilestone(grantId, 0n, evidenceRoot, { value: bond });
  const submitRcpt = await submitTx.wait();
  if (!submitRcpt || submitRcpt.status !== 1) throw new Error("submitMilestone failed");
  const ms = submitRcpt.logs
    .map((l) => {
      try {
        return vault.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "MilestoneSubmitted");
  if (!ms) throw new Error("no MilestoneSubmitted event");
  const assertionId = ms.args[2] as string;
  console.log(`  submit tx=${submitRcpt.hash} assertionId=${assertionId}`);

  console.log("\n[4] Attach evidence...");
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${PROD_API}/api/assertions/${assertionId}`);
    if (r.ok) {
      const body = (await r.json()) as { assertion?: unknown };
      if (body.assertion) {
        console.log(`  mirrored at +${i}s`);
        break;
      }
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  await attach(evidenceRoot, assertionId, grantee.address);

  console.log("\n[5] Watching AssertionRegistry for VerdictSubmitted (AUDITED mode, 1h window)...");
  const start = Date.now();
  let lastStatus = -1;
  while (Date.now() - start < 180_000) {
    const a = (await (registry as unknown as {
      getAssertion: (id: string) => Promise<{
        status: bigint;
        outcome: bigint;
        reasoningRoot: string;
      }>;
    }).getAssertion(assertionId)) as {
      status: bigint;
      outcome: bigint;
      reasoningRoot: string;
    };
    const s = Number(a.status);
    const o = Number(a.outcome);
    if (s !== lastStatus) {
      console.log(
        `  [+${Math.floor((Date.now() - start) / 1000)}s] status=${s} outcome=${o} reasoning=${a.reasoningRoot?.slice(0, 18)}…`,
      );
      lastStatus = s;
    }
    if (s === 1 || s === 3) {
      console.log(
        `\n  ✅ verdict submitted outcome=${o} reasoning=${a.reasoningRoot}`,
      );
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\n=== SUMMARY ===");
  console.log("grantId     :", grantId.toString());
  console.log("create tx   :", createRcpt.hash);
  console.log("submit tx   :", submitRcpt.hash);
  console.log("assertionId :", assertionId);
  console.log("evidence rt :", evidenceRoot);
  console.log(
    "release     : fires after 1h challenge window closes (or on challenge → swarm)",
  );
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
