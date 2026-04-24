import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { getProvider } from "../lib/chain.js";
import { getRedis } from "../lib/redis.js";

/**
 * Liveness + readiness probes.
 *
 * `/health`  — process alive (no external deps).
 * `/ready`   — RPC + Redis reachable. Used by load balancer.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    chainId: config.CHAIN_ID,
    env: config.NODE_ENV,
    ts: Date.now(),
  }));

  app.get("/ready", async (_req, reply) => {
    const checks: Record<string, "ok" | string> = {};
    try {
      const block = await getProvider().getBlockNumber();
      checks.rpc = `ok (block=${block})`;
    } catch (err) {
      checks.rpc = (err as Error).message;
    }

    try {
      const pong = await getRedis().ping();
      checks.redis = pong === "PONG" ? "ok" : pong;
    } catch (err) {
      checks.redis = (err as Error).message;
    }

    const ok = Object.values(checks).every((v) => v.startsWith("ok"));
    return reply.code(ok ? 200 : 503).send({ ok, checks });
  });
};
