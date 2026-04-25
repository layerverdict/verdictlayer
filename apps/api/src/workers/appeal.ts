/**
 * Appeal worker — BullMQ consumer for `verdict.appeal` jobs.
 *
 * Enqueued by the chain indexer when an `AssertionChallenged` event is
 * ingested. The job must carry the 3 judge tokenIds selected for the
 * panel (pre-minted ReputationRegistry NFTs identified in env).
 */

import { Worker, type Job } from "bullmq";

import { eventBus } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { createRedis } from "../lib/redis.js";
import { QUEUE_NAMES, type AppealJob } from "../lib/queue.js";
import { runAppealSwarm } from "../services/appeal.js";
import { config } from "../config.js";

interface AppealJobPayload extends AppealJob {
  panelTokenIds?: [string, string, string];
}

export function startAppealWorker(concurrency = 1): Worker<AppealJobPayload> {
  const worker = new Worker<AppealJobPayload>(
    QUEUE_NAMES.appeal,
    async (job: Job<AppealJobPayload>) => {
      const envTokens = config.PANEL_TOKEN_IDS
        ? config.PANEL_TOKEN_IDS.split(",").map((t) => t.trim())
        : undefined;
      const panelRaw =
        job.data.panelTokenIds ??
        (envTokens && envTokens.length === 3
          ? (envTokens as [string, string, string])
          : undefined);
      if (!panelRaw) {
        throw new Error(
          "panelTokenIds missing — pass via job payload or PANEL_TOKEN_IDS env",
        );
      }
      const [a, b, c] = panelRaw;
      if (!a || !b || !c) {
        throw new Error("panelTokenIds must contain 3 non-empty values");
      }
      const tokenIds: [bigint, bigint, bigint] = [BigInt(a), BigInt(b), BigInt(c)];
      logger.info({ jobId: job.id, assertionId: job.data.assertionId }, "appeal job start");
      const result = await runAppealSwarm({
        assertionId: job.data.assertionId,
        panelTokenIds: tokenIds,
      });
      logger.info(
        {
          jobId: job.id,
          assertionId: job.data.assertionId,
          finalOutcome: result.finalOutcome,
          closeTx: result.closeTx,
        },
        "appeal job done",
      );
      return result;
    },
    {
      connection: createRedis(),
      concurrency,
      lockDuration: 300_000, // 3 parallel inferences → 5min budget
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, assertionId: job?.data.assertionId, err }, "appeal job failed");

    const attempts = job?.opts.attempts ?? 1;
    if (job && job.attemptsMade >= attempts) {
      eventBus.publish(job.data.assertionId, {
        kind: "done",
        payload: { ts: Date.now(), failed: true },
      });
    }
  });

  return worker;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const worker = startAppealWorker();
  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
