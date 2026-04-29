/**
 * Compute broker client.
 *
 * Wraps `@0glabs/0g-serving-broker` with:
 *   - singleton broker initialization (expensive on-chain handshake)
 *   - TEE provider discovery with substring-hinted selection + caching
 *   - ledger bootstrap (create / top-up to the 1.0 0G contract minimum)
 *   - idempotent acknowledgeProviderSigner with in-memory dedup
 *
 * The judgment service consumes this module — it does not talk to the
 * broker directly, so prompt-path code doesn't need to know about TEE
 * provisioning mechanics.
 *
 * Reference: skills/compute/{provider-discovery,account-management,streaming-chat}
 */

import { ethers } from "ethers";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import {
  loadBrokerSDK,
  type ServiceTuple,
  type ZGComputeBroker,
  type LedgerTuple,
} from "../lib/broker.js";
import { getSigner } from "../lib/chain.js";

const MIN_LEDGER_0G = 1.0;
// Derived so the bigint and the float stay in lockstep — changing one
// place is enough.
const MIN_LEDGER_WEI = ethers.parseEther(MIN_LEDGER_0G.toString());

// Provider rotations are rare but not impossible — cap the service list
// cache at 10 minutes so a long-running process eventually notices new
// providers without a manual invalidate.
const SERVICES_TTL_MS = 10 * 60_000;

let brokerPromise: Promise<ZGComputeBroker> | undefined;
let servicesPromise: Promise<ServiceTuple[]> | undefined;
let servicesFetchedAt = 0;
// `ensureLedger` must run at most once concurrently — otherwise
// parallel `runInference` calls each see the ledger below the minimum
// and each issue their own depositFund, over-withdrawing from the
// wallet.
let ledgerPromise: Promise<LedgerTuple> | undefined;
const acknowledged = new Set<string>();

export async function getBroker(): Promise<ZGComputeBroker> {
  if (!brokerPromise) {
    const p = (async () => {
      const { createZGComputeNetworkBroker } = loadBrokerSDK();
      // Broker expects a v6 ethers.Wallet. Our signer matches at
      // runtime; the SDK's internal type is looser.
      const broker = await createZGComputeNetworkBroker(getSigner());
      logger.info("0G compute broker ready");
      return broker;
    })();
    // Don't poison the cache with a rejected promise — let the next
    // caller retry from scratch.
    p.catch(() => {
      if (brokerPromise === p) brokerPromise = undefined;
    });
    brokerPromise = p;
  }
  return brokerPromise;
}

export interface DiscoveredService {
  providerAddress: string;
  model: string;
  endpoint: string;
  verifiability: string;
  teeVerified: boolean;
  serviceType: string;
}

export async function listServices(): Promise<ServiceTuple[]> {
  const now = Date.now();
  const isStale = now - servicesFetchedAt > SERVICES_TTL_MS;
  if (!servicesPromise || isStale) {
    const p = (async () => {
      const broker = await getBroker();
      const services = (await broker.inference.listService()) as unknown as ServiceTuple[];
      logger.info({ count: services.length }, "discovered compute services");
      servicesFetchedAt = Date.now();
      return services;
    })();
    p.catch(() => {
      if (servicesPromise === p) {
        servicesPromise = undefined;
        servicesFetchedAt = 0;
      }
    });
    servicesPromise = p;
  }
  return servicesPromise;
}

/** Refresh the service list — call when providers rotate. */
export function invalidateServiceCache() {
  servicesPromise = undefined;
  servicesFetchedAt = 0;
}

/**
 * Pick the TEE chatbot provider whose model name matches `modelHint`
 * (substring, case-insensitive). Falls back to the first TEE-verified
 * chatbot if no match, and logs a warning so silent mismatches are
 * traceable — an unintended fallback that ships GLM-5 reasoning via a
 * Qwen provider should be loud.
 */
export async function pickTeeChatbot(modelHint: string): Promise<DiscoveredService> {
  const services = await listServices();
  const chatbots = services.filter((s) => s[1] === "chatbot" && s[10] === true);
  if (chatbots.length === 0) {
    throw new Error("no TEE-verified chatbot services on this network");
  }
  const hint = modelHint.toLowerCase();
  const match = chatbots.find((s) => s[6].toLowerCase().includes(hint));
  const preferred = match ?? chatbots[0];
  if (!preferred) throw new Error("no TEE chatbot matched hint");

  if (!match) {
    logger.warn(
      {
        requestedHint: modelHint,
        availableModels: chatbots.map((s) => s[6]),
        fellBackTo: preferred[6],
      },
      "pickTeeChatbot fell back — no provider matched the model hint",
    );
  }

  return {
    providerAddress: preferred[0],
    serviceType: preferred[1],
    endpoint: preferred[2],
    model: preferred[6],
    verifiability: preferred[7],
    teeVerified: preferred[10],
  };
}

/**
 * Resolve a specific provider address to a DiscoveredService. Throws if
 * the address isn't currently in listService() (provider offline, wrong
 * chain, etc.) — fail loud so operators fix the env, not silently fall
 * back to a random chatbot.
 */
