import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { registerEvidence } from "../services/evidence.js";
import {
  OracleDisabledError,
  OracleNotFoundError,
  fetchAndUploadFlightSnapshot,
} from "../services/oracle-flight.js";
import { getAssertion } from "../services/assertion.js";

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "address must be 0x-prefixed 20-byte hex");

const AssertionIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "assertionId must be 0x-prefixed 32-byte hex");

/**
 * Oracle routes — external real-world data fetchers.
 *
 *   POST /api/oracle/flight
 *     body: { flightIata, flightDate, uploader, assertionId? }
 *     returns: { rootHash, snapshot, evidence }
 *
 *     Fetches AviationStack for a single flight on a single day,
 *     uploads a canonical JSON snapshot to 0G Storage, registers an
 *     evidence row, and (optionally) attaches it to an existing
 *     assertion. Returns the root hash so the caller can use it as
 *     evidenceRoot when opening an Insurance claim.
 */
export const oracleRoutes: FastifyPluginAsync = async (app) => {
  const FlightBody = z.object({
    flightIata: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => /^[A-Z0-9]{3,8}$/.test(s), {
        message: "flightIata must be 3-8 alphanumeric characters",
      }),
    flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "flightDate must be YYYY-MM-DD"),
    uploader: AddressSchema,
    assertionId: AssertionIdSchema.optional(),
  });

  app.post(
    "/api/oracle/flight",
    {
      // Tight limit: AviationStack free tier allows 100 req/mo; a
      // single UI bug shouldn't be able to drain the key.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const parsed = FlightBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
      }
      const { flightIata, flightDate, uploader, assertionId } = parsed.data;

      if (assertionId) {
        const assertion = await getAssertion(assertionId as `0x${string}`);
        if (!assertion) {
          return reply.code(409).send({
            error: "assertion not yet mirrored — wait for the indexer to catch up",
          });
        }
      }

      try {
        const result = await fetchAndUploadFlightSnapshot(flightIata, flightDate);
        const evidence = await registerEvidence({
          assertionId: (assertionId as `0x${string}` | undefined) ?? null,
          uploader: uploader as `0x${string}`,
          rootHash: result.rootHash,
          size: Buffer.byteLength(JSON.stringify(result.snapshot), "utf8"),
          mime: "application/json",
          metadata: {
            kind: "flight-oracle",
            flightIata,
            flightDate,
            delayMinutes:
              result.snapshot.departure.delayMinutes ??
              result.snapshot.arrival.delayMinutes ??
              null,
            status: result.snapshot.status,
          },
        });

        return reply.code(201).send({
          rootHash: result.rootHash,
          txHash: result.txHash,
          snapshot: result.snapshot,
          evidence,
        });
      } catch (err) {
        if (err instanceof OracleDisabledError) {
          return reply.code(503).send({ error: err.message });
        }
        if (err instanceof OracleNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );
};
