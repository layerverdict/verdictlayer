/**
 * E2E Insurance run against 0G Mainnet.
 *
 * 1. Ensure an ACTIVE policy (create a fresh one if #1 is out of window).
 * 2. Upload claim evidence through the production API.
 * 3. Call Insurance.claim() with bond + evidence root.
 * 4. Watch AssertionCreated → VerdictSubmitted → PayoutExecuted/Rejected.
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
  const res = await fetch(`${PROD_API}/api/evidence`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`evidence upload ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    evidence: { rootHash: `0x${string}` };
    upload: { txHash: string };
  };
  console.log(
    `  evidence "${label}" → root=${json.evidence.rootHash} flowTx=${json.upload.txHash}`,
  );
  return json.evidence.rootHash;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, {
    staticNetwork: true,
  });
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  console.log("wallet :", wallet.address);
  console.log("balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "0G");

  const manifest = await loadDeployment(config.CHAIN_ID);
  const insuranceAbi = await loadAbi("ParametricInsurance");
  const registryAbi = await loadAbi("AssertionRegistry");
  const enforcerAbi = await loadAbi("VerdictEnforcer");
  const insurance = new ethers.Contract(
    manifest.contracts.parametricInsurance,
    insuranceAbi as ethers.InterfaceAbi,
    wallet,
  );
  const registry = new ethers.Contract(
    manifest.contracts.assertionRegistry,
    registryAbi as ethers.InterfaceAbi,
    provider,
  );
  const enforcer = new ethers.Contract(
    manifest.contracts.verdictEnforcer,
    enforcerAbi as ethers.InterfaceAbi,
    provider,
  );
  const bond = BigInt(manifest.bonds.insurance);

  // -------- 1. Ensure a live ACTIVE policy -----------------------------
  // Create a fresh one: 0.001 0G payout, covering next 24h, condition text.
  console.log("\n[1] Underwriting a fresh ACTIVE policy (payout 0.001 0G)...");
  const payout = ethers.parseEther("0.001");
  const now = Math.floor(Date.now() / 1000);
  const start = BigInt(now - 60); // start 60s ago so we can claim immediately
  const end = BigInt(now + 24 * 3600);
  const condition =
    "Flight AA123 delay >= 2h OR reasoning confirms delay >= 2h from evidence";
  const evidenceSpec = ethers.ZeroHash;

  const underwriteTx = await (insurance as unknown as {
    underwrite: (
      holder: string,
      premium: bigint,
      payout: bigint,
      start: bigint,
      end: bigint,
      condition: string,
      spec: string,
      opts: { value: bigint },
    ) => Promise<ethers.TransactionResponse>;
  }).underwrite(wallet.address, 0n, payout, start, end, condition, evidenceSpec, {
    value: payout,
  });
  const underwriteRcpt = await underwriteTx.wait();
  if (!underwriteRcpt || underwriteRcpt.status !== 1) throw new Error("underwrite failed");

  // Pull policyId from PolicyCreated
  const policyCreated = underwriteRcpt.logs
    .map((l) => {
      try {
        return (insurance.interface as ethers.Interface).parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "PolicyCreated");
  if (!policyCreated) throw new Error("no PolicyCreated event");
  const policyId = policyCreated.args[0] as bigint;
  console.log(`  policyId=${policyId} tx=${underwriteRcpt.hash}`);

  // -------- 2. Upload a real-world-like evidence transcript ------------
  console.log("\n[2] Uploading claim evidence to 0G Storage via production API...");
  const evidenceText = [
    "FLIGHT_STATUS snapshot captured via AviationStack",
    `carrier: AA  flight: 123  scheduled: 2026-04-30T09:00Z`,
    `actual_departure: 2026-04-30T11:47Z`,
    `delay_minutes: 167`,
    `source_url: https://api.aviationstack.com/v1/flights?flight_iata=AA123`,
    `fetched_at: ${new Date().toISOString()}`,
    "",
    "The flight left 2h 47m late, exceeding the 2h clause threshold.",
    "Payout condition: flight delay >= 2h — SATISFIED.",
  ].join("\n");
  const evidenceRoot = await uploadEvidence(
    wallet.address,
    evidenceText,
    "flight-delay-proof.txt",
  );

  // -------- 3. File the claim on-chain ---------------------------------
  console.log("\n[3] Filing claim() on mainnet...");
  const claimTx = await (insurance as unknown as {
    claim: (
      id: bigint,
      root: string,
      opts: { value: bigint },
    ) => Promise<ethers.TransactionResponse>;
  }).claim(policyId, evidenceRoot, { value: bond });
  const claimRcpt = await claimTx.wait();
  if (!claimRcpt || claimRcpt.status !== 1) throw new Error("claim failed");

  const claimOpened = claimRcpt.logs
    .map((l) => {
      try {
        return (insurance.interface as ethers.Interface).parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "ClaimOpened");
  if (!claimOpened) throw new Error("no ClaimOpened event");
  const assertionId = claimOpened.args[1] as string;
  console.log(`  claim tx=${claimRcpt.hash}`);
  console.log(`  assertionId=${assertionId}`);

  // -------- 3b. Wait for indexer mirroring, attach evidence -----------
  // Evidence was uploaded BEFORE the assertion existed, so the row has
  // assertionId=null. Attach now — otherwise the judge sees no evidence
  // and returns INVALID.
  console.log("\n[3b] Waiting for indexer + attaching evidence...");
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${PROD_API}/api/assertions/${assertionId}`);
    if (r.ok) {
      const body = (await r.json()) as { assertion?: unknown };
      if (body.assertion) {
        console.log(`  indexer mirrored at +${i * 2}s`);
        break;
      }
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  const attachRes = await fetch(`${PROD_API}/api/evidence/attach`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rootHash: evidenceRoot,
      assertionId,
      uploader: wallet.address,
    }),
  });
  const attachText = await attachRes.text();
  console.log(`  attach: ${attachRes.status} ${attachText}`);
  if (attachRes.status !== 200) throw new Error(`evidence attach failed: ${attachText}`);

  // -------- 4. Enqueue judgment + poll for verdict on-chain ------------
  console.log("\n[4] Enqueueing judgment worker...");
  const enqRes = await fetch(`${PROD_API}/api/assertions/${assertionId}/enqueue`, {
    method: "POST",
  });
  console.log(`  enqueue: ${enqRes.status} ${await enqRes.text()}`);

  console.log("  polling AssertionRegistry for VerdictSubmitted / Resolved...");
  const STATUS = { OPEN: 0, VERDICTED: 1, CHALLENGED: 2, RESOLVED: 3 } as const;
  const start_ts = Date.now();
  while (Date.now() - start_ts < 180_000) {
    const a = (await (registry as unknown as {
      getAssertion: (id: string) => Promise<{
        status: bigint;
        outcome: bigint;
        reasoningRoot: string;
      }>;
    }).getAssertion(assertionId)) as unknown as {
      status: bigint;
      outcome: bigint;
      reasoningRoot: string;
      verdictedAt: bigint;
      resolvedAt: bigint;
    };
    const s = Number(a.status ?? 0);
    const o = Number(a.outcome ?? 0);
    const rr = a.reasoningRoot ?? ethers.ZeroHash;
    process.stdout.write(
      `  [+${Math.floor((Date.now() - start_ts) / 1000)}s] status=${s} outcome=${o} reasoningRoot=${rr.slice(0, 18)}…\r`,
    );
    if (s === STATUS.RESOLVED) {
      console.log(`\n  ✅ RESOLVED  outcome=${o}  reasoning=${rr}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // -------- 5. Final summary -------------------------------------------
  console.log("\n=== SUMMARY ===");
  console.log("underwrite tx :", underwriteRcpt.hash);
  console.log("policyId      :", policyId.toString());
  console.log("evidence root :", evidenceRoot);
  console.log("claim tx      :", claimRcpt.hash);
  console.log("assertionId   :", assertionId);

  // Look for PayoutExecuted / ClaimRejected in the last ~50 blocks of Insurance
  const bn = await provider.getBlockNumber();
  const logs = await provider.getLogs({
    address: manifest.contracts.parametricInsurance,
    fromBlock: bn - 50,
    toBlock: bn,
  });
  for (const l of logs) {
    try {
      const p = insurance.interface.parseLog(l);
      if (!p) continue;
      if (p.name === "PayoutExecuted" || p.name === "ClaimRejected") {
        console.log(`  ${p.name}  tx=${l.transactionHash} args=${p.args}`);
      }
    } catch {
      /* ignore */
    }
  }

  // Also look on Enforcer for CallbackDispatched targeting our assertion
  const efLogs = await provider.getLogs({
    address: manifest.contracts.verdictEnforcer,
    fromBlock: bn - 50,
    toBlock: bn,
  });
  for (const l of efLogs) {
    try {
      const p = enforcer.interface.parseLog(l);
      if (!p) continue;
      console.log(
        `  Enforcer.${p.name} tx=${l.transactionHash} assertionId=${p.args[0] ?? ""}`,
      );
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
