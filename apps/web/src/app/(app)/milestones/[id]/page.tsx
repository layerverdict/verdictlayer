"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type Address } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectWall } from "@/components/verdict/connect-wall";
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { PageHeader } from "@/components/verdict/page-header";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import {
  formatAmount,
  formatTimestamp,
  truncateAddress,
  truncateHash,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress } from "@/lib/web3/chains";
import {
  MILESTONE_STATUS,
  MILESTONE_STATUS_LABEL,
  decodeMilestoneStatus,
  type GrantSummary,
  type Milestone,
  type MilestoneStatus,
} from "@/lib/web3/milestones";
import { runTx } from "@/lib/web3/tx";

export default function GrantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "0";
  const vaultAddress = maybeContractAddress("milestoneVault");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Grant · #${id}`}
        title="Grant detail"
        description="Each milestone holds its own slice and its own assertion. Verified milestones release funds automatically; rejected ones can be resubmitted."
        action={
          <Button variant="ghost" asChild>
            <Link href="/milestones">All grants</Link>
          </Button>
        }
      />
      {!vaultAddress ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set{" "}
              <code className="font-mono text-white/70">
                NEXT_PUBLIC_MILESTONE_VAULT
              </code>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ConnectWall>
          <GrantDetail id={BigInt(id)} vaultAddress={vaultAddress} />
        </ConnectWall>
      )}
    </div>
  );
}

