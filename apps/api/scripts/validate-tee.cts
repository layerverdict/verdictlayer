/**
 * TEE validation gate
 *
 * Purpose: end-to-end proof that the 0G Compute TEE stack works for Verdict
 * before we commit to building the judgment service on top of it.
 *
 * Why .cts: the @0glabs/0g-serving-broker ESM build emits an internal .js
 * chunk that Node parses as CommonJS (broker package has no "type": "module"),
 * which fails with a SyntaxError on the re-export line. Its CommonJS build
 * works fine, so we force CJS resolution by using a .cts extension.
 *
 * Checks, in order:
 *   1. Broker initialises against the configured RPC
 *   2. listService() returns TEE-verified chatbot providers
 *   3. Ledger is present (created on the fly if not) with non-zero available balance
 *   4. Target provider is acknowledged (one-time on first run)
 *   5. Streaming chat completion returns a real answer from the selected model
 *   6. processResponse(providerAddress, chatID, usageData) succeeds
 *
 * Run:
 *   pnpm --filter @verdict/api run validate:tee
 *
 * Env (.env at repo root OR apps/api/.env):
 *   RPC_URL=https://evmrpc-testnet.0g.ai
 *   PRIVATE_KEY=0x...            # funded testnet key
 *   (optional) TEE_MODEL=deepseek   # substring match against service model
 */

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Load env from apps/api first, then fall back to repo root. Neither overrides
// values already present in process.env.
loadEnv({ path: resolve(__dirname, "..", ".env") });
loadEnv({ path: resolve(__dirname, "..", "..", "..", ".env") });

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

type ServiceTuple = [
  providerAddress: string,
  serviceType: string,
  url: string,
  inputPrice: bigint,
  outputPrice: bigint,
  updatedAt: bigint,
  model: string,
  verifiability: string,
  salt: string,
  expiry: bigint,
  teeVerified: boolean,
];

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`FATAL: missing env var ${name}`);
    process.exit(1);
  }
  return value;
}

function formatTuple(s: ServiceTuple) {
  return {
    provider: s[0],
    type: s[1],
    url: s[2],
    model: s[6],
    verifiability: s[7],
    tee: s[10],
  };
}

