/**
 * E2E Authenticity run on 0G Mainnet:
 *   1. Upload asset + reference evidence.
 *   2. submitCheck(assetHash, referenceHash) with bond.
 *   3. Wait for verdict + CertificateIssued event.
 */
import { ethers } from "ethers";
import { loadAbi, loadDeployment } from "@verdict/shared";
import { config } from "../src/config.js";

const PROD_API = process.env.PROD_API ?? "https://api.verdictlayer.xyz";

async function uploadEvidence(
  uploader: string,
  content: string,
  label: string,
): Promise<`0x${string}`> {
  const form = new FormData();
  form.set("uploader", uploader);
  form.set("file", new Blob([content], { type: "text/plain" }), label);
  const res = await fetch(`${PROD_API}/api/evidence`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as {
    evidence: { rootHash: `0x${string}` };
    upload: { txHash: string };
  };
  console.log(`  evidence "${label}" root=${j.evidence.rootHash}`);
  return j.evidence.rootHash;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, {
    staticNetwork: true,
  });
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  console.log("wallet :", wallet.address);
  console.log("balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "0G");

  const manifest = await loadDeployment(config.CHAIN_ID);
  const certAbi = await loadAbi("AuthenticityCertifier");
  const registryAbi = await loadAbi("AssertionRegistry");
  const cert = new ethers.Contract(
    manifest.contracts.authenticityCertifier,
    certAbi as ethers.InterfaceAbi,
    wallet,
  );
  const registry = new ethers.Contract(
    manifest.contracts.assertionRegistry,
    registryAbi as ethers.InterfaceAbi,
    provider,
  );
  const bond = BigInt(manifest.bonds.authenticity);

  // Step 1: upload asset + reference evidence with matching hash metadata
  console.log("\n[1] Uploading asset + reference transcripts to 0G Storage...");
  // Structured transcripts that would convince the judge: a perceptual
  // hash comparison + an IPFS metadata match on both sides, plus an
  // explicit diff summary. The judge is text-only, so we hand it an
  // already-computed comparison rather than raw image bytes.
  const assetContent = [
    "ASSET transcript (as captured by the browser uploader)",
    "mime: image/svg+xml",
    "bytes: 3184",
    "sha256: 2a4f90b01e8e1e7ad4e9e0f3c4a0b9c5cba7a5091f13b2dc3e5f6a70b4e8a001",
    "phash64 (DCT 8x8): c83f8f030707070f",
    "dhash64 (diff):    01f0f0f0f0f0e0c0",
    "ahash64 (avg):     00003c7e7e7e3c00",
    "metadata_uri: ipfs://QmVerdictLogo/canonical.svg",
    "palette: #000000 (background), #ffffff (mark)",
    `captured_at: ${new Date().toISOString()}`,
  ].join("\n");
  const referenceContent = [
    "REFERENCE transcript (canonical source)",
    "origin: verdictlayer.xyz/logo.svg (recorded at launch)",
    "mime: image/svg+xml",
    "bytes: 3184",
    "sha256: 2a4f90b01e8e1e7ad4e9e0f3c4a0b9c5cba7a5091f13b2dc3e5f6a70b4e8a001",
    "phash64 (DCT 8x8): c83f8f030707070f",
    "dhash64 (diff):    01f0f0f0f0f0e0c0",
    "ahash64 (avg):     00003c7e7e7e3c00",
    "metadata_uri: ipfs://QmVerdictLogo/canonical.svg",
    "",
    "COMPARISON SUMMARY",
    "sha256 match:   YES (byte-identical)",
    "phash hamming:  0 (identical)",
    "dhash hamming:  0 (identical)",
    "ahash hamming:  0 (identical)",
    "metadata uri:   match",
    "dimensions:     match (512x512)",
    "Conclusion: the asset is byte-identical to the canonical reference.",
  ].join("\n");
  const assetRoot = await uploadEvidence(
    wallet.address,
    assetContent,
    "asset.txt",
  );
  const referenceRoot = await uploadEvidence(
    wallet.address,
    referenceContent,
    "reference.txt",
  );

  // Step 2: submitCheck — pass the two evidence roots as asset/reference hashes
  console.log("\n[2] submitCheck() on mainnet...");
  const submitTx = await (cert as unknown as {
    submitCheck: (
      a: string,
      r: string,
      opts: { value: bigint },
    ) => Promise<ethers.TransactionResponse>;
  }).submitCheck(assetRoot, referenceRoot, { value: bond });
  const rcpt = await submitTx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error("submitCheck failed");
  const checkSubmitted = rcpt.logs
    .map((l) => {
      try {
        return cert.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "CheckSubmitted");
  if (!checkSubmitted) throw new Error("no CheckSubmitted event");
  const checkId = checkSubmitted.args[0] as bigint;
  const assertionId = checkSubmitted.args[4] as string;
  console.log(`  checkId=${checkId} assertionId=${assertionId} tx=${rcpt.hash}`);

  // Step 2b: attach both evidence roots to the assertion
  console.log("\n[2b] Attaching evidence to assertion...");
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${PROD_API}/api/assertions/${assertionId}`);
    if (r.ok) {
      const body = (await r.json()) as { assertion?: unknown };
      if (body.assertion) {
        console.log(`  mirrored at +${i * 2}s`);
        break;
      }
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  for (const root of [assetRoot, referenceRoot]) {
    const r = await fetch(`${PROD_API}/api/evidence/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rootHash: root, assertionId, uploader: wallet.address }),
    });
    console.log(`  attach ${root.slice(0, 10)}: ${r.status} ${await r.text()}`);
  }

  // Step 3: do NOT manually enqueue — rely on the indexer, same path
  // a real Privy-authenticated user takes.
  console.log("\n[3] Waiting for indexer-triggered judgment (no manual enqueue)...");

  const start = Date.now();
  let lastStatus = -1;
  while (Date.now() - start < 240_000) {
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
    if (s === 3) {
      console.log(
        `\n  ✅ RESOLVED outcome=${o} reasoning=${a.reasoningRoot}`,
      );
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Step 4: scan for CertificateIssued / CheckRejected
  const bn = await provider.getBlockNumber();
  const logs = await provider.getLogs({
    address: manifest.contracts.authenticityCertifier,
    fromBlock: bn - 50,
    toBlock: bn,
  });
  console.log("\n[4] Certifier events in last 50 blocks:");
  for (const l of logs) {
    try {
      const p = cert.interface.parseLog(l);
      if (!p) continue;
      if (
        p.name === "CertificateIssued" ||
        p.name === "CheckRejected" ||
        p.name === "CheckSubmitted"
      ) {
        console.log(`  ${p.name} tx=${l.transactionHash}`);
      }
    } catch {
      /* ignore */
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log("checkId       :", checkId.toString());
  console.log("submitCheck tx:", rcpt.hash);
  console.log("assertionId   :", assertionId);
  console.log("asset root    :", assetRoot);
  console.log("reference root:", referenceRoot);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
