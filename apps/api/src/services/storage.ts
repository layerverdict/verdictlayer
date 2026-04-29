/**
 * Storage service — uploads evidence + reasoning docs to 0G Storage.
 *
 * Why we don't just call `indexer.upload()` directly: the 0G mainnet
 * Flow contract was upgraded to a new `submit` ABI that wraps the
 * old `Submission` struct inside `{ data, submitter }`, changing the
 * function selector from 0xef3e12dc → 0xbc8c11f8. @0glabs/0g-ts-sdk
 * 0.3.3 (current latest on npm) still sends the old selector, which
 * the upgraded Flow rejects with `require(false)` and empty revert
 * data — hence the "Failed to submit transaction: execution reverted
 * (require(false))" error we hit in production.
 *
 * Fix: submit the TX ourselves with the new ABI, then hand the file
 * to the SDK with `skipTx=true` so it just performs segment upload +
 * finality wait. Segment upload, merkle tree, and downloader code
 * paths in the SDK are untouched by the Flow ABI change, so reusing
 * them is safe.
 *
 * Reference: skills/storage/upload-file/SKILL.md +
 *            skills/storage/download-file/SKILL.md
 */

import { createWriteStream, promises as fsp } from "node:fs";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";

import { config } from "../config.js";
import { getProvider, getSigner } from "./../lib/chain.js";
import { logger } from "../lib/logger.js";

let cachedIndexer: Indexer | undefined;

// Minimal Flow ABI, updated for the mainnet Submission-with-submitter
// shape. Selector keccak256(submit(((uint256,bytes,(bytes32,uint256)[]),address)))
// = 0xbc8c11f8 — verified against a successful on-chain TX.
const FLOW_SUBMIT_ABI = [
  "function market() view returns (address)",
  "function submit(((uint256 length, bytes tags, (bytes32 root, uint256 height)[] nodes) data, address submitter)) payable returns (uint256, bytes32)",
];
const MARKET_ABI = ["function pricePerSector() view returns (uint256)"];

// The Flow contract address the SDK would pick comes from the storage
// node's self-reported networkIdentity. Cached per indexer URL.
let cachedFlowAddress: string | undefined;
async function resolveFlowAddress(): Promise<string> {
  if (cachedFlowAddress) return cachedFlowAddress;
  const sharded = await (getIndexer() as unknown as {
    getShardedNodes: () => Promise<{ trusted: { url: string }[] }>;
  }).getShardedNodes();
  const firstNode = sharded.trusted?.[0];
  if (!firstNode) {
    throw new Error("storage indexer returned no trusted nodes");
  }
  const res = await fetch(firstNode.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "zgs_getStatus",
      params: [],
    }),
  });
  const json = (await res.json()) as {
    result?: { networkIdentity?: { flowAddress?: string } };
  };
  const flow = json.result?.networkIdentity?.flowAddress;
  if (!flow) throw new Error("storage node did not report a flowAddress");
  cachedFlowAddress = ethers.getAddress(flow);
  return cachedFlowAddress;
}

export function getIndexer(): Indexer {
  if (!cachedIndexer) {
    cachedIndexer = new Indexer(config.STORAGE_INDEXER);
  }
  return cachedIndexer;
}

/**
 * Labels become part of the temp file name. Sanitise to alphanumerics
 * + dot/dash/underscore so user-controlled values (filenames, custom
 * labels) can't escape `os.tmpdir()` via `../`.
 */
export function sanitiseLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "blob";
}

export interface UploadResult {
  rootHash: `0x${string}`;
  txHash: string;
  size: number;
}

export interface StoredBlob {
  buffer: Buffer;
  size: number;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — plan Risk matrix cap

/**
 * Upload an in-memory buffer to 0G Storage.
 *
 * Writes to a unique temp file so concurrent uploads don't collide, then
 * cleans up the temp file after the handle is closed.
 */
export async function uploadBuffer(data: Buffer, label = "blob"): Promise<UploadResult> {
  if (data.length === 0) throw new Error("cannot upload empty buffer");
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new Error(`payload too large: ${data.length} bytes (max ${MAX_UPLOAD_BYTES})`);
  }

  const tempPath = join(
    tmpdir(),
    `verdict-${sanitiseLabel(label)}-${Date.now()}-${randomUUID()}.bin`,
  );
  await fsp.writeFile(tempPath, data);

  try {
    return await uploadPath(tempPath);
  } finally {
    try {
      await fsp.unlink(tempPath);
    } catch (err) {
      logger.warn({ err, tempPath }, "failed to clean up upload temp file");
    }
  }
}

/**
 * Upload an existing file. Caller owns the file lifecycle — we don't
 * delete it.
 *
 * Flow:
 *   1. Merkle-tree the file + build the old-shape Submission.
 *   2. Submit on-chain ourselves using the new Flow ABI (adds
 *      `submitter` to the tuple) — the SDK's own submitter targets
 *      the pre-upgrade ABI and reverts on mainnet.
 *   3. Hand the file to the SDK with `skipTx=true` so it picks up
 *      our tx via `findExistingFileInfo(rootHash)` and uploads
 *      segments + waits for finality.
 */
