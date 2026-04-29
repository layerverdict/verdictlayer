"use client";

import { useMemo, useState } from "react";
import { type Address, decodeEventLog } from "viem";
import {
  useAccount,
  usePublicClient,
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
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { LoginButton } from "@/components/verdict/login-button";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import { attachEvidence } from "@/lib/api";
import { formatAmount, isZeroHash, truncateHash } from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import {
  MILESTONE_STATUS,
  MILESTONE_STATUS_LABEL,
  decodeMilestoneStatus,
  type Milestone,
  type MilestoneStatus,
} from "@/lib/web3/milestones";
import { runTx } from "@/lib/web3/tx";

export interface MilestoneListInput {
  grantId: number;
  chainId: number;
  vaultAddress: Address;
  dao: Address;
  grantee: Address;
  milestoneCount: number;
  grantExpiresAt: string;
  reclaimed: boolean;
}

/**
 * Client-side slice of the grant page.
 *
 * Reads per-milestone data straight from the vault (chain) because the
 * indexer mirror doesn't currently store the criteria text/status
 * breakdown. Public RPC works without a wallet, so observers still get
 * a full render; the submit/reclaim buttons light up only when a
 * connected wallet matches the grantee/DAO role.
 */
export function MilestoneList(props: MilestoneListInput) {
  const { address, isConnected } = useAccount();
  const indexes = useMemo(
    () => Array.from({ length: props.milestoneCount }, (_, i) => i),
    [props.milestoneCount],
  );

  const reads = useReadContracts({
    contracts: indexes.map((i) => ({
      address: props.vaultAddress,
      abi: abis.milestoneVault,
      functionName: "getMilestone",
      args: [BigInt(props.grantId), BigInt(i)],
      chainId: props.chainId,
    })),
    query: { enabled: indexes.length > 0 },
  });

  const bond = useReadContract({
    address: props.vaultAddress,
    abi: abis.milestoneVault,
    functionName: "assertionBond",
    chainId: props.chainId,
  }) as { data: bigint | undefined };

  const role: "dao" | "grantee" | "observer" = !isConnected
    ? "observer"
    : address?.toLowerCase() === props.dao.toLowerCase()
      ? "dao"
      : address?.toLowerCase() === props.grantee.toLowerCase()
        ? "grantee"
        : "observer";

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresSec = Math.floor(new Date(props.grantExpiresAt).getTime() / 1000);
  const expired = nowSec > expiresSec;

  return (
    <div className="space-y-6">
      {role === "observer" && !isConnected ? (
        <Card className="border-white/10 bg-white/[0.02]">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-white/60">
              Sign in as the grantee to submit milestones, or as the DAO to
              reclaim residue once the window closes.
            </div>
            <LoginButton />
          </CardContent>
        </Card>
      ) : null}

      {role === "dao" && expired && !props.reclaimed ? (
        <ReclaimRow
          id={BigInt(props.grantId)}
          chainId={props.chainId}
          vaultAddress={props.vaultAddress}
        />
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Milestones</h2>
        {reads.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="grid gap-4">
            {indexes.map((i) => {
              const res = reads.data?.[i];
              if (!res || res.status !== "success") return null;
              const m = res.result as unknown as Milestone;
              return (
                <MilestoneCard
                  key={i}
                  grantId={BigInt(props.grantId)}
                  index={i}
                  milestone={m}
                  role={role}
                  grantee={props.grantee}
                  vaultAddress={props.vaultAddress}
                  chainId={props.chainId}
                  bond={bond.data ?? 0n}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReclaimRow({
  id,
  chainId,
  vaultAddress,
}: {
  id: bigint;
  chainId: number;
  vaultAddress: Address;
}) {
  const { writeContractAsync } = useWriteContract();

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
}: {
  grantId: bigint;
  index: number;
  milestone: Milestone;
  role: "dao" | "grantee" | "observer";
  grantee: Address;
  vaultAddress: Address;
  chainId: number;
  bond: bigint;
}) {
  const status = decodeMilestoneStatus(milestone.status);
  const assertionId =
    isZeroHash(milestone.assertionId) ? null : milestone.assertionId;

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
        {!isZeroHash(milestone.evidenceRoot) ? (
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
  isResubmit,
}: {
  grantId: bigint;
  milestoneIndex: number;
  vaultAddress: Address;
  chainId: number;
  bond: bigint;
  grantee: Address;
  isResubmit: boolean;
}) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [open, setOpen] = useState(false);
  const [rootHash, setRootHash] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!rootHash || !publicClient) return;
    try {
      setSubmitting(true);
      const hash = await runTx(
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

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let assertionId: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: abis.milestoneVault,
            topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
            data: log.data,
          });
          if (
            decoded.eventName === "MilestoneSubmitted" &&
            decoded.args &&
            "assertionId" in decoded.args
          ) {
            assertionId = (decoded.args as { assertionId: `0x${string}` })
              .assertionId;
            break;
          }
        } catch {
          // Not a MilestoneVault log — skip.
        }
      }

      if (assertionId) {
        try {
          await attachEvidence({ rootHash, assertionId, uploader: grantee });
        } catch (err) {
          console.warn("attachEvidence failed", err);
        }
      }

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
