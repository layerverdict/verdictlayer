/**
 * Evidence → prompt materialisation.
 *
 * Shared between the judgment and appeal services so the panel and
 * first-instance judge see identical context. Text evidence is pulled
 * inline (up to `MAX_INLINE_TEXT_BYTES`); binary evidence gets a
 * mime+size note so the judge can cite it by hash without trying to
 * read raw bytes.
 */

import { logger } from "../lib/logger.js";
import { downloadBuffer } from "./storage.js";
import type { EvidenceContext } from "./prompt.js";

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml"];
const MAX_INLINE_TEXT_BYTES = 32 * 1024;

export interface EvidenceRow {
  rootHash: string;
  mime: string | null;
  size: number | null;
  uploader: string;
}

export async function materialiseEvidence(row: EvidenceRow): Promise<EvidenceContext> {
  const rootHash = row.rootHash as `0x${string}`;
  const mime = row.mime ?? null;
  const size = row.size ?? 0;
  const uploader = row.uploader as `0x${string}`;

  const isText = mime && TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p));
  if (isText && size > 0 && size <= MAX_INLINE_TEXT_BYTES) {
    try {
      const blob = await downloadBuffer(rootHash);
      return {
        rootHash,
        mime,
        size,
        uploader,
        content: blob.buffer.toString("utf8"),
      };
    } catch (err) {
      logger.warn(
        { err, rootHash },
        "failed to materialise text evidence; falling back to hash-only",
      );
    }
  }

  return {
    rootHash,
    mime,
    size,
    uploader,
    contentNote: mime ? `${mime}, ${size} bytes` : `${size} bytes`,
  };
}

export async function materialiseAll(rows: EvidenceRow[]): Promise<EvidenceContext[]> {
  return Promise.all(rows.map((r) => materialiseEvidence(r)));
}