export async function uploadPath(path: string): Promise<UploadResult> {
  const stats = await fsp.stat(path);
  if (stats.size === 0) throw new Error("cannot upload empty file");

  const file = await ZgFile.fromFilePath(path);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`merkle tree failed: ${treeErr}`);
    const rootHash = tree?.rootHash();
    if (!rootHash) throw new Error("merkle tree produced no root hash");

    const [submission, submissionErr] = await file.createSubmission("0x");
    if (submissionErr || !submission) {
      throw new Error(`createSubmission failed: ${submissionErr ?? "null"}`);
    }

    const signer = getSigner();
    const flowAddress = await resolveFlowAddress();
    const flow = new ethers.Contract(flowAddress, FLOW_SUBMIT_ABI, signer);

    let pricePerSector: bigint;
    try {
      const marketAddr = (await flow.getFunction("market").staticCall()) as string;
      const market = new ethers.Contract(marketAddr, MARKET_ABI, getProvider());
      pricePerSector = (await market
        .getFunction("pricePerSector")
        .staticCall()) as bigint;
    } catch (err) {
      throw new Error(
        `failed to read Flow market / pricePerSector: ${(err as Error).message}`,
      );
    }

    let sectors = 0;
    for (const node of submission.nodes) {
      sectors += 1 << Number(node.height.toString());
    }
    const fee = BigInt(sectors) * pricePerSector;

    const submissionTuple = {
      data: {
        length: BigInt(submission.length.toString()),
        tags: submission.tags ?? "0x",
        nodes: submission.nodes.map((n) => ({
          root: n.root,
          height: BigInt(n.height.toString()),
        })),
      },
      submitter: signer.address,
    };

    let txHash: string;
    try {
      const resp = await flow
        .getFunction("submit")
        .send(submissionTuple, { value: fee });
      const receipt = await resp.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(
          `Flow.submit receipt not successful (status=${receipt?.status})`,
        );
      }
      txHash = receipt.hash;
    } catch (err) {
      throw new Error(`Flow.submit failed: ${(err as Error).message}`);
    }

    // Hand the file to the SDK uploader with skipTx=true — it will
    // find our on-chain entry via getFileInfo(rootHash) and proceed
    // straight to segment upload + finality wait.
    const [, uploadErr] = await getIndexer().upload(
      file,
      config.RPC_URL,
      signer as unknown as Parameters<typeof Indexer.prototype.upload>[2],
      {
        tags: "0x",
        finalityRequired: true,
        taskSize: 10,
        expectedReplica: 1,
        skipTx: true,
        fee: 0n,
      },
    );
    if (uploadErr) {
      throw new Error(
        `segment upload failed after on-chain submit ${txHash}: ${uploadErr.message ?? uploadErr}`,
      );
    }

    return {
      rootHash: rootHash as `0x${string}`,
      txHash,
      size: stats.size,
    };
  } finally {
    try {
      await file.close();
    } catch (err) {
      // Swallow close errors so the original upload outcome isn't masked
      // by a teardown failure; still log so stalls are visible.
      logger.warn({ err, path }, "ZgFile close failed");
    }
  }
}

/**
 * Download a root hash into memory. Uses verified mode (merkle proof).
 */
export async function downloadBuffer(rootHash: string): Promise<StoredBlob> {
  validateRootHash(rootHash);

  // os.tmpdir() always exists; no need to mkdir / existsSync.
  const tempPath = join(tmpdir(), `verdict-dl-${Date.now()}-${randomUUID()}.bin`);

  try {
    // indexer.download can both THROW and return an error — guard both.
    const err = await getIndexer().download(rootHash, tempPath, true);
    if (err) throw err;
  } catch (err) {
    throw new Error(`download failed for ${rootHash}: ${(err as Error).message ?? err}`);
  }

  try {
    const buffer = await fsp.readFile(tempPath);
    return { buffer, size: buffer.length };
  } finally {
    try {
      await fsp.unlink(tempPath);
    } catch {
      // temp file already gone — ignore
    }
  }
}

/**
 * Verify-only: download and discard, confirming the root hash resolves
 * and the merkle proof verifies.
 */
export async function verifyRootHash(rootHash: string): Promise<boolean> {
  try {
    await downloadBuffer(rootHash);
    return true;
  } catch (err) {
    logger.warn({ err, rootHash }, "root hash verification failed");
    return false;
  }
}

/**
 * Streaming upload helper — for large evidence files coming in via
 * multipart. Writes the request stream to a temp file, then uploads.
 */
export async function uploadStream(
  source: NodeJS.ReadableStream,
  label = "stream",
): Promise<UploadResult> {
  const tempPath = join(
    tmpdir(),
    `verdict-${sanitiseLabel(label)}-${Date.now()}-${randomUUID()}.bin`,
  );
  let wrote = false;
  try {
    await pipeline(source, createWriteStream(tempPath));
    wrote = true;
    return await uploadPath(tempPath);
  } finally {
    // If pipeline() threw before any byte reached disk, `unlink` may
    // still succeed (createWriteStream creates the file eagerly). Try
    // it either way; ignore missing-file errors.
    try {
      await fsp.unlink(tempPath);
    } catch (err) {
      if (wrote) {
        logger.warn({ err, tempPath }, "failed to clean up stream temp file");
      }
    }
  }
}

function validateRootHash(rootHash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(rootHash)) {
    throw new Error(`invalid root hash: ${rootHash}`);
  }
}
