/**
 * Evidence service — persists evidence metadata to Postgres after the
 * blob lands on 0G Storage.
 *
 * Callers:
 *   - POST /api/evidence          (multipart upload from web client)
 *   - Judgment worker             (downloads + rehydrates transcripts)
 *
 * Evidence rows are owned by an assertion; the chain indexer guarantees
 * the assertion row exists before evidence is attached.
 */

import { desc, eq } from "drizzle-orm";

import { db, schema } from "../db/client.js";
import { uploadBuffer, uploadStream, type UploadResult } from "./storage.js";

export interface RegisterEvidenceInput {
  assertionId: `0x${string}`;
  uploader: `0x${string}`;
  rootHash: `0x${string}`;
  size: number;
  mime?: string;
  metadata?: Record<string, unknown>;
}

export async function registerEvidence(input: RegisterEvidenceInput) {
  const [row] = await db
    .insert(schema.evidence)
    .values({
      assertionId: input.assertionId,
      uploader: input.uploader,
      rootHash: input.rootHash,
      size: input.size,
      mime: input.mime ?? null,
      metadata: input.metadata ?? null,
    })
    .returning();
  if (!row) throw new Error("insert evidence returned no row");
  return row;
}

export async function uploadAndRegister(
  input: Omit<RegisterEvidenceInput, "rootHash" | "size"> & {
    source: Buffer | NodeJS.ReadableStream;
    label?: string;
  },
): Promise<{ evidence: Awaited<ReturnType<typeof registerEvidence>>; upload: UploadResult }> {
  const upload = Buffer.isBuffer(input.source)
    ? await uploadBuffer(input.source, input.label ?? "evidence")
    : await uploadStream(input.source, input.label ?? "evidence");

  const evidence = await registerEvidence({
    assertionId: input.assertionId,
    uploader: input.uploader,
    rootHash: upload.rootHash,
    size: upload.size,
    mime: input.mime,
    metadata: input.metadata,
  });

  return { evidence, upload };
}

export async function listEvidenceByAssertion(assertionId: `0x${string}`) {
  return db
    .select()
    .from(schema.evidence)
    .where(eq(schema.evidence.assertionId, assertionId))
    .orderBy(desc(schema.evidence.uploadedAt));
}
