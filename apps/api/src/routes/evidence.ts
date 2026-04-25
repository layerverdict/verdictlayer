import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  attachEvidence,
  uploadAndRegister,
  listEvidenceByAssertion,
} from "../services/evidence.js";
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
 *   POST   /api/evidence                multipart upload; body fields:
 *     - file          (binary)          required
 *     - uploader      (text)            required, 0x-prefixed 20-byte hex
 *     - assertionId   (text)            optional, 0x-prefixed 32-byte hex
 *                                       (omit for pre-tx raw uploads —
 *                                        attach later with /attach)
 *     - metadata      (text)            optional, JSON string
 *
 *   POST   /api/evidence/attach          attach a raw upload to an assertion
 *     body: { rootHash, assertionId, uploader }
 *
 *   GET    /api/evidence/:assertionId    list evidence for an assertion
 *   GET    /api/evidence/verify/:root    confirm a root hash resolves
 */
export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  const UploadBody = z.object({
    // assertionId is now optional so the client can upload BEFORE the
    // on-chain tx that creates the assertion (standard flow for the
    // escrow/insurance/milestone apps). Rows without an assertion are
    // attached once the tx lands.
    assertionId: AssertionIdSchema.optional(),
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
        assertionId: fields.assertionId || undefined,
        uploader: fields.uploader,
        metadata: parsedMetadata,
      });
      if (!parsed.success) {
        drain();
        return reply.code(400).send({ error: "invalid fields", issues: parsed.error.issues });
      }

      const { assertionId, uploader, metadata } = parsed.data;

      // If an assertionId was supplied, make sure the indexer has
      // already mirrored it — otherwise the FK insert will bail with
      // a confusing Postgres error.
      if (assertionId) {
        const assertion = await getAssertion(assertionId as `0x${string}`);
        if (!assertion) {
          drain();
          return reply.code(409).send({
            error: "assertion not yet mirrored — wait for the indexer to catch up",
          });
        }
      }

      consumed = true;
      const { evidence, upload } = await uploadAndRegister({
        assertionId: (assertionId as `0x${string}` | undefined) ?? null,
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

  const AttachBody = z.object({
    rootHash: RootHashSchema,
    assertionId: AssertionIdSchema,
    uploader: AddressSchema,
  });

  app.post(
    "/api/evidence/attach",
    {
      // Evidence attach doesn't take a file, so the global 300/min is
      // too generous — a single user should never need > 30 attaches
      // per minute (two per dispute tx, at most a few disputes).
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const parsed = AttachBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
      }
      const { rootHash, assertionId, uploader } = parsed.data;

      const assertion = await getAssertion(assertionId as `0x${string}`);
      if (!assertion) {
        return reply.code(409).send({
          error: "assertion not yet mirrored — wait for the indexer to catch up",
        });
      }

      // Defence in depth: only the uploader of the raw evidence row
      // can attach it. Any mismatch yields zero rows updated, which
      // tells a would-be squatter nothing about the target assertion.
      const updated = await attachEvidence(
        rootHash as `0x${string}`,
        assertionId as `0x${string}`,
        uploader as `0x${string}`,
      );
      return reply.code(200).send({ attached: updated });
    },
  );

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
