/**
 * Multi-Agent appeal swarm.
 *
 * On an AUDITED assertion challenge, the backend:
 *   1. Selects 3 distinct TEE chatbot providers (model hints:
 *      glm / deepseek / qwen3).
 *   2. Runs `judge`-style inference in parallel against each, using the
 *      same structured prompt as the first-instance judge.
 *   3. Uploads each reasoning transcript to 0G Storage.
 *   4. Calls `EscalationManager.openAppeal`, then
 *      `recordPanelVote(assertionId, judgeTokenId, outcome)` once per
 *      panelist, and finally `closeAppeal`.
 *
 * judgeTokenId mapping: each panel provider is associated with a
 * pre-minted ReputationRegistry NFT. The mapping lives in config (env
 * pointer) — for testnet/mainnet we pre-mint 3 judge agents during
 * deploy and hard-wire their tokenIds in env.
 */

import { listEvidenceByAssertion } from "./evidence.js";
import { getAssertion } from "./assertion.js";
import { uploadBuffer } from "./storage.js";
import { pickTeeChatbotSwarm, type DiscoveredService } from "./compute.js";
import { runInference } from "./inference.js";
import { materialiseAll } from "./context.js";
import {
  JUDGE_SYSTEM_PROMPT,
  buildUserPrompt,
  parseJudgeDecision,
} from "./prompt.js";
import { getContracts } from "../lib/chain.js";
import { eventBus } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "../db/client.js";
import { AssertionOutcome, type JudgeDecision } from "@verdict/shared";
import { config } from "../config.js";

export interface AppealInput {
  assertionId: `0x${string}`;
  /** Token ids for each of the 3 panel judges. Order maps 1:1 to the
   *  provider swarm selection. */
  panelTokenIds: [bigint, bigint, bigint];
}

export interface PanelVerdict {
  providerAddress: string;
  model: string;
  judgeTokenId: bigint;
  decision: JudgeDecision;
  reasoningRoot: `0x${string}`;
  latencyMs: number;
  chatId: string;
}

export interface AppealResult {
  assertionId: `0x${string}`;
  panelists: PanelVerdict[];
  finalOutcome: AssertionOutcome;
  closeTx: string;
}

