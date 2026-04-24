/**
 * BullMQ queues.
 *
 * `judgment` — primary TEE-inference pipeline (one job per assertion).
 * `appeal`   — multi-agent swarm; 3 parallel inferences aggregated.
 *
 * Consumers live in `src/workers/*`. Producers enqueue from API routes
 * and the chain indexer.
 */

import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { createRedis } from "./redis.js";

export const QUEUE_NAMES = {
  judgment: "verdict.judgment",
  appeal: "verdict.appeal",
} as const;

export interface JudgmentJob {
  assertionId: `0x${string}`;
}

export interface AppealJob {
  assertionId: `0x${string}`;
}

// TEE inference typically runs 20-60s; the first retry delay needs to
// be long enough that the provider has time to recover between
// attempts. Exponential factor 2 → 15s, 30s, 60s.
const defaults: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86_400 },
};

let judgmentQueue: Queue<JudgmentJob> | undefined;
let appealQueue: Queue<AppealJob> | undefined;
let judgmentEvents: QueueEvents | undefined;

export function getJudgmentQueue(): Queue<JudgmentJob> {
  if (!judgmentQueue) {
    judgmentQueue = new Queue(QUEUE_NAMES.judgment, {
      connection: createRedis(),
      defaultJobOptions: defaults,
    });
  }
  return judgmentQueue;
}

export function getAppealQueue(): Queue<AppealJob> {
  if (!appealQueue) {
    appealQueue = new Queue(QUEUE_NAMES.appeal, {
      connection: createRedis(),
      defaultJobOptions: defaults,
    });
  }
  return appealQueue;
}

export function getJudgmentEvents(): QueueEvents {
  if (!judgmentEvents) {
    judgmentEvents = new QueueEvents(QUEUE_NAMES.judgment, {
      connection: createRedis(),
    });
  }
  return judgmentEvents;
}

export async function closeQueues() {
  await Promise.all([
    judgmentQueue?.close(),
    appealQueue?.close(),
    judgmentEvents?.close(),
  ]);
  judgmentQueue = undefined;
  appealQueue = undefined;
  judgmentEvents = undefined;
}
