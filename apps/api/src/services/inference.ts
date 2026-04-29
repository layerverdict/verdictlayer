/**
 * TEE inference pipeline.
 *
 * Takes a prompt, streams a completion from a selected 0G Compute
 * provider, emits tokens to the event bus, and ensures every request
 * is followed by a `processResponse()` call for fee settlement.
 *
 * ChatID discipline:
 *   - Primary source: `ZG-Res-Key` header (case-insensitive).
 *   - Fallback: first `data.id` observed in the stream.
 *
 * Reference: skills/compute/streaming-chat/SKILL.md
 */

import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { eventBus } from "../lib/events.js";
import {
  acknowledgeProvider,
  ensureLedger,
  getInferenceContext,
  processResponse,
  type DiscoveredService,
} from "./compute.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InferenceUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface InferenceResult {
  answer: string;
  chatId: string;
  chatIdSource: "header" | "stream";
  usage: InferenceUsage;
  latencyMs: number;
  providerAddress: string;
  model: string;
}

export interface RunInferenceInput {
  service: DiscoveredService;
  messages: ChatMessage[];
  assertionId?: `0x${string}`; // for SSE streaming — optional for ad-hoc calls
  temperature?: number;
  /** Upper bound on the whole request, start-of-stream to finish.
   *  Default 90s — long enough for a busy TEE chatbot provider, short
   *  enough to stay inside the BullMQ lockDuration (120s). */
  timeoutMs?: number;
}

/**
 * Execute a single TEE inference end-to-end.
 *
 * Flow:
 *   1. ensureLedger + acknowledgeProvider (idempotent caches)
 *   2. fetch auth headers + endpoint
 *   3. POST /chat/completions with stream: true
 *   4. stream tokens → eventBus (if assertionId provided)
 *   5. extract chatId from header or trailing data.id
 *   6. processResponse(providerAddress, chatId, usage)
 */
export async function runInference(input: RunInferenceInput): Promise<InferenceResult> {
  const { service, messages } = input;
  await ensureLedger();
  await acknowledgeProvider(service.providerAddress);

  const { endpoint, model, headers } = await getInferenceContext(service.providerAddress);
  const started = Date.now();

  // AbortController backstop for unresponsive providers — without this,
  // a frozen stream keeps the job locked until BullMQ drops the lock
  // (120s) and still leaves a live reader on the old request.
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 90_000;
  const abortTimer = setTimeout(
    () => controller.abort(new Error("inference timed out")),
    timeoutMs,
  );

  let response: Response;
  try {
    response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        messages,
        model,
        stream: true,
        temperature: input.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(abortTimer);
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`inference HTTP ${response.status}: ${body}`);
  }

  const headerChatId =
    response.headers.get("ZG-Res-Key") ?? response.headers.get("zg-res-key");

  if (!response.body) {
    throw new Error("inference response has no body stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";
  let streamChatId: string | undefined;
  let usage: InferenceUsage | undefined;
  let streamError: unknown;

  const emit = (kind: "token" | "status", payload: unknown) => {
    if (input.assertionId) {
      eventBus.publish(input.assertionId, { kind, payload });
    }
  };

  const ingestLine = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "data: [DONE]") return;
    const payloadStr = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    try {
      const msg = JSON.parse(payloadStr) as {
        id?: string;
        usage?: InferenceUsage;
        choices?: Array<{ delta?: { content?: string } }>;
      };
      if (!streamChatId && typeof msg.id === "string") streamChatId = msg.id;
      if (msg.usage) usage = msg.usage;
      const delta = msg.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        answer += delta;
        emit("token", delta);
      }
    } catch {
      // keepalive / partial line; ignore
    }
  };

  emit("status", { phase: "streaming", providerAddress: service.providerAddress, model });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        boundary = buffer.indexOf("\n");
        ingestLine(line);
      }
    }
    if (buffer.trim()) ingestLine(buffer);
  } catch (err) {
    // Capture the read failure but still attempt fee settlement below;
    // skipping processResponse leaves the provider's account in an
    // inconsistent state.
    streamError = err;
  } finally {
    clearTimeout(abortTimer);
  }

  const finalChatId = headerChatId ?? streamChatId;

  // Fee settlement MUST run if we have a chatId, regardless of
  // downstream parse/stream failures. Swallow its error onto the
  // logger — the original error (if any) takes priority.
  if (finalChatId) {
    try {
      await processResponse(service.providerAddress, finalChatId, usage ?? {});
    } catch (err) {
      logger.error(
        { err, providerAddress: service.providerAddress, finalChatId },
        "processResponse failed",
      );
      if (!streamError) streamError = err;
    }
  }

  if (streamError) throw streamError;
  if (!finalChatId) {
    throw new Error("inference stream produced no chatId (header + body both empty)");
  }
  if (!answer) {
    throw new Error("inference stream produced no content");
  }

  const chatIdSource: "header" | "stream" = headerChatId ? "header" : "stream";
  return {
    answer,
    chatId: finalChatId,
    chatIdSource,
    usage: usage ?? {},
    latencyMs: Date.now() - started,
    providerAddress: service.providerAddress,
    model,
  };
}

/** Small helper to identify the default judge provider from env, if any. */
export function configuredJudgeProvider(): string | undefined {
  return config.JUDGE_PROVIDER;
}
