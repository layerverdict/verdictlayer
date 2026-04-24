import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { eventBus, type VerdictEvent } from "../lib/events.js";
import { getAssertion } from "../services/assertion.js";

const ID = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

/**
 * Verdict SSE stream.
 *
 *   GET /api/verdict/:id/stream
 *
 * Client-Streamed events:
 *   - `status`   state transitions (loading / inference / submit / ...)
 *   - `token`    one reasoning token (for ReasoningStream typewriter)
 *   - `outcome`  final JudgeDecision + verdictTx
 *   - `error`    failure notice
 *   - `done`     end of stream
 *
 * The judgment worker publishes events to `eventBus`; this handler
 * subscribes and formats them as SSE frames.
 */
export const verdictRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/api/verdict/:id/stream", async (req, reply) => {
    const id = ID.parse(req.params.id);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    reply.raw.flushHeaders?.();

    const write = (frame: string) => {
      reply.raw.write(frame);
    };

    write(`retry: 3000\n\n`);

    let heartbeat: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
      unsubscribe();
    };

    const unsubscribe = eventBus.subscribe(id, (event: VerdictEvent) => {
      write(
        `event: ${event.kind}\n` +
          `data: ${JSON.stringify({ payload: event.payload, ts: event.ts })}\n\n`,
      );
      if (event.kind === "done" || event.kind === "error") {
        cleanup();
        reply.raw.end();
      }
    });

    heartbeat = setInterval(() => {
      write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);

    req.raw.on("close", cleanup);

    // If the assertion is already resolved, replay the final state and
    // close the stream — no inference job will ever publish to this id.
    const assertion = await getAssertion(id as `0x${string}`);
    if (assertion && assertion.outcome !== "PENDING") {
      write(
        `event: outcome\n` +
          `data: ${JSON.stringify({
            payload: {
              assertionId: id,
              outcome: assertion.outcome,
              reasoningRoot: assertion.reasoningRoot,
              verdictTx: assertion.verdictTx,
              resolvedAt: assertion.resolvedAt,
              replay: true,
            },
            ts: Date.now(),
          })}\n\n`,
      );
      write(`event: done\ndata: ${JSON.stringify({ ts: Date.now(), replay: true })}\n\n`);
      cleanup();
      reply.raw.end();
    }

    // Prevent fastify from auto-ending the response.
    return reply;
  });
};
