/**
 * Smoke-test: upload a small file to 0G Storage via the production
 * `uploadBuffer` path, then download + verify. Confirms the custom
 * submit shim in services/storage.ts is actually working against
 * the live mainnet Flow contract.
 *
 * Usage:
 *   set -a && source .env && set +a
 *   pnpm tsx scripts/storage-upload-poc.ts
 */
import "../src/config.js";
import { uploadBuffer, downloadBuffer } from "../src/services/storage.js";

async function main() {
  const payload = Buffer.from(
    `verdict layer storage smoke test ${new Date().toISOString()}\n`.repeat(16),
    "utf8",
  );
  console.log("uploading", payload.length, "bytes...");
  const res = await uploadBuffer(payload, "smoke-test");
  console.log("upload OK:");
  console.log("  root:", res.rootHash);
  console.log("  tx  :", res.txHash);
  console.log("  size:", res.size);

  console.log("downloading back...");
  const back = await downloadBuffer(res.rootHash);
  const match = back.buffer.equals(payload);
  console.log("round-trip size:", back.size, "match:", match);
  if (!match) {
    throw new Error("round-trip mismatch");
  }
  console.log("✅ storage round-trip verified");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
