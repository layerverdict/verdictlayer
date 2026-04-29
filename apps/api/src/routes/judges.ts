import type { FastifyPluginAsync } from "fastify";
import { ethers } from "ethers";

import { getContracts, getProvider } from "../lib/chain.js";

interface JudgeRow {
  tokenId: number;
  owner: `0x${string}`;
  model: string;
  descriptions: string[];
  totalVerdicts: number;
  appealsLost: number;
  reputation: number;
}

let cache:
  | { at: number; data: { judges: JudgeRow[] } }
  | undefined;
const CACHE_TTL_MS = 10_000;

/**
 * Judge gallery endpoint.
 *
 * Aggregates ReputationRegistry reads (totalMinted → per-token
 * ownerOf / reputationOf / dataDescriptionsOf) into a single HTTP
 * response so the frontend can render the gallery from one fetch in a
 * Server Component. Batched ethers calls run in parallel against the
 * provider; total hops is O(1) HTTP from the browser's point of view.
 *
 * Result is cached in-process for CACHE_TTL_MS — the registry mutates
 * rarely (a new judge per mint, reputation per verdict) and the
 * 10-second window is well under the revalidate envelope of the RSC
 * page that consumes this.
 */
export const judgesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/judges", async (_req) => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return cache.data;
    }

    const contracts = await getContracts();
    const provider = getProvider();
    const registry = contracts.reputationRegistry.connect(provider);

    const totalRaw = (await registry.getFunction("totalMinted").staticCall()) as bigint;
    // totalMinted() returns nextTokenId; minted ids are 1..total-1.
    const totalCount = Number(totalRaw) - 1;
    if (totalCount <= 0) {
      const empty = { judges: [] as JudgeRow[] };
      cache = { at: Date.now(), data: empty };
      return empty;
    }

    const ids = Array.from({ length: totalCount }, (_, i) => BigInt(i + 1));

    // Parallel batch: ownerOf + reputationOf + dataDescriptionsOf per id.
    const [owners, reputations, descriptions] = await Promise.all([
      Promise.all(
        ids.map((id) =>
          (registry.getFunction("ownerOf").staticCall(id) as Promise<string>).catch(
            () => ethers.ZeroAddress,
          ),
        ),
      ),
      Promise.all(
        ids.map((id) =>
          (
            registry
              .getFunction("reputationOf")
              .staticCall(id) as Promise<[bigint, bigint, bigint]>
          ).catch(() => [0n, 0n, 0n] as [bigint, bigint, bigint]),
        ),
      ),
      Promise.all(
        ids.map((id) =>
          (
            registry
              .getFunction("dataDescriptionsOf")
              .staticCall(id) as Promise<string[]>
          ).catch(() => [] as string[]),
        ),
      ),
    ]);

    const judges: JudgeRow[] = ids.map((id, i) => {
      const rep = reputations[i] ?? ([0n, 0n, 0n] as [bigint, bigint, bigint]);
      const [totalVerdicts, appealsLost, reputation] = rep;
      const descs = descriptions[i] ?? [];
      return {
        tokenId: Number(id),
        owner: owners[i] as `0x${string}`,
        model: descs[0] ?? "unknown model",
        descriptions: descs,
        totalVerdicts: Number(totalVerdicts),
        appealsLost: Number(appealsLost),
        reputation: Number(reputation),
      };
    });

    const data = { judges };
    cache = { at: Date.now(), data };
    return data;
  });
};
