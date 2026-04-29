/**
 * Judgment service — the beating heart of Verdict.
 *
 * `judge(assertionId)`:
 *   1. Load the assertion + evidence rows.
 *   2. Download evidence blobs from 0G Storage (text evidence is
 *      materialised into the prompt; binary evidence is referenced by
 *      hash with a mime/size note).
 *   3. Build the system + user prompt.
 *   4. Pick a TEE chatbot provider (JUDGE_PROVIDER env, otherwise
 *      substring-hint match via pickTeeChatbot).
 *   5. Stream the completion through `runInference` — tokens land on
 *      the event bus for the SSE route.
 *   6. Parse the trailing JSON decision block.
 *   7. Upload the full reasoning transcript to 0G Storage.
 *   8. Submit the verdict on chain (AssertionRegistry.submitVerdict).
 *   9. Persist the reasoning_log row for audit/appeal.
 *
 * All failure modes publish an `error` event to the SSE bus so the
 * frontend can surface them in real time.
 */

import { ethers } from "ethers";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { eventBus } from "../lib/events.js";
import { db, schema } from "../db/client.js";
import { getContracts } from "../lib/chain.js";
import { uploadBuffer } from "./storage.js";
import { pickByAddress, pickTeeChatbot, type DiscoveredService } from "./compute.js";
import { runInference } from "./inference.js";
import { listEvidenceByAssertion } from "./evidence.js";
import { getAssertion, updateOutcome } from "./assertion.js";
import { materialiseAll } from "./context.js";
import {
  JUDGE_SYSTEM_PROMPT,
  buildUserPrompt,
  parseJudgeDecision,
} from "./prompt.js";
import { AssertionOutcome, type JudgeDecision } from "@verdict/shared";

export interface JudgeInput {
  assertionId: `0x${string}`;
  /** Override the default TEE provider selection (env hint otherwise). */
  modelHint?: string;
  /** Pre-resolved service (e.g. from a swarm member). */
  service?: DiscoveredService;
  judgeTokenId?: bigint;
}

export interface JudgeOutput {
  assertionId: `0x${string}`;
  decision: JudgeDecision;
  reasoningRoot: `0x${string}`;
  verdictTx: string;
  providerAddress: string;
  model: string;
  chatId: string;
  latencyMs: number;
}

// How long to wait for the client's /api/evidence/attach call to catch
// up with the on-chain AssertionCreated event. Real-world latency is
// 1–3s; we give it a little more so congested blocks don't blow past.
const EVIDENCE_WAIT_MS = 15_000;

/**
 * Read how many evidenceRoots the on-chain assertion carries. The
 * client must have attached at least that many DB rows before we
 * hand the prompt to the TEE — otherwise the judge sees an empty
 * evidence list and returns INVALID.
 */
async function readExpectedEvidenceCount(
  assertionId: `0x${string}`,
): Promise<number> {
  try {
    const { assertionRegistry } = await getContracts();
    const a = (await assertionRegistry
      .getFunction("getAssertion")
      .staticCall(assertionId)) as unknown as { evidenceRoots?: unknown[] };
    return Array.isArray(a.evidenceRoots) ? a.evidenceRoots.length : 0;
  } catch (err) {
    logger.warn(
      { err, assertionId },
      "could not read evidenceRoots from chain; proceeding without attach wait",
    );
    return 0;
  }
}