export async function pickByAddress(address: string): Promise<DiscoveredService> {
  const services = await listServices();
  const match = services.find(
    (s) => s[0].toLowerCase() === address.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `provider ${address} not found in current listService() response — check network/provider status`,
    );
  }
  return {
    providerAddress: match[0],
    serviceType: match[1],
    endpoint: match[2],
    model: match[6],
    verifiability: match[7],
    teeVerified: match[10],
  };
}

/**
 * Pick N distinct TEE chatbot providers for a multi-agent swarm.
 * De-dupes by providerAddress; returns up to `count` distinct entries.
 * When `preferredAddresses` is supplied, those addresses (if present in
 * listService()) are placed first and in order.
 */
export async function pickTeeChatbotSwarm(
  count: number,
  preferredAddresses?: string[],
): Promise<DiscoveredService[]> {
  const services = await listServices();
  const chatbots = services.filter((s) => s[1] === "chatbot" && s[10] === true);

  const byAddress = new Map<string, (typeof chatbots)[number]>();
  for (const s of chatbots) byAddress.set(s[0].toLowerCase(), s);

  const seen = new Set<string>();
  const picks: DiscoveredService[] = [];

  const push = (s: (typeof chatbots)[number]) => {
    if (seen.has(s[0])) return;
    seen.add(s[0]);
    picks.push({
      providerAddress: s[0],
      serviceType: s[1],
      endpoint: s[2],
      model: s[6],
      verifiability: s[7],
      teeVerified: s[10],
    });
  };

  // Preferred addresses first, in order.
  if (preferredAddresses) {
    for (const addr of preferredAddresses) {
      const match = byAddress.get(addr.toLowerCase());
      if (match) push(match);
      if (picks.length === count) break;
    }
  }

  // Fill remaining slots with any discovered chatbots.
  for (const s of chatbots) {
    if (picks.length === count) break;
    push(s);
  }

  if (picks.length === 0) {
    throw new Error("no TEE chatbot providers for swarm");
  }
  return picks;
}

/**
 * Ensure the ledger has at least `MIN_LEDGER_0G` available. Creates the
 * ledger on the fly if missing, tops up otherwise.
 *
 * Serialised via `ledgerPromise` so parallel `runInference` calls all
 * await the same top-up — otherwise each one observes the same deficit
 * and each issues its own `depositFund`, multiplying the withdrawal
 * from the wallet.
 */
export async function ensureLedger(): Promise<LedgerTuple> {
  if (!ledgerPromise) {
    const p = runEnsureLedger();
    p.catch(() => {
      // Don't trap callers behind a rejected cache — the next caller
      // retries from scratch.
      if (ledgerPromise === p) ledgerPromise = undefined;
    });
    ledgerPromise = p;
  }
  return ledgerPromise;
}

async function runEnsureLedger(): Promise<LedgerTuple> {
  const broker = await getBroker();
  let ledger: LedgerTuple;
  try {
    ledger = (await broker.ledger.getLedger()) as unknown as LedgerTuple;
  } catch {
    logger.info({ min: MIN_LEDGER_0G }, "ledger missing — creating with minimum balance");
    await broker.ledger.addLedger(MIN_LEDGER_0G);
    ledger = (await broker.ledger.getLedger()) as unknown as LedgerTuple;
  }

  const available = ledger[2];
  if (available < MIN_LEDGER_WEI) {
    const shortfall = MIN_LEDGER_WEI - available;
    const shortfallEth = Number(ethers.formatEther(shortfall));
    logger.info({ shortfall: shortfallEth }, "topping up ledger");
    await broker.ledger.depositFund(shortfallEth);
    ledger = (await broker.ledger.getLedger()) as unknown as LedgerTuple;
  }

  // Success — release the gate so a subsequent inference after some
  // time can refresh the balance. (Don't cache forever; subsequent
  // inferences want fresh available-balance reads before committing to
  // a new request.)
  ledgerPromise = undefined;
  return ledger;
}

/** Acknowledge once per process. */
export async function acknowledgeProvider(providerAddress: string): Promise<void> {
  if (acknowledged.has(providerAddress)) return;
  const broker = await getBroker();
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("already")) throw err;
  }
  acknowledged.add(providerAddress);
}

/** Full setup for a provider — ledger + acknowledge — safe to call per inference. */
export async function primeProvider(providerAddress: string): Promise<void> {
  await ensureLedger();
  await acknowledgeProvider(providerAddress);
}

/**
 * Thin wrapper around inference metadata + auth headers. Callers use
 * these to issue their own fetch to the `${endpoint}/chat/completions`
 * URL so they can consume the stream on their own terms.
 */
export async function getInferenceContext(providerAddress: string) {
  const broker = await getBroker();
  const [metadata, headers] = await Promise.all([
    broker.inference.getServiceMetadata(providerAddress),
    broker.inference.getRequestHeaders(providerAddress),
  ]);
  return { ...metadata, headers };
}

export async function processResponse(
  providerAddress: string,
  chatId: string,
  usage: unknown,
): Promise<void> {
  const broker = await getBroker();
  await broker.inference.processResponse(
    providerAddress,
    chatId,
    typeof usage === "string" ? usage : JSON.stringify(usage ?? {}),
  );
}

/** Test-only reset. */
export function __resetComputeClients() {
  brokerPromise = undefined;
  servicesPromise = undefined;
  servicesFetchedAt = 0;
  ledgerPromise = undefined;
  acknowledged.clear();
}
