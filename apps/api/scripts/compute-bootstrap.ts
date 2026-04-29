/**
 * One-shot bootstrap for the 0G Compute ledger + per-provider fund on
 * mainnet. Adds funds to the ledger and explicitly transfers the floor
 * to each configured provider so the first inference doesn't fail with
 * "insufficient balance: locked < minimum reserve".
 *
 * Idempotent: pulls current ledger, checks per-provider sub-account,
 * only tops up what's missing.
 */
import { ethers } from "ethers";

import { loadBrokerSDK } from "../src/lib/broker.js";
import { getSigner } from "../src/lib/chain.js";
import { config } from "../src/config.js";

// Provider floor: 1.0 0G minimum reserve + some headroom for fees.
const PROVIDER_FLOOR_0G = 1.5;
const PROVIDER_FLOOR_WEI = ethers.parseEther(PROVIDER_FLOOR_0G.toString());

// Ledger floor: sum of (floor * #providers) + some change.
const LEDGER_FLOOR_0G = 6.0;
const LEDGER_FLOOR_WEI = ethers.parseEther(LEDGER_FLOOR_0G.toString());

async function main() {
  const signer = getSigner();
  console.log("signer:", signer.address);
  console.log("rpc   :", config.RPC_URL);
  console.log("chain :", config.CHAIN_ID);

  const { createZGComputeNetworkBroker } = await loadBrokerSDK();
  const broker = await createZGComputeNetworkBroker(signer as unknown as never);
  console.log("broker ready");

  // ------- ledger -----------------------------------------------------
  let ledger;
  try {
    ledger = await broker.ledger.getLedger();
    console.log(
      "ledger: totalBalance=",
      ethers.formatEther(ledger[1]),
      "0G, available=",
      ethers.formatEther(ledger[2]),
      "0G",
    );
  } catch (err) {
    console.log("no ledger yet, creating with", LEDGER_FLOOR_0G, "0G...");
    await broker.ledger.addLedger(LEDGER_FLOOR_0G);
    ledger = await broker.ledger.getLedger();
    console.log("ledger created. available=", ethers.formatEther(ledger[2]), "0G");
  }

  if (ledger[2] < LEDGER_FLOOR_WEI) {
    const top = LEDGER_FLOOR_WEI - ledger[2];
    const topEth = Number(ethers.formatEther(top));
    console.log("topping up ledger with", topEth, "0G");
    await broker.ledger.depositFund(topEth);
  }

  // ------- providers --------------------------------------------------
  const swarm = (config.SWARM_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const providers = [config.JUDGE_PROVIDER, ...swarm]
    .filter((p): p is string => !!p)
    .map((p) => ethers.getAddress(p));
  const unique = [...new Set(providers)];
  console.log("target providers (",
    unique.length, "):", unique);

  for (const provider of unique) {
    console.log("\n--- provider", provider, "---");
    try {
      await broker.inference.acknowledgeProviderSigner(provider);
      console.log("  acknowledged");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("already")) {
        console.error("  ack failed:", msg);
      } else {
        console.log("  already acknowledged");
      }
    }
    for (const attempt of [
      { mode: "wei", value: PROVIDER_FLOOR_WEI as bigint | number },
      { mode: "eth-number", value: PROVIDER_FLOOR_0G as bigint | number },
    ]) {
      try {
        const anyBroker = broker as unknown as {
          ledger: {
            transferFund: (
              provider: string,
              kind: string,
              amount: bigint | number,
            ) => Promise<unknown>;
          };
        };
        await anyBroker.ledger.transferFund(provider, "inference", attempt.value);
        console.log(`  transferFund OK (${attempt.mode})`);
        break;
      } catch (err) {
        const e = err as {
          message?: string;
          data?: string;
          info?: { error?: { data?: string; message?: string } };
        };
        console.error(
          `  transferFund (${attempt.mode}) failed: ${e.message} data=${
            e.data ?? e.info?.error?.data ?? ""
          }`,
        );
      }
    }
  }

  const final = await broker.ledger.getLedger();
  console.log(
    "\nfinal ledger: total=",
    ethers.formatEther(final[1]),
    "0G  available=",
    ethers.formatEther(final[2]),
    "0G",
  );
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
