"use client";

import { useMemo } from "react";
import { useChainId, useReadContract, useReadContracts } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/verdict/empty-state";
import { Stagger } from "@/components/verdict/motion";
import { PageHeader } from "@/components/verdict/page-header";
import { truncateAddress } from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress } from "@/lib/web3/chains";

type ReputationTuple = {
  totalVerdicts: bigint;
  appealsLost: bigint;
  reputation: bigint;
};

export default function JudgesPage() {
  const chainId = useChainId();
  const registry = maybeContractAddress("reputationRegistry");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protocol · Judges"
        title="TEE Judge reputation"
        description="Every judge that adjudicates on Verdict owns a non-transferable ERC-7857 NFT. Verdict counts, appeal losses, and reputation are on-chain and queryable."
      />
      {!registry ? (
        <NotDeployed />
      ) : (
        <JudgeGallery registry={registry} chainId={chainId} />
      )}
    </div>
  );
}

function NotDeployed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts not deployed on this chain</CardTitle>
        <CardDescription>
          Publish the ReputationRegistry address to{" "}
          <code className="font-mono text-white/70">
            NEXT_PUBLIC_REPUTATION_REGISTRY
          </code>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function JudgeGallery({
  registry,
  chainId,
}: {
  registry: `0x${string}`;
  chainId: number;
}) {
  const total = useReadContract({
    address: registry,
    abi: abis.reputationRegistry,
    functionName: "totalMinted",
  }) as { data: bigint | undefined; isLoading: boolean };

  // totalMinted() returns nextTokenId. Actual minted ids are 1..total-1.
  const totalCount = total.data ? Number(total.data) - 1 : 0;

  const ids = useMemo(
    () => Array.from({ length: Math.max(0, totalCount) }, (_, i) => BigInt(i + 1)),
    [totalCount],
  );

  // Parallel reads per token: ownerOf, reputationOf, dataDescriptionsOf.
  const ownerReads = useReadContracts({
    contracts: ids.map((id) => ({
      address: registry,
      abi: abis.reputationRegistry,
      functionName: "ownerOf",
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });

  const repReads = useReadContracts({
    contracts: ids.map((id) => ({
      address: registry,
      abi: abis.reputationRegistry,
      functionName: "reputationOf",
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });

  const descReads = useReadContracts({
    contracts: ids.map((id) => ({
      address: registry,
      abi: abis.reputationRegistry,
      functionName: "dataDescriptionsOf",
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });

  if (total.isLoading || ownerReads.isLoading || repReads.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (ids.length === 0) {
    return (
      <EmptyState
        title="No judges minted yet"
        description="The protocol mints a ReputationRegistry NFT for each TEE agent the first time they settle a verdict."
      />
    );
  }

  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ids.map((tokenId, idx) => {
        const ownerRes = ownerReads.data?.[idx];
        const repRes = repReads.data?.[idx];
        const descRes = descReads.data?.[idx];
        if (!ownerRes || ownerRes.status !== "success") return null;

        const owner = ownerRes.result as unknown as `0x${string}`;
        const rep =
          repRes && repRes.status === "success"
            ? (repRes.result as unknown as ReputationTuple)
            : null;
        const descs =
          descRes && descRes.status === "success"
            ? (descRes.result as unknown as string[])
            : [];

        return (
          <JudgeCard
            key={tokenId.toString()}
            tokenId={tokenId}
            owner={owner}
            rep={rep}
            descriptions={descs}
            chainId={chainId}
          />
        );
      })}
    </Stagger>
  );
}

function JudgeCard({
  tokenId,
  owner,
  rep,
  descriptions,
  chainId,
}: {
  tokenId: bigint;
  owner: `0x${string}`;
  rep: ReputationTuple | null;
  descriptions: string[];
  chainId: number;
}) {
  const model = descriptions[0] ?? "unknown model";

  const reputation = rep ? Number(rep.reputation) : 0;
  const totalVerdicts = rep ? Number(rep.totalVerdicts) : 0;
  const appealsLost = rep ? Number(rep.appealsLost) : 0;
  const winRate =
    totalVerdicts > 0
      ? Math.max(0, ((totalVerdicts - appealsLost) / totalVerdicts) * 100)
      : null;

  const repTone =
    reputation >= 1000
      ? ("success" as const)
      : reputation >= 800
        ? ("info" as const)
        : reputation >= 500
          ? ("warning" as const)
          : ("danger" as const);

  return (
    <Card className="overflow-hidden">
      <div className="relative h-32 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(255,255,255,0.15),_transparent_50%)]" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">
            ERC-7857 · Agent ID
          </span>
        </div>
        <div className="absolute right-4 top-3 font-mono text-3xl font-light tracking-tight text-white/80">
          #{tokenId.toString()}
        </div>
      </div>
      <CardHeader className="gap-1">
        <CardTitle className="text-base">{model}</CardTitle>
        <CardDescription>
          <a
            href={explorerAddress(chainId, owner)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:text-white/70"
          >
            {truncateAddress(owner, 6)}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">
              Reputation
            </div>
            <div className="font-mono text-3xl font-medium tracking-tight text-white">
              {reputation}
            </div>
          </div>
          <Badge variant={repTone}>
            {reputation >= 1000
              ? "healthy"
              : reputation >= 800
                ? "active"
                : reputation >= 500
                  ? "watch"
                  : "low"}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
          <Stat label="Verdicts" value={totalVerdicts} />
          <Stat label="Appeals lost" value={appealsLost} tone="warn" />
          <Stat
            label="Win rate"
            value={winRate !== null ? `${Math.round(winRate)}%` : "—"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[9px] uppercase tracking-widest text-white/30">
        {label}
      </div>
      <div
        className={`font-mono text-lg ${
          tone === "warn" ? "text-yellow-200/80" : "text-white/90"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
