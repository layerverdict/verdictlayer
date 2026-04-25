/**
 * Chain indexer.
 *
 * Polls AssertionRegistry + EscalationManager for events and mirrors
 * them into Postgres. Persists last-scanned block per contract so
 * restarts resume cleanly.
 *
 * Also enqueues judgment jobs on `AssertionCreated` (so every new
 * assertion is picked up automatically) and appeal jobs on
 * `AssertionChallenged`.
 *
 * Design choices:
 *   - Single-instance. Running multiple indexers would cause duplicate
 *     job enqueues; the worker leader election is out of scope for v1.
 *   - Poll-based (no websocket). 0G RPC may not support subscriptions
 *     reliably and polling is trivial to reason about.
 */

import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { ethers } from "ethers";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { getContracts, getProvider } from "../lib/chain.js";
import { db, schema } from "../db/client.js";
import { getJudgmentQueue, getAppealQueue } from "../lib/queue.js";

const POLL_MS = 3_000;
const BLOCK_CONFIRMATIONS = 2; // only index events this many blocks deep
const MAX_RANGE = 2_000;

type ContractKey = "assertionRegistry" | "escalationManager";

async function getCheckpoint(contract: ContractKey): Promise<number> {
  const rows = await db
    .select()
    .from(schema.indexerCheckpoints)
    .where(eq(schema.indexerCheckpoints.contract, contract))
    .limit(1);
  return rows[0]?.lastBlock ?? 0;
}

async function saveCheckpoint(contract: ContractKey, block: number) {
  await db
    .insert(schema.indexerCheckpoints)
    .values({ contract, lastBlock: block })
    .onConflictDoUpdate({
      target: schema.indexerCheckpoints.contract,
      set: { lastBlock: block, updatedAt: sql`now()` },
    });
}

export async function runIndexerOnce() {
  const contracts = await getContracts();
  const provider = getProvider();
  const latest = await provider.getBlockNumber();
  const safeTip = Math.max(latest - BLOCK_CONFIRMATIONS, 0);

  await Promise.all([
    indexContract(contracts.assertionRegistry, "assertionRegistry", safeTip, handleRegistryEvent),
    indexContract(contracts.escalationManager, "escalationManager", safeTip, handleEscalationEvent),
  ]);

  // AUDITED verdicts need someone to flip them to RESOLVED once the
  // challenge window closes (Verdict's contract exposes resolveAssertion
  // for this — it's permissionless after the window). If we skipped
  // this step the application callback never fires and the escrow funds
  // stay locked forever.
  await finaliseDueAudited();
}

async function finaliseDueAudited() {
  const now = new Date();
  // Rough filter: AUDITED verdicts whose verdictedAt + challengePeriod
  // is in the past. The contract does the authoritative check on call;
  // we just prune obvious candidates here.
  const candidates = await db
    .select()
    .from(schema.assertions)
    .where(
      and(
        eq(schema.assertions.mode, "AUDITED"),
        isNotNull(schema.assertions.verdictedAt),
        lte(schema.assertions.verdictedAt, now),
      ),
    );

  const ready = candidates.filter((row) => {
    if (!row.verdictedAt) return false;
    if (row.outcome === "PENDING" || row.resolvedAt) return false;
    if (row.outcome === "ESCALATED") return false; // owned by the panel flow
    const dueAt = row.verdictedAt.getTime() + row.challengePeriod * 1000;
    return now.getTime() >= dueAt;
  });

  if (ready.length === 0) return;

  const { assertionRegistry } = await getContracts();
  const resolve = assertionRegistry.getFunction("resolveAssertion");
  for (const row of ready) {
    try {
      // finalOutcome is ignored on the permissionless path; pass 0.
      const tx = await resolve(row.id, 0);
      await tx.wait();
      logger.info(
        { assertionId: row.id, outcome: row.outcome },
        "auto-finalised AUDITED assertion after challenge window",
      );
    } catch (err) {
      logger.warn(
        { err, assertionId: row.id },
        "auto-finalise failed — likely challenged or already resolved",
      );
      // AssertionResolved event will flip the row, or the next tick
      // finds the row still RESOLVED==false and retries. No state to
      // clean up here.
    }
  }
}

async function indexContract(
  contract: ethers.Contract,
  key: ContractKey,
  safeTip: number,
  handler: (e: ethers.EventLog | ethers.Log) => Promise<void>,
) {
  const from = (await getCheckpoint(key)) + 1;
  if (from > safeTip) return;

  for (let cursor = from; cursor <= safeTip; cursor += MAX_RANGE) {
    const to = Math.min(cursor + MAX_RANGE - 1, safeTip);
    const events = await contract.queryFilter("*", cursor, to);
    for (const e of events) {
      try {
        await handler(e);
      } catch (err) {
        logger.error({ err, key, event: (e as ethers.EventLog).eventName, tx: e.transactionHash }, "indexer handler failed");
        throw err; // surface so checkpoint isn't advanced past this block
      }
    }
    await saveCheckpoint(key, to);
  }
}

