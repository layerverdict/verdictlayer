/**
 * Judgment worker — BullMQ consumer.
 *
 * Subscribes to the `verdict.judgment` queue and runs the full TEE
 * pipeline per job. Runs in its own process in production (invoked by
 * `pnpm --filter @verdict/api exec tsx src/workers/judgment.ts`) or
 * alongside the API server in development via `withWorkers()`.
 */

import { Worker, type Job } from "bullmq";

import { logger } from "../lib/logger.js";
import { createRedis } from "../lib/redis.js";
import { QUEUE_NAMES, type JudgmentJob } from "../lib/queue.js";
import { judge } from "../services/judgment.js";

export function startJudgmentWorker(concurrency = 2): Worker<JudgmentJob> {
  const worker = new Worker<JudgmentJob>(
    QUEUE_NAMES.judgment,
    async (job: Job<JudgmentJob>) => {
      logger.info({ jobId: job.id, assertionId: job.data.assertionId }, "judgment job start");
      const result = await judge({ assertionId: job.data.assertionId });
      logger.info(
        {
          jobId: job.id,
          assertionId: job.data.assertionId,
          outcome: result.decision.outcome,
          verdictTx: result.verdictTx,
        },
        "judgment job done",
      );
      return result;
    },
    {
      connection: createRedis(),
      concurrency,
      lockDuration: 120_000, // TEE inference can exceed 60s under load
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, assertionId: job?.data.assertionId, err },
      "judgment job failed",
    );
  });

  return worker;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const worker = startJudgmentWorker();
  const shutdown = async () => {
    logger.info("judgment worker shutting down");
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
