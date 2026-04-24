import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { uploadAndRegister, listEvidenceByAssertion } from "../services/evidence.js";
import { verifyRootHash } from "../services/storage.js";
import { getAssertion } from "../services/assertion.js";

const AssertionIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "assertionId must be 0x-prefixed 32-byte hex");

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "address must be 0x-prefixed 20-byte hex");

const RootHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "root hash must be 0x-prefixed 32-byte hex");

/**
 * Evidence routes.
 *
 *   POST   /api/evidence           multipart upload, body fields:
 *     - file          (binary)     required
 *     - assertionId   (text)       required, 0x-prefixed 32-byte hex
 *     - uploader      (text)       required, 0x-prefixed 20-byte hex
 *     - metadata      (text)       optional, JSON string
 *
 *   GET    /api/evidence/:assertionId   list evidence for an assertion
 *   GET    /api/evidence/verify/:root   confirm a root hash resolves
 */
export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  const UploadBody = z.object({
    assertionId: AssertionIdSchema,
    uploader: AddressSchema,
    metadata: z.record(z.unknown()).optional(),
  });

  app.post("/api/evidence", async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(415).send({ error: "multipart/form-data required" });
    }

    // `@fastify/multipart`'s `req.file()` only exposes fields parsed
    // BEFORE the file part. Clients must send the file part last.
    const mp = await req.file();
    if (!mp) {
      return reply.code(400).send({ error: "file field missing" });
    }

    const fieldsRaw = mp.fields as Record<string, { value?: unknown } | undefined>;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldsRaw)) {
      if (value && typeof value === "object" && "value" in value) {
        const v = (value as { value?: unknown }).value;
        if (typeof v === "string") fields[key] = v;
      }
    }

    // Either we consume the stream (happy path) or drain-on-reject so
    // busboy doesn't hang. This wrapper ensures drain happens exactly
    // once on any early return below.
    let consumed = false;
    const drain = () => {
      if (!consumed) {
        consumed = true;
        mp.file.resume();
      }
    };

    try {
      let parsedMetadata: Record<string, unknown> | undefined;
      if (fields.metadata) {
        try {
          const raw = JSON.parse(fields.metadata);
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            parsedMetadata = raw as Record<string, unknown>;
          } else {
            drain();
            return reply.code(400).send({ error: "metadata must be a JSON object" });
          }
        } catch {
          drain();
          return reply.code(400).send({ error: "metadata is not valid JSON" });
        }
      }

      const parsed = UploadBody.safeParse({
        assertionId: fields.assertionId,
        uploader: fields.uploader,
        metadata: parsedMetadata,
      });
      if (!parsed.success) {
        drain();
        return reply.code(400).send({ error: "invalid fields", issues: parsed.error.issues });
      }

      const { assertionId, uploader, metadata } = parsed.data;

      // FK: evidence.assertion_id references assertions.id. If the
      // indexer hasn't mirrored the AssertionCreated event yet, the
      // insert will fail — surface a 409 instead of bubbling the raw
      // Postgres error.
      const assertion = await getAssertion(assertionId as `0x${string}`);
      if (!assertion) {
        drain();
        return reply.code(409).send({
          error: "assertion not yet mirrored — wait for the indexer to catch up",
        });
      }

      consumed = true;
      const { evidence, upload } = await uploadAndRegister({
        assertionId: assertionId as `0x${string}`,
        uploader: uploader as `0x${string}`,
        mime: mp.mimetype,
        metadata,
        source: mp.file,
        label: mp.filename,
      });

      return reply.code(201).send({ evidence, upload });
    } catch (err) {
      drain();
      throw err;
    }
  });

  app.get<{ Params: { assertionId: string } }>(
    "/api/evidence/:assertionId",
    async (req) => {
      const assertionId = AssertionIdSchema.parse(req.params.assertionId);
      const rows = await listEvidenceByAssertion(assertionId as `0x${string}`);
      return { evidence: rows };
    },
  );

  app.get<{ Params: { rootHash: string } }>(
    "/api/evidence/verify/:rootHash",
    async (req) => {
      const rootHash = RootHashSchema.parse(req.params.rootHash);
      const ok = await verifyRootHash(rootHash);
      return { rootHash, verified: ok };
    },
  );
};
