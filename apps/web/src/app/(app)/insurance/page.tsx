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
import {
  decodePolicyStatus,
  POLICY_STATUS_LABEL,
  type Policy,
} from "@/lib/web3/insurance";

export default function InsuranceListPage() {
  const chainId = useChainId();
  const { address } = useAccount();
  const insuranceAddress = maybeContractAddress("parametricInsurance");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Insurance"
        title="Parametric Insurance"
        description="Issue a policy, lock a payout, and let the judge verify the trigger condition from oracle evidence. Claims settle in seconds — no adjuster, no paperwork."
        action={
          insuranceAddress ? (
            <Button asChild>
              <Link href="/insurance/new">Underwrite policy</Link>
            </Button>
          ) : null
        }
      />

      {!insuranceAddress ? (
        <NotDeployed chainId={chainId} />
      ) : (
        <PolicyList
          address={address}
          insuranceAddress={insuranceAddress}
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
          Publish the ParametricInsurance address on chain {chainId} to{" "}
          <code className="font-mono text-white/70">NEXT_PUBLIC_PARAMETRIC_INSURANCE</code>.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function PolicyList({
  address,
  insuranceAddress,
  chainId,
}: {
  address?: `0x${string}`;
  insuranceAddress: `0x${string}`;
  chainId: number;
}) {
  const total = useReadContract({
    address: insuranceAddress,
    abi: abis.parametricInsurance,
    functionName: "totalPolicies",
  }) as { data: bigint | undefined; isLoading: boolean };

  const totalCount = total.data ? Number(total.data) : 0;

  const ids = useMemo(
    () => Array.from({ length: totalCount }, (_, i) => BigInt(i + 1)),
    [totalCount],
  );

  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: insuranceAddress,
      abi: abis.parametricInsurance,
      functionName: "getPolicy",
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
        return { id, record: res.result as unknown as Policy };
      })
      .filter((x): x is { id: bigint; record: Policy } => x !== null) ?? [];

  const mine = address
    ? rows.filter(
        ({ record }) =>
          record.insurer.toLowerCase() === address.toLowerCase() ||
          record.holder.toLowerCase() === address.toLowerCase(),
      )
    : rows;

  if (mine.length === 0) {
    return (
      <EmptyState
        title="No policies yet"
        description="Insurers lock the payout and define a parametric trigger. Holders file claims with evidence when the trigger fires."
        action={
          <div className="flex items-center gap-3">
            <Button asChild>
              <Link href="/insurance/new">Underwrite policy</Link>
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
          href={explorerAddress(chainId, insuranceAddress)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/70"
        >
          Contract · {truncateAddress(insuranceAddress, 6)}
        </a>
      </div>
      {mine.map(({ id, record }) => (
        <PolicyRow key={id.toString()} id={id} record={record} address={address} />
      ))}
    </div>
  );
}

function PolicyRow({
  id,
  record,
  address,
}: {
  id: bigint;
  record: Policy;
  address?: `0x${string}`;
}) {
  const status = decodePolicyStatus(record.status);
  const role =
    address && record.insurer.toLowerCase() === address.toLowerCase()
      ? "insurer"
      : address && record.holder.toLowerCase() === address.toLowerCase()
        ? "holder"
        : "observer";

  return (
    <Link href={`/insurance/${id.toString()}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">
                Policy #{id.toString()}
              </CardTitle>
              <Badge variant="outline">{POLICY_STATUS_LABEL[status]}</Badge>
              <Badge variant="secondary">{role}</Badge>
            </div>
            <CardDescription className="line-clamp-2 max-w-xl">
              {record.condition || "No trigger condition set"}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-white">
              {formatAmount(record.payout)} <span className="text-xs text-white/40">0G</span>
            </div>
            <div className="font-mono text-[11px] text-white/40">
              premium {formatAmount(record.premium)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-0 text-xs text-white/50">
          <span>
            Insurer{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(record.insurer, 4)}
            </span>
          </span>
          <span>
            Holder{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(record.holder, 4)}
            </span>
          </span>
          <span>
            Coverage{" "}
            <span className="font-mono text-white/70">
              {formatTimestamp(Number(record.coverageStart) * 1000)} →{" "}
              {formatTimestamp(Number(record.coverageEnd) * 1000)}
            </span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
