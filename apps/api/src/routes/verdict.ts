import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { eventBus, type VerdictEvent } from "../lib/events.js";
import { getAssertion } from "../services/assertion.js";
import { db, schema } from "../db/client.js";

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

    // `closed` guards against writes landing after we've ended the
    // response — happens when the worker emits `done` concurrently
    // with the replay-from-db path below, or the client disconnects
    // mid-frame. `reply.raw.write()` throws "write after end" otherwise.
    let closed = false;
    let heartbeat: NodeJS.Timeout | undefined;

    const write = (frame: string) => {
      if (closed) return;
      reply.raw.write(frame);
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
      unsubscribe();
    };

    const endStream = () => {
      cleanup();
      try {
        reply.raw.end();
      } catch {
        // socket already gone — fine.
      }
    };

    write(`retry: 3000\n\n`);

    const unsubscribe = eventBus.subscribe(id, (event: VerdictEvent) => {
      if (closed) return;
      write(
        `event: ${event.kind}\n` +
          `data: ${JSON.stringify({ payload: event.payload, ts: event.ts })}\n\n`,
      );
      if (event.kind === "done" || event.kind === "error") {
        endStream();
      }
    });

    heartbeat = setInterval(() => {
      write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);

    req.raw.on("close", cleanup);

    // If the assertion is already resolved, replay the final state and
    // close the stream — no inference job will ever publish to this id.
    // Do this AFTER registering the live subscription so a concurrent
    // worker write can't race us — if worker already ended the stream,
    // `closed` short-circuits the replay writes.
    const assertion = await getAssertion(id as `0x${string}`);
    if (!closed && assertion && assertion.outcome !== "PENDING") {
      // Pull the latest reasoning log so the replay payload carries the
      // confidence / chatId that the UI renders as extra trust proof.
      const [log] = await db
        .select()
        .from(schema.reasoningLogs)
        .where(eq(schema.reasoningLogs.assertionId, id as `0x${string}`))
        .orderBy(desc(schema.reasoningLogs.createdAt))
        .limit(1);

      write(
        `event: outcome\n` +
          `data: ${JSON.stringify({
            payload: {
              assertionId: id,
              outcome: assertion.outcome,
              confidence: log?.confidence ? Number(log.confidence) : undefined,
              chatId: log?.chatId ?? undefined,
              reasoningRoot: assertion.reasoningRoot,
              verdictTx: assertion.verdictTx,
              resolvedAt: assertion.resolvedAt,
              replay: true,
            },
            ts: Date.now(),
          })}\n\n`,
      );
      write(`event: done\ndata: ${JSON.stringify({ ts: Date.now(), replay: true })}\n\n`);
      endStream();
    }

    // Prevent fastify from auto-ending the response.
    return reply;
  });
};
