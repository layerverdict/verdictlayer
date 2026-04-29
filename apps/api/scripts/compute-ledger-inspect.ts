import { ethers } from "ethers";
import { loadBrokerSDK } from "../src/lib/broker.js";
import { getSigner } from "../src/lib/chain.js";

async function main() {
  const signer = getSigner();
  const { createZGComputeNetworkBroker } = await loadBrokerSDK();
  const broker = await createZGComputeNetworkBroker(signer as unknown as never);
  const raw = await broker.ledger.getLedger();
  console.log("raw ledger return:", raw);
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      const s =
        typeof v === "bigint" ? `${v} (${ethers.formatEther(v)} 0G)` : String(v);
      console.log(`  [${i}]`, s);
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const s =
        typeof v === "bigint" ? `${v} (${ethers.formatEther(v)} 0G)` : String(v);
      console.log(`  .${k}`, s);
    }
  }

  // Per-provider sub-account balance
  const providers = [
    "0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0",
    "0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C",
    "0x4415ef5CBb415347bb18493af7cE01f225Fc0868",
  ];
  const anyBroker = broker as unknown as {
    inference: {
      getAccount: (provider: string) => Promise<unknown>;
    };
  };
  for (const prov of providers) {
    try {
      const acc = await anyBroker.inference.getAccount(prov);
      console.log(`\nprovider ${prov} account:`);
      if (Array.isArray(acc)) {
        for (let i = 0; i < acc.length; i++) {
          const v = (acc as unknown[])[i];
          const s =
            typeof v === "bigint" ? `${v} (${ethers.formatEther(v)} 0G)` : String(v);
          console.log(`  [${i}]`, s);
        }
      } else if (acc && typeof acc === "object") {
        for (const [k, v] of Object.entries(acc)) {
          const s =
            typeof v === "bigint" ? `${v} (${ethers.formatEther(v)} 0G)` : String(v);
          console.log(`  .${k}`, s);
        }
      }
    } catch (err) {
      console.log(`provider ${prov}: getAccount failed ${(err as Error).message.slice(0, 120)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