function GrantDetail({
  id,
  vaultAddress,
}: {
  id: bigint;
  vaultAddress: Address;
}) {
  const chainId = useChainId();
  const { address } = useAccount();

  const grant = useReadContract({
    address: vaultAddress,
    abi: abis.milestoneVault,
    functionName: "getGrant",
    args: [id],
  });

  const bond = useReadContract({
    address: vaultAddress,
    abi: abis.milestoneVault,
    functionName: "assertionBond",
  }) as { data: bigint | undefined };

  const summary: GrantSummary | null = useMemo(() => {
    if (!grant.data) return null;
    const t = grant.data as unknown as readonly [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      boolean,
      bigint,
    ];
    return {
      dao: t[0],
      grantee: t[1],
      token: t[2],
      totalAmount: t[3],
      releasedAmount: t[4],
      grantExpiresAt: t[5],
      reclaimed: t[6],
      milestoneCount: t[7],
    };
  }, [grant.data]);

  const milestoneIndexes = useMemo(
    () =>
      summary
        ? Array.from({ length: Number(summary.milestoneCount) }, (_, i) => i)
        : [],
    [summary],
  );

  const milestoneReads = useReadContracts({
    contracts: milestoneIndexes.map((i) => ({
      address: vaultAddress,
      abi: abis.milestoneVault,
      functionName: "getMilestone",
      args: [id, BigInt(i)],
    })),
    query: { enabled: milestoneIndexes.length > 0 },
  });

  if (grant.isLoading || !summary) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const role =
    address?.toLowerCase() === summary.dao.toLowerCase()
      ? "dao"
      : address?.toLowerCase() === summary.grantee.toLowerCase()
        ? "grantee"
        : "observer";

  return (
    <div className="space-y-6">
      <OverviewCard
        id={id}
        summary={summary}
        chainId={chainId}
        vaultAddress={vaultAddress}
        role={role}
      />

      <ReclaimRow
        id={id}
        summary={summary}
        role={role}
        chainId={chainId}
        vaultAddress={vaultAddress}
        onDone={() => grant.refetch()}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Milestones</h2>
        {milestoneReads.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="grid gap-4">
            {milestoneIndexes.map((i) => {
              const res = milestoneReads.data?.[i];
              if (!res || res.status !== "success") return null;
              const m = res.result as unknown as Milestone;
              return (
                <MilestoneCard
                  key={i}
                  grantId={id}
                  index={i}
                  milestone={m}
                  role={role}
                  grantee={summary.grantee}
                  vaultAddress={vaultAddress}
                  chainId={chainId}
                  bond={bond.data ?? 0n}
                  onRefetch={() => {
                    void milestoneReads.refetch();
                    void grant.refetch();
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCard({
  id,
  summary,
  chainId,
  vaultAddress,
  role,
}: {
  id: bigint;
  summary: GrantSummary;
  chainId: number;
  vaultAddress: Address;
  role: "dao" | "grantee" | "observer";
}) {
  const progress =
    summary.totalAmount > 0n
      ? Number((summary.releasedAmount * 100n) / summary.totalAmount)
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Grant #{id.toString()}</CardTitle>
          <Badge variant="outline">
            {summary.milestoneCount.toString()} milestones
          </Badge>
          <Badge variant="secondary">you are {role}</Badge>
          {summary.reclaimed ? <Badge variant="warning">reclaimed</Badge> : null}
        </div>
        <CardDescription>
          <a
            href={explorerAddress(chainId, vaultAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:text-white/70"
          >
            {truncateAddress(vaultAddress, 6)}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div className="font-mono text-3xl text-white">
            {formatAmount(summary.releasedAmount)}
            <span className="mx-2 text-white/30">/</span>
            {formatAmount(summary.totalAmount)}
          </div>
          <span className="font-mono text-[11px] text-white/40">
            {truncateAddress(summary.token, 4)} · {progress}% released
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Field label="DAO" value={truncateAddress(summary.dao, 6)} mono />
          <Field
            label="Grantee"
            value={truncateAddress(summary.grantee, 6)}
            mono
          />
          <Field
            label="Expires"
            value={formatTimestamp(Number(summary.grantExpiresAt) * 1000)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">
        {label}
      </div>
      <div className={cn("text-sm text-white/80", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function ReclaimRow({
  id,
  summary,
  role,
  chainId,
  vaultAddress,
  onDone,
}: {
  id: bigint;
  summary: GrantSummary;
  role: "dao" | "grantee" | "observer";
  chainId: number;
  vaultAddress: Address;
  onDone: () => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = nowSec > Number(summary.grantExpiresAt);
  if (role !== "dao" || !expired || summary.reclaimed) return null;

  async function onReclaim() {
    await runTx(
      writeContractAsync({
        address: vaultAddress,
        abi: abis.milestoneVault,
        functionName: "reclaim",
        args: [id],
      }),
      {
        chainId,
        pending: "Reclaiming residue…",
        success: "Residue returned",
      },
    );
    onDone();
  }

  return (
    <Card className="border-warning/30 bg-warning/10">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-white">
            Grant window closed
          </div>
          <div className="text-xs text-white/60">
            Unreleased milestones are stuck. Reclaim the residue back to the DAO.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onReclaim}>
          Reclaim residue
        </Button>
      </CardContent>
    </Card>
  );
}

function MilestoneCard({
  grantId,
  index,
  milestone,
  role,
  grantee,
  vaultAddress,
  chainId,
  bond,
  onRefetch,
}: {
  grantId: bigint;
  index: number;
  milestone: Milestone;
  role: "dao" | "grantee" | "observer";
  grantee: Address;
  vaultAddress: Address;
  chainId: number;
  bond: bigint;
  onRefetch: () => void;
}) {
  const status = decodeMilestoneStatus(milestone.status);
  const assertionId =
    milestone.assertionId && milestone.assertionId !== "0x" + "0".repeat(64)
      ? milestone.assertionId
      : null;

  const canSubmit =
    role === "grantee" &&
    (status === MILESTONE_STATUS.PENDING || status === MILESTONE_STATUS.REJECTED);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">Milestone #{index + 1}</CardTitle>
            <StatusBadge status={status} />
          </div>
          <CardDescription className="max-w-2xl whitespace-pre-wrap">
            {milestone.criteria}
          </CardDescription>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg text-white">
            {formatAmount(milestone.amount)}
          </div>
          <div className="font-mono text-[11px] text-white/40">
            slice amount
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {milestone.evidenceRoot &&
        milestone.evidenceRoot !== "0x" + "0".repeat(64) ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-[11px] text-white/60">
            evidence · {truncateHash(milestone.evidenceRoot, 12, 10)}
          </div>
        ) : null}

        {assertionId && status === MILESTONE_STATUS.SUBMITTED ? (
          <ReasoningStream assertionId={assertionId} />
        ) : null}

        {canSubmit ? (
          <MilestoneSubmitDialog
            grantId={grantId}
            milestoneIndex={index}
            vaultAddress={vaultAddress}
            chainId={chainId}
            bond={bond}
            grantee={grantee}
            onDone={onRefetch}
            isResubmit={status === MILESTONE_STATUS.REJECTED}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: MilestoneStatus }) {
  switch (status) {
    case MILESTONE_STATUS.RELEASED:
      return <Badge variant="success">{MILESTONE_STATUS_LABEL[status]}</Badge>;
    case MILESTONE_STATUS.REJECTED:
      return <Badge variant="danger">{MILESTONE_STATUS_LABEL[status]}</Badge>;
    case MILESTONE_STATUS.SUBMITTED:
      return <Badge variant="info">{MILESTONE_STATUS_LABEL[status]}</Badge>;
    case MILESTONE_STATUS.PENDING:
    default:
      return <Badge variant="outline">{MILESTONE_STATUS_LABEL[status]}</Badge>;
  }
}

function MilestoneSubmitDialog({
  grantId,
  milestoneIndex,
  vaultAddress,
  chainId,
  bond,
  grantee,
  onDone,
  isResubmit,
}: {
  grantId: bigint;
  milestoneIndex: number;
  vaultAddress: Address;
  chainId: number;
  bond: bigint;
  grantee: Address;
  onDone: () => void;
  isResubmit: boolean;
}) {
  const { writeContractAsync } = useWriteContract();
  const [open, setOpen] = useState(false);
  const [rootHash, setRootHash] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pseudoAssertion = (`0x${(
    (grantId << 32n) | BigInt(milestoneIndex)
  )
    .toString(16)
    .padStart(64, "0")}`) as `0x${string}`;

  async function submit() {
    if (!rootHash) return;
    try {
      setSubmitting(true);
      await runTx(
        writeContractAsync({
          address: vaultAddress,
          abi: abis.milestoneVault,
          functionName: "submitMilestone",
          args: [grantId, BigInt(milestoneIndex), rootHash],
          value: bond,
        }),
        {
          chainId,
          pending: isResubmit
            ? "Resubmitting with new evidence…"
            : "Submitting milestone evidence…",
          success: "Milestone submitted",
        },
      );
      onDone();
      setOpen(false);
      setRootHash(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          {isResubmit ? "Resubmit evidence" : "Submit evidence"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isResubmit ? "Resubmit milestone" : "Submit milestone"}
          </DialogTitle>
          <DialogDescription>
            Upload the deliverable. The judge compares it against the criteria
            text attached to this milestone. Bond is{" "}
            <span className="font-mono text-white/80">{formatAmount(bond)} 0G</span>.
          </DialogDescription>
        </DialogHeader>
        <EvidenceUploader
          assertionId={pseudoAssertion}
          uploader={grantee}
          onUploaded={(res) => setRootHash(res.rootHash)}
        />
        <DialogFooter>
          <Button
            disabled={!rootHash || submitting}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : `Submit · ${formatAmount(bond)} bond`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