async function handleRegistryEvent(e: ethers.EventLog | ethers.Log) {
  if (!("eventName" in e) || !e.eventName) return;
  const evt = e as ethers.EventLog;

  switch (evt.eventName) {
    case "AssertionCreated": {
      const [id, asserter, callback, mode, bond, evidenceRoots, claim] = evt.args;
      const modeNum = Number(mode);
      const modeName = modeNum === 0 ? "INSTANT" : modeNum === 1 ? "AUDITED" : undefined;
      if (!modeName) {
        logger.warn({ assertionId: id, modeNum }, "skipping AssertionCreated with unknown mode");
        break;
      }

      await db
        .insert(schema.assertions)
        .values({
          id: id as string,
          chainId: config.CHAIN_ID,
          claim: claim as string,
          mode: modeName,
          asserter: asserter as string,
          bond: (bond as bigint).toString(),
          callback: callback as string,
          // callbackSelector + challengePeriod aren't in the event
          // payload. They're read lazily from the registry in the
          // judgment worker if it needs them; storing defaults here
          // avoids a second RPC round-trip on the indexer hot path.
          callbackSelector: "0x00000000",
          challengePeriod: 0,
          outcome: "PENDING",
        })
        .onConflictDoNothing();

      // Evidence attachment is now driven by the `/api/evidence/attach`
      // endpoint — clients upload BEFORE the tx and attach AFTER they
      // see the receipt. We deliberately DON'T synthesise evidence rows
      // from the on-chain roots here: the asserter is almost always the
      // application contract (Escrow.sol, ParametricInsurance.sol…),
      // not the end user, so assigning `uploader = asserter` would
      // corrupt provenance. Any evidence root the indexer sees that
      // the web client didn't upload is orphan-on-purpose: reasoning
      // logs still cite the root, but the DB only stores rows we have
      // high-quality metadata for.

      await getJudgmentQueue().add(
        "judge",
        { assertionId: id as `0x${string}` },
        { jobId: `judge:${id}` },
      );
      logger.info(
        { assertionId: id, evidenceRootCount: (evidenceRoots as string[]).length },
        "indexed AssertionCreated",
      );
      break;
    }

    case "VerdictSubmitted": {
      const [id, , , outcome, reasoningRoot] = evt.args;
      const name = outcomeName(Number(outcome));

      // Pull challengePeriod from chain so the scheduler knows when
      // the AUDITED window closes. Cheap — a single view call per
      // verdict. Also capture the block timestamp as verdictedAt.
      let challengePeriod = 0;
      let verdictedAt: Date | undefined;
      try {
        const { assertionRegistry } = await getContracts();
        const onchain = (await assertionRegistry.getFunction("getAssertion")(id)) as {
          challengePeriod: bigint;
          verdictedAt: bigint;
        };
        challengePeriod = Number(onchain.challengePeriod);
        if (onchain.verdictedAt > 0n) {
          verdictedAt = new Date(Number(onchain.verdictedAt) * 1000);
        }
      } catch (err) {
        logger.warn({ err, assertionId: id }, "failed to read verdict metadata from chain");
      }

      const updated = await db
        .update(schema.assertions)
        .set({
          outcome: name,
          reasoningRoot: reasoningRoot as string,
          verdictTx: evt.transactionHash,
          challengePeriod,
          verdictedAt,
        })
        .where(eq(schema.assertions.id, id as string))
        .returning({ id: schema.assertions.id });
      if (updated.length === 0) {
        // Assertion row missing — indexer restarted with its
        // checkpoint past AssertionCreated. Skip silently; a manual
        // backfill is the right escape hatch here.
        logger.warn({ assertionId: id }, "VerdictSubmitted without mirrored AssertionCreated row");
      } else {
        logger.info({ assertionId: id, outcome: name }, "indexed VerdictSubmitted");
      }
      break;
    }

    case "AssertionChallenged": {
      const [id] = evt.args;
      await getAppealQueue().add(
        "appeal",
        { assertionId: id as `0x${string}` },
        { jobId: `appeal:${id}` },
      );
      logger.info({ assertionId: id }, "indexed AssertionChallenged → enqueued appeal");
      break;
    }

    case "AssertionResolved": {
      const [id, finalOutcome] = evt.args;
      const name = outcomeName(Number(finalOutcome));
      const updated = await db
        .update(schema.assertions)
        .set({ outcome: name, resolvedAt: new Date() })
        .where(eq(schema.assertions.id, id as string))
        .returning({ id: schema.assertions.id });
      if (updated.length === 0) {
        logger.warn({ assertionId: id }, "AssertionResolved without mirrored row");
      } else {
        logger.info({ assertionId: id, outcome: name }, "indexed AssertionResolved");
      }
      break;
    }

    default:
      // AssertionCreated / VerdictSubmitted / AssertionChallenged /
      // AssertionResolved are the only registry events we persist in
      // v1. Everything else is reconstructible from these.
      break;
  }
}

async function handleEscalationEvent(_e: ethers.EventLog | ethers.Log) {
  // v1: escalation events aren't mirrored — the `closeAppeal` handler
  // writes the final outcome via `AssertionResolved` on the registry,
  // which is already indexed above.
}

function outcomeName(o: number): string {
  switch (o) {
    case 0:
      return "PENDING";
    case 1:
      return "TRUE";
    case 2:
      return "FALSE";
    case 3:
      return "INVALID";
    case 4:
      return "ESCALATED";
    default:
      logger.warn({ outcome: o }, "unknown outcome value from chain event");
      return "PENDING";
  }
}

export function startIndexer(): { stop: () => void } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      await runIndexerOnce();
    } catch (err) {
      logger.error({ err }, "indexer tick failed");
    }
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  };

  timer = setTimeout(tick, POLL_MS);
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const handle = startIndexer();
  const shutdown = () => {
    handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  logger.info("indexer started (single-instance, poll-based)");
}
