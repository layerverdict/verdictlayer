/**
 * List all compute services on the current network, with prices.
 *
 * Helps you pick a provider that fits the ledger budget before running
 * the full TEE validation gate.
 */

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env") });
loadEnv({ path: resolve(__dirname, "..", "..", "..", ".env") });

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

async function main() {
  const rpc = process.env.RPC_URL;
  const pk = process.env.PRIVATE_KEY;
  if (!rpc || !pk) {
    console.error("missing RPC_URL or PRIVATE_KEY");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const broker = await createZGComputeNetworkBroker(wallet as never);

  const services = (await broker.inference.listService()) as unknown as unknown[][];

  console.log(`\nfound ${services.length} services\n`);

  for (const s of services) {
    const inputPrice = s[3] as bigint;
    const outputPrice = s[4] as bigint;
    console.log({
      provider: s[0],
      type: s[1],
      url: s[2],
      inputPriceWei: inputPrice?.toString(),
      outputPriceWei: outputPrice?.toString(),
      inputPriceHuman: inputPrice != null ? ethers.formatEther(inputPrice) : "?",
      outputPriceHuman: outputPrice != null ? ethers.formatEther(outputPrice) : "?",
      model: s[6],
      verifiability: s[7],
      tee: s[10],
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