async function main() {
  const RPC_URL = required("RPC_URL");
  const PRIVATE_KEY = required("PRIVATE_KEY");
  const TEE_MODEL_HINT = (process.env.TEE_MODEL ?? "deepseek").toLowerCase();

  const started = Date.now();
  console.log("=".repeat(64));
  console.log("Verdict — TEE validation gate");
  console.log("=".repeat(64));

  // ── Step 1: broker ─────────────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);

  console.log(`\n[1] broker init`);
  console.log(`    chainId:  ${network.chainId}`);
  console.log(`    wallet:   ${wallet.address}`);
  console.log(`    balance:  ${ethers.formatEther(balance)} 0G`);

  if (balance === 0n) {
    console.error("FATAL: wallet is empty, fund it at https://faucet.0g.ai");
    process.exit(1);
  }

  // Broker ships both CJS and ESM Wallet typings — our CJS script and
  // ethers' ESM typings don't unify, so cast at the boundary.
  const broker = await createZGComputeNetworkBroker(wallet as never);
  console.log(`    ✓ broker ready`);

  // ── Step 2: listService + filter ───────────────────────────────────────
  console.log(`\n[2] listService()`);
  const services = (await broker.inference.listService()) as unknown as ServiceTuple[];
  console.log(`    total services:   ${services.length}`);

  const chatbots = services.filter((s) => s[1] === "chatbot");
  const teeChatbots = chatbots.filter((s) => s[10] === true);

  console.log(`    chatbot:          ${chatbots.length}`);
  console.log(`    TEE-verified:     ${teeChatbots.length}`);

  if (teeChatbots.length === 0) {
    console.error("FATAL: no TEE-verified chatbot providers on this network");
    process.exit(1);
  }

  const preferred = teeChatbots.find((s) => s[6].toLowerCase().includes(TEE_MODEL_HINT));
  const selected = preferred ?? teeChatbots[0]!;
  const providerAddress = selected[0];

  console.log(`\n    selected provider:`);
  console.dir(formatTuple(selected), { depth: null });

  // ── Step 3: ledger ─────────────────────────────────────────────────────
  //
  // 0G Compute's inference contract requires a per-provider lock of 1.0 0G
  // when you call acknowledgeProviderSigner(). A ledger with less than that
  // will revert with custom error 0xadb9e043 (need=1e18, have=<balance>).
  // addLedger / depositFund amounts below reflect that contract minimum.
  console.log(`\n[3] ledger check`);
  const MIN_LEDGER_BALANCE = ethers.parseEther("1.0");

  let ledger;
  try {
    ledger = (await broker.ledger.getLedger()) as unknown as [
      user: string,
      totalBalance: bigint,
      availableBalance: bigint,
      ...unknown[],
    ];
  } catch {
    console.log(`    ledger missing — creating one with 1.0 0G`);
    await broker.ledger.addLedger(1.0);
    ledger = (await broker.ledger.getLedger()) as unknown as [
      user: string,
      totalBalance: bigint,
      availableBalance: bigint,
      ...unknown[],
    ];
  }
  const totalBalance = ledger[1];
  const availableBalance = ledger[2];
  console.log(`    total:     ${ethers.formatEther(totalBalance)} 0G`);
  console.log(`    available: ${ethers.formatEther(availableBalance)} 0G`);

  if (availableBalance < MIN_LEDGER_BALANCE) {
    const shortfall = MIN_LEDGER_BALANCE - availableBalance;
    const shortfallEth = Number(ethers.formatEther(shortfall));
    const walletBalance = await provider.getBalance(wallet.address);
    if (walletBalance < shortfall) {
      console.error(
        `FATAL: ledger short by ${shortfall} wei but wallet only has ${ethers.formatEther(walletBalance)} 0G. ` +
          `Top up the wallet and retry.`,
      );
      process.exit(1);
    }
    console.log(`    topping up ledger by ${shortfallEth} 0G`);
    await broker.ledger.depositFund(shortfallEth);
  }

  // ── Step 4: acknowledge (idempotent) ──────────────────────────────────
  console.log(`\n[4] acknowledge provider`);
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
    console.log(`    ✓ acknowledged`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("already")) {
      console.log(`    ✓ already acknowledged`);
    } else {
      throw err;
    }
  }

  // ── Step 5: inference ──────────────────────────────────────────────────
  console.log(`\n[5] streaming chat`);
  const { endpoint, model: resolvedModel } =
    await broker.inference.getServiceMetadata(providerAddress);
  console.log(`    endpoint:  ${endpoint}`);
  console.log(`    model:     ${resolvedModel}`);

  const prompt = [
    {
      role: "system" as const,
      content:
        "You are Verdict-Judge, an impartial AI adjudicator operating inside a " +
        "Trusted Execution Environment on 0G Compute. Answer concisely in one sentence.",
    },
    {
      role: "user" as const,
      content:
        "Given the claim 'the sky is blue', and no contradicting evidence, " +
        "reply TRUE or FALSE and justify in under 20 words.",
    },
  ];

  const headers = await broker.inference.getRequestHeaders(providerAddress);
  const inferenceStarted = Date.now();

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ messages: prompt, model: resolvedModel, stream: true }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`FATAL: inference HTTP ${response.status}: ${body}`);
    process.exit(1);
  }

  const headerChatId =
    response.headers.get("ZG-Res-Key") || response.headers.get("zg-res-key");

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let streamChatId: string | null = null;
  let usage: ChatUsage | null = null;
  let answer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "data: [DONE]") continue;
    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    try {
      const msg = JSON.parse(payload);
      if (!streamChatId && typeof msg.id === "string") streamChatId = msg.id;
      if (msg.usage) usage = msg.usage as ChatUsage;
      const delta = msg.choices?.[0]?.delta?.content;
      if (typeof delta === "string") answer += delta;
    } catch {
      // ignore keepalive
    }
  }

  const latencyMs = Date.now() - inferenceStarted;
  const finalChatId = headerChatId ?? streamChatId;

  if (!finalChatId) {
    console.error("FATAL: neither ZG-Res-Key header nor stream id present");
    process.exit(1);
  }
  if (!answer) {
    console.error("FATAL: empty completion");
    process.exit(1);
  }

  console.log(`    chatID:    ${finalChatId} (source: ${headerChatId ? "header" : "stream"})`);
  console.log(`    usage:     ${JSON.stringify(usage ?? {})}`);
  console.log(`    latency:   ${latencyMs} ms`);
  console.log(`    answer:    ${answer.trim()}`);

  // ── Step 6: processResponse ────────────────────────────────────────────
  console.log(`\n[6] processResponse (fee settlement)`);
  await broker.inference.processResponse(
    providerAddress,
    finalChatId,
    JSON.stringify(usage ?? {}),
  );
  console.log(`    ✓ settled`);

  // ── Summary ────────────────────────────────────────────────────────────
  const total = Date.now() - started;
  console.log("\n" + "=".repeat(64));
  console.log("TEE GATE PASSED");
  console.log("=".repeat(64));
  console.log(`provider:      ${providerAddress}`);
  console.log(`model:         ${resolvedModel}`);
  console.log(`inference:     ${latencyMs} ms`);
  console.log(`total gate:    ${total} ms`);
  console.log(`\nadd to .env for subsequent runs:`);
  console.log(`JUDGE_PROVIDER=${providerAddress}`);
}

main().catch((err) => {
  console.error("\nTEE GATE FAILED");
  console.error(err);
  process.exit(1);
});
