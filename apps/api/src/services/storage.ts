/**
 * Storage service — thin wrapper over `@0glabs/0g-ts-sdk` Indexer.
 *
 * All evidence and reasoning documents flow through here. The SDK
 * expects a file path, so buffers are written to a temp file, uploaded,
 * and cleaned up in a `finally` block.
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

import { config } from "../config.js";
import { getSigner } from "./../lib/chain.js";
import { logger } from "../lib/logger.js";

let cachedIndexer: Indexer | undefined;

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

    // 0G SDK's CJS types expose a different ethers Signer symbol than
    // our ESM ethers.Wallet even though both point at the same runtime
    // module — cast through unknown to bridge the nominal mismatch.
    const [tx, uploadErr] = await getIndexer().upload(
      file,
      config.RPC_URL,
      getSigner() as unknown as Parameters<typeof Indexer.prototype.upload>[2],
    );
    if (uploadErr) throw new Error(`upload failed: ${uploadErr.message ?? uploadErr}`);

    return {
      rootHash: rootHash as `0x${string}`,
      txHash: String(tx),
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
