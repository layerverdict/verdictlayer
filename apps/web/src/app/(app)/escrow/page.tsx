"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";

import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress } from "@/lib/web3/chains";
import { decodeStatus, ESCROW_STATUS_LABEL, type EscrowRecord } from "@/lib/web3/escrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/verdict/empty-state";
import { PageHeader } from "@/components/verdict/page-header";
import { formatAmount, truncateAddress } from "@/lib/format";

export default function EscrowListPage() {
  const chainId = useChainId();
  const { address } = useAccount();
  const escrowAddress = maybeContractAddress("escrow");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Escrow"
        title="Freelance Escrow"
        description="Lock funds, publish a scope, and let a TEE-attested judge settle disputes in seconds. Every verdict is replayable from on-chain evidence."
        action={
          escrowAddress ? (
            <Button asChild>
              <Link href="/escrow/new">New escrow</Link>
            </Button>
          ) : null
        }
      />

      {!escrowAddress ? (
        <NotDeployed chainId={chainId} />
      ) : (
        <EscrowList address={address} escrowAddress={escrowAddress} chainId={chainId} />
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
          The Escrow app on chain {chainId} is waiting for the protocol deploy.
          Switch to the network where Verdict is live, or re-run the deploy
          script and export the addresses to <code className="font-mono text-white/70">NEXT_PUBLIC_ESCROW</code>.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function EscrowList({
  address,
  escrowAddress,
  chainId,
}: {
  address?: `0x${string}`;
  escrowAddress: `0x${string}`;
  chainId: number;
}) {
  const total = useReadContract({
    address: escrowAddress,
    abi: abis.escrow,
    functionName: "totalEscrows",
  });

  const totalCount = total.data ? Number(total.data) : 0;

  const ids = useMemo(
    () => Array.from({ length: totalCount }, (_, i) => BigInt(i + 1)),
    [totalCount],
  );

  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: escrowAddress,
      abi: abis.escrow,
      functionName: "getEscrow",
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
        const record = res.result as unknown as EscrowRecord;
        return { id, record };
      })
      .filter((x): x is { id: bigint; record: EscrowRecord } => x !== null) ?? [];

  const mine = address
    ? rows.filter(
        ({ record }) =>
          record.client.toLowerCase() === address.toLowerCase() ||
          record.freelancer.toLowerCase() === address.toLowerCase(),
      )
    : rows;

  if (mine.length === 0) {
    return (
      <EmptyState
        title="No escrows yet"
        description="Create one to lock funds against a scope. Freelancers get paid on delivery, or dispute gets routed to a TEE judge."
        action={
          <div className="flex items-center gap-3">
            <Button asChild>
              <Link href="/escrow/new">Create escrow</Link>
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
          href={explorerAddress(chainId, escrowAddress)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/70"
        >
          Contract · {truncateAddress(escrowAddress, 6)}
        </a>
      </div>
      {mine.map(({ id, record }) => (
        <EscrowRow key={id.toString()} id={id} record={record} address={address} />
      ))}
    </div>
  );
}

function EscrowRow({
  id,
  record,
  address,
}: {
  id: bigint;
  record: EscrowRecord;
  address?: `0x${string}`;
}) {
  const status = decodeStatus(record.status);
  const role =
    address && record.client.toLowerCase() === address.toLowerCase()
      ? "client"
      : address && record.freelancer.toLowerCase() === address.toLowerCase()
        ? "freelancer"
        : "observer";

  return (
    <Link href={`/escrow/${id.toString()}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">
                Escrow #{id.toString()}
              </CardTitle>
              <Badge variant="outline">{ESCROW_STATUS_LABEL[status]}</Badge>
              <Badge variant="secondary">{role}</Badge>
            </div>
            <CardDescription className="line-clamp-2 max-w-xl">
              {record.scope || "No scope provided"}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-white">
              {formatAmount(record.amount)}{" "}
              <span className="text-xs text-white/40">tokens</span>
            </div>
            <div className="font-mono text-[11px] text-white/40">
              {truncateAddress(record.token, 4)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-0 text-xs text-white/50">
          <span>
            Client{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(record.client, 4)}
            </span>
          </span>
          <span>
            Freelancer{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(record.freelancer, 4)}
            </span>
          </span>
          <span>
            Deadline{" "}
            <span className="font-mono text-white/70">
              {new Date(Number(record.deadline) * 1000).toLocaleDateString()}
            </span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
