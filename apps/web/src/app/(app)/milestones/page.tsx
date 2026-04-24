"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/verdict/empty-state";
import { PageHeader } from "@/components/verdict/page-header";
import { formatAmount, formatTimestamp, truncateAddress } from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress } from "@/lib/web3/chains";
import type { GrantSummary } from "@/lib/web3/milestones";

export default function MilestonesListPage() {
  const chainId = useChainId();
  const { address } = useAccount();
  const vaultAddress = maybeContractAddress("milestoneVault");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Milestones"
        title="DAO Milestone Vault"
        description="Pre-approve acceptance criteria once. Grantees submit proof per milestone; the judge verifies, the vault releases the slice. No Snapshot loops."
        action={
          vaultAddress ? (
            <Button asChild>
              <Link href="/milestones/new">Create grant</Link>
            </Button>
          ) : null
        }
      />

      {!vaultAddress ? (
        <NotDeployed chainId={chainId} />
      ) : (
        <GrantList
          address={address}
          vaultAddress={vaultAddress}
          chainId={chainId}
        />
      )}
    </div>
  );
}

function NotDeployed({ chainId }: { chainId: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts not deployed on this chain</CardTitle>
        <CardDescription>
          Publish the MilestoneVault address on chain {chainId} to{" "}
          <code className="font-mono text-white/70">NEXT_PUBLIC_MILESTONE_VAULT</code>.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function GrantList({
  address,
  vaultAddress,
  chainId,
}: {
  address?: `0x${string}`;
  vaultAddress: `0x${string}`;
  chainId: number;
}) {
  const total = useReadContract({
    address: vaultAddress,
    abi: abis.milestoneVault,
    functionName: "totalGrants",
  }) as { data: bigint | undefined; isLoading: boolean };

  const totalCount = total.data ? Number(total.data) : 0;

  const ids = useMemo(
    () => Array.from({ length: totalCount }, (_, i) => BigInt(i + 1)),
    [totalCount],
  );

  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: vaultAddress,
      abi: abis.milestoneVault,
      functionName: "getGrant",
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });

  if (total.isLoading || isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const rows =
    data
      ?.map((res, idx) => {
        if (!res || res.status !== "success") return null;
        const id = ids[idx];
        if (id === undefined) return null;
        const tuple = res.result as unknown as readonly [
          `0x${string}`,
          `0x${string}`,
          `0x${string}`,
          bigint,
          bigint,
          bigint,
          boolean,
          bigint,
        ];
        const summary: GrantSummary = {
          dao: tuple[0],
          grantee: tuple[1],
          token: tuple[2],
          totalAmount: tuple[3],
          releasedAmount: tuple[4],
          grantExpiresAt: tuple[5],
          reclaimed: tuple[6],
          milestoneCount: tuple[7],
        };
        return { id, summary };
      })
      .filter((x): x is { id: bigint; summary: GrantSummary } => x !== null) ?? [];

  const mine = address
    ? rows.filter(
        ({ summary }) =>
          summary.dao.toLowerCase() === address.toLowerCase() ||
          summary.grantee.toLowerCase() === address.toLowerCase(),
      )
    : rows;

  if (mine.length === 0) {
    return (
      <EmptyState
        title="No grants yet"
        description="DAOs define milestone criteria + amounts and pre-fund the vault. Grantees submit per-milestone evidence and funds auto-release on verification."
        action={
          <div className="flex items-center gap-3">
            <Button asChild>
              <Link href="/milestones/new">Create grant</Link>
            </Button>
            <Button variant="ghost" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="text-xs font-mono uppercase tracking-widest text-white/30">
        <a
          href={explorerAddress(chainId, vaultAddress)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/70"
        >
          Vault · {truncateAddress(vaultAddress, 6)}
        </a>
      </div>
      {mine.map(({ id, summary }) => (
        <GrantRow key={id.toString()} id={id} summary={summary} address={address} />
      ))}
    </div>
  );
}

function GrantRow({
  id,
  summary,
  address,
}: {
  id: bigint;
  summary: GrantSummary;
  address?: `0x${string}`;
}) {
  const role =
    address && summary.dao.toLowerCase() === address.toLowerCase()
      ? "dao"
      : address && summary.grantee.toLowerCase() === address.toLowerCase()
        ? "grantee"
        : "observer";

  const progress =
    summary.totalAmount > 0n
      ? Number((summary.releasedAmount * 100n) / summary.totalAmount)
      : 0;

  return (
    <Link href={`/milestones/${id.toString()}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Grant #{id.toString()}</CardTitle>
              <Badge variant="outline">
                {summary.milestoneCount.toString()} milestones
              </Badge>
              <Badge variant="secondary">{role}</Badge>
              {summary.reclaimed ? (
                <Badge variant="warning">reclaimed</Badge>
              ) : null}
            </div>
            <CardDescription className="max-w-xl">
              {formatAmount(summary.releasedAmount)} /{" "}
              {formatAmount(summary.totalAmount)} released ·{" "}
              {truncateAddress(summary.token, 4)}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-white">{progress}%</div>
            <div className="font-mono text-[11px] text-white/40">released</div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50">
            <span>
              DAO{" "}
              <span className="font-mono text-white/70">
                {truncateAddress(summary.dao, 4)}
              </span>
            </span>
            <span>
              Grantee{" "}
              <span className="font-mono text-white/70">
                {truncateAddress(summary.grantee, 4)}
              </span>
            </span>
            <span>
              Expires{" "}
              <span className="font-mono text-white/70">
                {formatTimestamp(Number(summary.grantExpiresAt) * 1000)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
