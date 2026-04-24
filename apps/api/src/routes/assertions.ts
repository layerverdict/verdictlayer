import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getAssertion, listAssertions } from "../services/assertion.js";
import { listEvidenceByAssertion } from "../services/evidence.js";
import { getJudgmentQueue } from "../lib/queue.js";

const ID = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const ADDR = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const ListQuery = z.object({
  asserter: ADDR.optional(),
  outcome: z.enum(["PENDING", "TRUE", "FALSE", "INVALID", "ESCALATED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Assertion routes.
 *
 *   GET  /api/assertions                      list (filter + paginate)
 *   GET  /api/assertions/:id                  detail (includes evidence)
 *   POST /api/assertions/:id/enqueue          manually trigger judgment
 */
export const assertionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/assertions", async (req) => {
    const q = ListQuery.parse(req.query);
    const rows = await listAssertions({
      asserter: q.asserter as `0x${string}` | undefined,
      outcome: q.outcome,
      limit: q.limit,
      offset: q.offset,
    });
    return { assertions: rows };
  });

  app.get<{ Params: { id: string } }>("/api/assertions/:id", async (req, reply) => {
    const id = ID.parse(req.params.id) as `0x${string}`;
    const assertion = await getAssertion(id);
    if (!assertion) {
      return reply.code(404).send({ error: "assertion not found" });
    }
    const evidence = await listEvidenceByAssertion(id);
    return { assertion, evidence };
  });

  app.post<{ Params: { id: string } }>(
    "/api/assertions/:id/enqueue",
    async (req, reply) => {
      const id = ID.parse(req.params.id) as `0x${string}`;
      const assertion = await getAssertion(id);
      if (!assertion) {
        return reply.code(404).send({ error: "assertion not found" });
      }
      if (assertion.outcome !== "PENDING") {
        return reply
          .code(409)
          .send({ error: "assertion already resolved", outcome: assertion.outcome });
      }
      const job = await getJudgmentQueue().add(
        "judge",
        { assertionId: id },
        { jobId: `judge:${id}` },
      );
      return reply.code(202).send({ jobId: job.id });
    },
  );
};