export async function runAppealSwarm(input: AppealInput): Promise<AppealResult> {
  const { assertionId } = input;
  const publish = (kind: "status" | "error" | "outcome" | "done", payload: unknown) =>
    eventBus.publish(assertionId, { kind, payload });

  // EscalationManager rejects duplicate judgeTokenIds — catch it here
  // so we don't burn 3 TEE inferences before the contract reverts.
  const uniqueIds = new Set(input.panelTokenIds.map((t) => t.toString()));
  if (uniqueIds.size !== 3) {
    throw new Error(
      `panelTokenIds must be 3 distinct judge NFTs; got [${input.panelTokenIds.join(", ")}]`,
    );
  }
  if (input.panelTokenIds.some((t) => t === 0n)) {
    throw new Error("panelTokenIds must be non-zero (0 is the 'no judge' sentinel)");
  }

  publish("status", { phase: "appeal-loading" });

  const assertion = await getAssertion(assertionId);
  if (!assertion) throw new Error(`assertion ${assertionId} not found`);

  const evidenceRows = await listEvidenceByAssertion(assertionId);
  const evidence = await materialiseAll(evidenceRows);

  const messages = [
    { role: "system" as const, content: JUDGE_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: buildUserPrompt({
        claim: assertion.claim,
        mode: "AUDITED",
        asserter: assertion.asserter as `0x${string}`,
        evidence,
      }),
    },
  ];

  publish("status", { phase: "appeal-discovery" });
  const services = await pickTeeChatbotSwarm(3);
  if (services.length < 3) {
    throw new Error(`appeal swarm requires 3 distinct providers; found ${services.length}`);
  }

  publish("status", { phase: "appeal-inference", providers: services.map((s) => s.model) });
  const panelists = await Promise.all(
    services.map((service, idx) => {
      // Safe: we validated the tuple above and the loop is bounded to 3.
      const tokenId = input.panelTokenIds[idx]!;
      return runPanelist(service, messages, tokenId, assertionId);
    }),
  );

  publish("status", { phase: "appeal-open" });
  const { escalationManager } = await getContracts();

  const openAppeal = escalationManager.getFunction("openAppeal");
  const openTx = await openAppeal(assertionId);
  await openTx.wait();

  const recordPanelVote = escalationManager.getFunction("recordPanelVote");
  for (const p of panelists) {
    const tx = await recordPanelVote(
      assertionId,
      p.judgeTokenId,
      decisionToOutcome(p.decision.outcome),
    );
    await tx.wait();
  }

  publish("status", { phase: "appeal-close" });
  const closeAppeal = escalationManager.getFunction("closeAppeal");
  const closeTx = await closeAppeal(assertionId);
  const receipt = await closeTx.wait();
  if (!receipt) throw new Error("closeAppeal produced no receipt");

  for (const p of panelists) {
    await db.insert(schema.reasoningLogs).values({
      assertionId,
      judgeTokenId: Number(p.judgeTokenId),
      storageRoot: p.reasoningRoot,
      outcome: p.decision.outcome,
      confidence: p.decision.confidence.toString(),
      chatId: p.chatId,
      teeAttestation: null,
    });
  }

  const finalOutcome = plurality(panelists.map((p) => decisionToOutcome(p.decision.outcome)));
  const result: AppealResult = {
    assertionId,
    panelists,
    finalOutcome,
    closeTx: receipt.hash as string,
  };

  publish("outcome", result);
  publish("done", { ts: Date.now() });

  return result;
}

async function runPanelist(
  service: DiscoveredService,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  judgeTokenId: bigint,
  assertionId: `0x${string}`,
): Promise<PanelVerdict> {
  const inference = await runInference({ service, messages, assertionId });
  const decision = parseJudgeDecision(inference.answer);

  const transcript = JSON.stringify(
    {
      version: 1,
      chainId: config.CHAIN_ID,
      assertionId,
      role: "appeal-panelist",
      judgeTokenId: judgeTokenId.toString(),
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
    },
    null,
    2,
  );
  const upload = await uploadBuffer(
    Buffer.from(transcript, "utf8"),
    `appeal-${assertionId.slice(2, 10)}-${judgeTokenId}`,
  );

  logger.info(
    {
      assertionId,
      provider: inference.providerAddress,
      model: inference.model,
      outcome: decision.outcome,
      judgeTokenId: judgeTokenId.toString(),
    },
    "panelist decided",
  );

  return {
    providerAddress: inference.providerAddress,
    model: inference.model,
    judgeTokenId,
    decision,
    reasoningRoot: upload.rootHash,
    latencyMs: inference.latencyMs,
    chatId: inference.chatId,
  };
}

function decisionToOutcome(outcome: JudgeDecision["outcome"]): AssertionOutcome {
  switch (outcome) {
    case "TRUE":
      return AssertionOutcome.TRUE;
    case "FALSE":
      return AssertionOutcome.FALSE;
    case "INVALID":
      return AssertionOutcome.INVALID;
  }
}

/** Mirrors EscalationManager._plurality — INVALID on ties. */
function plurality(votes: AssertionOutcome[]): AssertionOutcome {
  let t = 0, f = 0, i = 0;
  for (const v of votes) {
    if (v === AssertionOutcome.TRUE) t++;
    else if (v === AssertionOutcome.FALSE) f++;
    else if (v === AssertionOutcome.INVALID) i++;
  }
  if (t > f && t > i) return AssertionOutcome.TRUE;
  if (f > t && f > i) return AssertionOutcome.FALSE;
  return AssertionOutcome.INVALID;
}
