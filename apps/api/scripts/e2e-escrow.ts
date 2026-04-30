/**
 * E2E Escrow run on 0G Mainnet with the demo vUSDC token.
 *
 * Script plays BOTH client and freelancer from the same wallet by
 * going through three personas in sequence:
 *   1. Deployer wallet (client) funds a random freelancer wallet
 *      with a tiny amount of 0G for gas.
 *   2. Client approves vUSDC to Escrow, calls createEscrow().
 *   3. Freelancer (temp wallet, funded from deployer) uploads delivery
 *      evidence + calls deliver().
 *   4. Client uploads dispute evidence + calls openDispute().
 *   5. Freelancer responds with counter-evidence.
 *   6. Attach both evidence roots to the assertion.
 *   7. Wait 30-minute AUDITED challenge period → judgment worker
 *      submits verdict → client or freelancer gets the escrow balance.
 *
 * Because the AUDITED challenge window is 30 minutes, this driver
 * stops after verdict submission (status=VERDICTED) and prints the
 * hashes — the callback fires once the window expires (or someone
 * challenges).
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
  const client = new ethers.Wallet(config.PRIVATE_KEY, provider);
  console.log("CLIENT   :", client.address);

  // Freelancer is a fresh random wallet — we fund it with just enough
  // 0G for a couple of TXs.
  const freelancerKey = ethers.hexlify(ethers.randomBytes(32));
  const freelancer = new ethers.Wallet(freelancerKey, provider);
  console.log("FREELANCER:", freelancer.address, "(fresh wallet)");

  const manifest = await loadDeployment(config.CHAIN_ID);
  const usdcAddress = manifest.demo?.verdictUsdc;
  if (!usdcAddress) throw new Error("demo.verdictUsdc missing from manifest");
  console.log("vUSDC    :", usdcAddress);

  const escrowAbi = await loadAbi("Escrow");
  const registryAbi = await loadAbi("AssertionRegistry");
  const escrow = new ethers.Contract(
    manifest.contracts.escrow,
    escrowAbi as ethers.InterfaceAbi,
    client,
  );
  const registry = new ethers.Contract(
    manifest.contracts.assertionRegistry,
    registryAbi as ethers.InterfaceAbi,
    provider,
  );

  const vUsdc = new ethers.Contract(
    usdcAddress,
    [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)",
      "function approve(address,uint256) returns (bool)",
      "function decimals() view returns (uint8)",
    ],
    client,
  );
  const balBefore = (await (
    vUsdc as unknown as { balanceOf: (a: string) => Promise<bigint> }
  ).balanceOf(client.address)) as bigint;
  console.log("client vUSDC balance:", balBefore.toString(), "(micro)");

  // --- 1. Fund freelancer with 0.01 0G for gas --------------------
  console.log("\n[1] Funding freelancer with 0.01 0G for gas...");
  const fundTx = await client.sendTransaction({
    to: freelancer.address,
    value: ethers.parseEther("0.01"),
  });
  await fundTx.wait();
  console.log("  fund tx:", fundTx.hash);

  // --- 2. Client approves vUSDC, createEscrow ---------------------
  const escrowAmount = 5n * 10n ** 6n; // 5 vUSDC
  console.log("\n[2] approve(escrow, 5 vUSDC) + createEscrow()...");
  const approveTx = await (vUsdc as unknown as {
    approve: (a: string, v: bigint) => Promise<ethers.TransactionResponse>;
  }).approve(manifest.contracts.escrow, escrowAmount);
  await approveTx.wait();
  console.log("  approve tx:", approveTx.hash);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600); // +7d
  const scope = "Build a responsive landing page per spec (mobile first, lighthouse > 90)";
  const createTx = await (escrow as unknown as {
    createEscrow: (
      f: string,
      t: string,
      amt: bigint,
      dl: bigint,
      scope: string,
    ) => Promise<ethers.TransactionResponse>;
  }).createEscrow(freelancer.address, usdcAddress, escrowAmount, deadline, scope);
  const createRcpt = await createTx.wait();
  if (!createRcpt || createRcpt.status !== 1) throw new Error("createEscrow failed");

  const created = createRcpt.logs
    .map((l) => {
      try {
        return escrow.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "EscrowCreated");
  if (!created) throw new Error("no EscrowCreated event");
  const escrowId = created.args[0] as bigint;
  console.log(`  escrowId=${escrowId} tx=${createRcpt.hash}`);

  // --- 3. Freelancer delivers ------------------------------------
  console.log("\n[3] Freelancer uploads delivery evidence + deliver()...");
  const deliveryText = [
    "DELIVERY PACKAGE — Landing page v1",
    "repo: github.com/freelancer/landing#a3f12c8",
    "live preview: https://preview.vercel.app/landing",
    "lighthouse: perf 93, a11y 96, seo 100, best-practices 91",
    "responsive breakpoints: 320px, 480px, 768px, 1024px, 1440px",
    "built: 23 Apr 2026",
    "",
    "All acceptance criteria from the escrow scope are satisfied.",
  ].join("\n");
  const deliveryRoot = await uploadEvidence(
    freelancer.address,
    deliveryText,
    "delivery.txt",
  );
  const escrowAsFreelancer = escrow.connect(freelancer) as typeof escrow;
  const deliverTx = await (escrowAsFreelancer as unknown as {
    deliver: (id: bigint, root: string) => Promise<ethers.TransactionResponse>;
  }).deliver(escrowId, deliveryRoot);
  const deliverRcpt = await deliverTx.wait();
  if (!deliverRcpt || deliverRcpt.status !== 1) throw new Error("deliver failed");
  console.log(`  deliver tx=${deliverRcpt.hash}`);

  // --- 4. Client opens dispute ----------------------------------
  console.log("\n[4] Client opens dispute with counter-evidence...");
  const disputeText = [
    "CLIENT DISPUTE — mobile layout broken",
    "url tested: https://preview.vercel.app/landing",
    "device: iPhone 14 Pro (Chrome 130)",
    "issue: hero image overflows viewport at 390px, CTA button stacks below fold",
    "screenshots: uploaded ipfs://QmMobileScreenshot",
    "requested remediation: fix viewport meta + hero max-width.",
  ].join("\n");
  const disputeRoot = await uploadEvidence(
    client.address,
    disputeText,
    "dispute.txt",
  );
  const bond = BigInt(manifest.bonds.escrow);
  const disputeTx = await (escrow as unknown as {
    openDispute: (
      id: bigint,
      root: string,
      opts: { value: bigint },
    ) => Promise<ethers.TransactionResponse>;
  }).openDispute(escrowId, disputeRoot, { value: bond });
  const disputeRcpt = await disputeTx.wait();
  if (!disputeRcpt || disputeRcpt.status !== 1) throw new Error("openDispute failed");
  const disputeOpened = disputeRcpt.logs
    .map((l) => {
      try {
        return escrow.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "DisputeOpened");
  if (!disputeOpened) throw new Error("no DisputeOpened event");
  const assertionId = disputeOpened.args[1] as string;
  console.log(`  dispute tx=${disputeRcpt.hash} assertionId=${assertionId}`);

  // --- 5. Attach evidence immediately (before the judgment worker
  //         races us to the TEE). The contract surfaces only delivery
  //         + dispute roots right now, so attach those first so
  //         expectedRootCount == attached count.
  console.log("\n[5] Attaching evidence roots…");
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
  await attach(deliveryRoot, assertionId, freelancer.address);
  await attach(disputeRoot, assertionId, client.address);

  // --- 6. Freelancer responds (adds a third root; attach too) ----
  console.log("\n[6] Freelancer responds with source proof...");
  const responseText = [
    "FREELANCER RESPONSE — root cause analysis",
    "repo diff: viewport meta present in HEAD (line 6 of index.html)",
    "mobile breakpoint tested by CI: 320px, 375px, 390px, 414px — all pass",
    "hero image: uses clamp(240px, 60vw, 480px); no viewport overflow detected",
    "",
    "Hypothesis: client tested against a stale deploy (pre-a3f12c8).",
    "Current deploy URL: https://preview.vercel.app/landing?v=a3f12c8 — not broken.",
  ].join("\n");
  const responseRoot = await uploadEvidence(
    freelancer.address,
    responseText,
    "response.txt",
  );
  const respondTx = await (escrowAsFreelancer as unknown as {
    respondToDispute: (id: bigint, root: string) => Promise<ethers.TransactionResponse>;
  }).respondToDispute(escrowId, responseRoot);
  const respondRcpt = await respondTx.wait();
  if (!respondRcpt || respondRcpt.status !== 1) throw new Error("respondToDispute failed");
  console.log(`  respond tx=${respondRcpt.hash}`);
  await attach(responseRoot, assertionId, freelancer.address);

  // --- 7. Wait for verdict (worker auto-enqueued) ---------------
  console.log("\n[7] Watching AssertionRegistry for VerdictSubmitted (AUDITED mode)...");
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
    if (s === 1 /* VERDICTED */ || s === 3 /* RESOLVED */) {
      console.log(
        `\n  ✅ Verdict submitted outcome=${o} reasoning=${a.reasoningRoot}`,
      );
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\n=== SUMMARY ===");
  console.log("escrowId         :", escrowId.toString());
  console.log("create tx        :", createRcpt.hash);
  console.log("deliver tx       :", deliverRcpt.hash);
  console.log("dispute tx       :", disputeRcpt.hash);
  console.log("respond tx       :", respondRcpt.hash);
  console.log("assertionId      :", assertionId);
  console.log("delivery root    :", deliveryRoot);
  console.log("dispute root     :", disputeRoot);
  console.log("response root    :", responseRoot);
  console.log(
    "challenge window : 30 minutes (AUDITED); callback fires after it closes",
  );
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