export async function judge(input: JudgeInput): Promise<JudgeOutput> {
  const { assertionId } = input;
  const publish = (kind: "status" | "error" | "outcome" | "done", payload: unknown) =>
    eventBus.publish(assertionId, { kind, payload });

  try {
    publish("status", { phase: "loading" });

    const assertion = await getAssertion(assertionId);
    if (!assertion) {
      throw new Error(`assertion ${assertionId} not found`);
    }
    if (assertion.outcome !== "PENDING") {
      throw new Error(`assertion ${assertionId} already resolved (${assertion.outcome})`);
    }

    // The indexer enqueues us the moment it sees AssertionCreated, but
    // the client's POST /api/evidence/attach call races behind the TX
    // receipt — if we start inference first, the TEE sees an empty
    // evidence list and correctly returns INVALID. Read the expected
    // root count from on-chain and give the attach step a brief window
    // to catch up before giving up.
    const expectedRootCount = await readExpectedEvidenceCount(assertionId);
    let evidenceRows = await listEvidenceByAssertion(assertionId);
    if (expectedRootCount > 0 && evidenceRows.length < expectedRootCount) {
      const deadline = Date.now() + EVIDENCE_WAIT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        evidenceRows = await listEvidenceByAssertion(assertionId);
        if (evidenceRows.length >= expectedRootCount) break;
      }
      if (evidenceRows.length < expectedRootCount) {
        logger.warn(
          {
            assertionId,
            have: evidenceRows.length,
            expected: expectedRootCount,
          },
          "proceeding with partial evidence — attach never arrived",
        );
      }
    }
    publish("status", { phase: "evidence", count: evidenceRows.length });

    const evidence = await materialiseAll(evidenceRows);

    const messages = [
      { role: "system" as const, content: JUDGE_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: buildUserPrompt({
          claim: assertion.claim,
          mode: assertion.mode === "AUDITED" ? "AUDITED" : "INSTANT",
          asserter: assertion.asserter as `0x${string}`,
          evidence,
        }),
      },
    ];

    publish("status", { phase: "inference" });
    const service =
      input.service ??
      (config.JUDGE_PROVIDER
        ? await pickByAddress(config.JUDGE_PROVIDER)
        : await pickTeeChatbot(input.modelHint ?? config.JUDGE_MODEL_HINT));

    const inference = await runInference({
      service,
      messages,
      assertionId,
    });

    publish("status", { phase: "parsing" });
    const decision = parseJudgeDecision(inference.answer);

    // Upload the full transcript (prompt + completion + decision meta)
    // so the verdict is independently re-verifiable.
    publish("status", { phase: "storage" });
    const transcript = serialiseTranscript({
      assertionId,
      messages,
      completion: inference.answer,
      decision,
      provider: {
        address: inference.providerAddress,
        model: inference.model,
        chatId: inference.chatId,
        chatIdSource: inference.chatIdSource,
        usage: inference.usage,
        latencyMs: inference.latencyMs,
      },
    });
    const reasoningUpload = await uploadBuffer(
      Buffer.from(transcript, "utf8"),
      `reasoning-${assertionId.slice(2, 10)}`,
    );

    publish("status", { phase: "submit" });
    const verdictTx = await submitVerdictOnChain({
      assertionId,
      outcome: decisionToOutcome(decision.outcome),
      reasoningRoot: reasoningUpload.rootHash,
      judgeTokenId: input.judgeTokenId ?? 0n,
    });

    await db.insert(schema.reasoningLogs).values({
      assertionId,
      judgeTokenId: Number(input.judgeTokenId ?? 0n) || null,
      storageRoot: reasoningUpload.rootHash,
      outcome: decision.outcome,
      confidence: decision.confidence.toString(),
      chatId: inference.chatId,
      teeAttestation: null,
    });

    await updateOutcome(assertionId, {
      outcome: decision.outcome,
      reasoningRoot: reasoningUpload.rootHash,
      verdictTx,
      resolvedAt: assertion.mode === "INSTANT" ? new Date() : undefined,
    });

    const result: JudgeOutput = {
      assertionId,
      decision,
      reasoningRoot: reasoningUpload.rootHash,
      verdictTx,
      providerAddress: inference.providerAddress,
      model: inference.model,
      chatId: inference.chatId,
      latencyMs: inference.latencyMs,
    };

    publish("outcome", result);
    publish("done", { ts: Date.now() });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, assertionId }, "judgment failed");
    publish("error", { message });
    throw err;
  }
}

function decisionToOutcome(outcome: JudgeDecision["outcome"]): AssertionOutcome {
  switch (outcome) {
    case "TRUE":
      return AssertionOutcome.TRUE;
    case "FALSE":
      return AssertionOutcome.FALSE;
    case "INVALID":
      return AssertionOutcome.INVALID;
    default:
      throw new Error(`unknown outcome: ${String(outcome)}`);
  }
}

interface SubmitVerdictInput {
  assertionId: `0x${string}`;
  outcome: AssertionOutcome;
  reasoningRoot: `0x${string}`;
  judgeTokenId: bigint;
}

async function submitVerdictOnChain(input: SubmitVerdictInput): Promise<string> {
  const { assertionRegistry } = await getContracts();

  // No real TEE attestation wiring yet — contract accepts bytes32 hash.
  // Commit to keccak256(assertionId || reasoningRoot) so the value is
  // unique per (assertion, verdict) pair and re-computable off-chain.
  // Phase 3 will replace this with the DCAP quote hash.
  const attestationHash = ethers.solidityPackedKeccak256(
    ["bytes32", "bytes32"],
    [input.assertionId, input.reasoningRoot],
  );

  const submit = assertionRegistry.getFunction("submitVerdict");
  const tx = await submit(
    input.assertionId,
    input.outcome,
    input.reasoningRoot,
    attestationHash,
    input.judgeTokenId,
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error("verdict tx produced no receipt");
  return receipt.hash as string;
}

interface TranscriptDocument {
  version: 1;
  chainId: number;
  assertionId: `0x${string}`;
  createdAt: string;
  messages: Array<{ role: string; content: string }>;
  completion: string;
  decision: JudgeDecision;
  provider: {
    address: string;
    model: string;
    chatId: string;
    chatIdSource: "header" | "stream";
    usage: unknown;
    latencyMs: number;
  };
}

function serialiseTranscript(input: Omit<TranscriptDocument, "version" | "chainId" | "createdAt">): string {
  const doc: TranscriptDocument = {
    version: 1,
    chainId: config.CHAIN_ID,
    createdAt: new Date().toISOString(),
    ...input,
  };
  return JSON.stringify(doc, null, 2);
}
