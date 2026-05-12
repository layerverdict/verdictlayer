import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { assertionRoutes } from "./routes/assertions.js";
import { verdictRoutes } from "./routes/verdict.js";
import { oracleRoutes } from "./routes/oracle.js";
import { appsRoutes } from "./routes/apps.js";
import { judgesRoutes } from "./routes/judges.js";
import { closeQueues } from "./lib/queue.js";
import { closeRedis } from "./lib/redis.js";
import { startJudgmentWorker } from "./workers/judgment.js";
import { startAppealWorker } from "./workers/appeal.js";
import { startIndexer } from "./workers/indexer.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    disableRequestLogging: false,
    bodyLimit: 8 * 1024 * 1024, // 8MB JSON bodies; evidence uploads use multipart
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // mirrors MAX_UPLOAD_BYTES in storage service
      files: 1,
    },
  });

  await app.register(healthRoutes);
  await app.register(evidenceRoutes);
  await app.register(assertionRoutes);
  await app.register(verdictRoutes);
  await app.register(oracleRoutes);
  await app.register(appsRoutes);
  await app.register(judgesRoutes);

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "Not Found" });
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof ZodError) {
      req.log.warn({ issues: err.issues }, "request validation failed");
      return reply.code(400).send({ error: "ValidationError", issues: err.issues });
    }

    req.log.error({ err }, "request failed");
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.code(status).send({
      error: err.name ?? "InternalError",
      message:
        status >= 500 && config.NODE_ENV === "production"
          ? "Internal Server Error"
          : err.message,
    });
  });

  // Embedded workers share the API's event bus — critical for SSE
  // because the in-memory bus doesn't cross processes. Production can
  // set EMBED_WORKERS=false and run the workers standalone once we
  // swap eventBus for Redis pub/sub.
  const workerHandles: Array<{ close: () => Promise<void> | void }> = [];
  if (config.EMBED_WORKERS) {
    workerHandles.push(startJudgmentWorker());
    workerHandles.push(startAppealWorker());
    const indexer = startIndexer();
    workerHandles.push({ close: () => indexer.stop() });
    app.log.info("workers + indexer embedded in API process");
  }

  app.addHook("onClose", async () => {
    for (const h of workerHandles) await h.close();
    await closeQueues();
    await closeRedis();
  });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: config.API_PORT, host: config.API_HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  void main();
}
