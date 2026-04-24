"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { type Address } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";

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
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
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
  POLICY_STATUS,
  POLICY_STATUS_LABEL,
  decodePolicyStatus,
  type Policy,
  type PolicyStatus,
} from "@/lib/web3/insurance";
import { runTx } from "@/lib/web3/tx";

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "0";
  const insuranceAddress = maybeContractAddress("parametricInsurance");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Policy · #${id}`}
        title="Policy detail"
        description="Coverage window, claim status, and the on-chain path from trigger to payout."
        action={
          <Button variant="ghost" asChild>
            <Link href="/insurance">All policies</Link>
          </Button>
        }
      />
      {!insuranceAddress ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set{" "}
              <code className="font-mono text-white/70">
                NEXT_PUBLIC_PARAMETRIC_INSURANCE
              </code>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ConnectWall>
          <PolicyDetail id={BigInt(id)} insuranceAddress={insuranceAddress} />
        </ConnectWall>
      )}
    </div>
  );
}

function PolicyDetail({
  id,
  insuranceAddress,
}: {
  id: bigint;
  insuranceAddress: Address;
}) {
  const chainId = useChainId();
  const { address } = useAccount();
  const { data, isLoading, refetch } = useReadContract({
    address: insuranceAddress,
    abi: abis.parametricInsurance,
    functionName: "getPolicy",
    args: [id],
  });

  const bond = useReadContract({
    address: insuranceAddress,
    abi: abis.parametricInsurance,
    functionName: "assertionBond",
  }) as { data: bigint | undefined };

  if (isLoading || !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const policy = data as unknown as Policy;
  const status = decodePolicyStatus(policy.status);
  const role =
    address?.toLowerCase() === policy.insurer.toLowerCase()
      ? "insurer"
      : address?.toLowerCase() === policy.holder.toLowerCase()
        ? "holder"
        : "observer";

  const activeAssertion =
    policy.assertionId && policy.assertionId !== "0x" + "0".repeat(64)
      ? policy.assertionId
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <OverviewCard
          id={id}
          policy={policy}
          status={status}
          role={role}
          chainId={chainId}
          insuranceAddress={insuranceAddress}
        />

        <Card>
          <CardHeader>
            <CardTitle>Trigger condition</CardTitle>
            <CardDescription>
              Verdict reads this verbatim when the claim is filed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80">
              {policy.condition || "—"}
            </pre>
            {policy.evidenceSpec &&
            policy.evidenceSpec !== "0x" + "0".repeat(64) ? (
              <div className="mt-3 font-mono text-[11px] text-white/40">
                evidence spec · {truncateHash(policy.evidenceSpec, 12, 10)}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {activeAssertion ? <ReasoningStream assertionId={activeAssertion} /> : null}
      </div>

      <aside className="space-y-6">
        <ActionsCard
          id={id}
          policy={policy}
          status={status}
          role={role}
          chainId={chainId}
          insuranceAddress={insuranceAddress}
          bond={bond.data ?? 0n}
          onRefetch={refetch}
        />
      </aside>
    </div>
  );
}

function OverviewCard({
  id,
  policy,
  status,
  role,
  chainId,
  insuranceAddress,
}: {
  id: bigint;
  policy: Policy;
  status: PolicyStatus;
  role: "insurer" | "holder" | "observer";
  chainId: number;
  insuranceAddress: Address;
}) {
  const terminal =
    status === POLICY_STATUS.PAID || status === POLICY_STATUS.EXPIRED;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Policy #{id.toString()}</CardTitle>
          <Badge variant={terminal ? "secondary" : "info"}>
            {POLICY_STATUS_LABEL[status]}
          </Badge>
          <Badge variant="outline">you are {role}</Badge>
        </div>
        <CardDescription>
          <a
            href={explorerAddress(chainId, insuranceAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:text-white/70"
          >
            {truncateAddress(insuranceAddress, 6)}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Insurer" value={truncateAddress(policy.insurer, 6)} mono />
        <Field label="Holder" value={truncateAddress(policy.holder, 6)} mono />
        <Field label="Payout" value={`${formatAmount(policy.payout)} 0G`} mono />
        <Field label="Premium" value={`${formatAmount(policy.premium)} 0G`} mono />
        <Field
          label="Coverage start"
          value={formatTimestamp(Number(policy.coverageStart) * 1000)}
        />
        <Field
          label="Coverage end"
          value={formatTimestamp(Number(policy.coverageEnd) * 1000)}
        />
        {policy.assertionId &&
        policy.assertionId !== "0x" + "0".repeat(64) ? (
          <Field
            label="Assertion"
            value={truncateHash(policy.assertionId, 8, 6)}
            mono
          />
        ) : null}
        {policy.claimEvidence &&
        policy.claimEvidence !== "0x" + "0".repeat(64) ? (
          <Field
            label="Claim evidence"
            value={truncateHash(policy.claimEvidence, 8, 6)}
            mono
          />
        ) : null}
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

function ActionsCard({
  id,
  policy,
  status,
  role,
  chainId,
  insuranceAddress,
  bond,
  onRefetch,
}: {
  id: bigint;
  policy: Policy;
  status: PolicyStatus;
  role: "insurer" | "holder" | "observer";
  chainId: number;
  insuranceAddress: Address;
  bond: bigint;
  onRefetch: () => void;
}) {
  const { writeContractAsync } = useWriteContract();

  const nowSec = Math.floor(Date.now() / 1000);
  const inCoverage =
    nowSec >= Number(policy.coverageStart) && nowSec <= Number(policy.coverageEnd);
  const afterEnd = nowSec > Number(policy.coverageEnd);
  const premiumPayable = status === POLICY_STATUS.ACTIVE && policy.premium > 0n;

  async function onPayPremium() {
    await runTx(
      writeContractAsync({
        address: insuranceAddress,
        abi: abis.parametricInsurance,
        functionName: "payPremium",
        args: [id],
        value: policy.premium,
      }),
      {
        chainId,
        pending: "Paying premium…",
        success: "Premium paid",
      },
    );
    onRefetch();
  }

  async function onReclaim() {
    await runTx(
      writeContractAsync({
        address: insuranceAddress,
        abi: abis.parametricInsurance,
        functionName: "reclaim",
        args: [id],
      }),
      {
        chainId,
        pending: "Reclaiming collateral…",
        success: "Collateral returned",
      },
    );
    onRefetch();
  }

  async function onRescueInvalid() {
    await runTx(
      writeContractAsync({
        address: insuranceAddress,
        abi: abis.parametricInsurance,
        functionName: "rescueInvalidClaim",
        args: [id],
      }),
      {
        chainId,
        pending: "Rescuing stuck claim…",
        success: "Policy reopened",
      },
    );
    onRefetch();
  }

  const nothingToDo =
    status === POLICY_STATUS.PAID || status === POLICY_STATUS.EXPIRED;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your move</CardTitle>
        <CardDescription>
          {nothingToDo
            ? "This policy is closed."
            : "Actions below are what the contract allows for your role right now."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {role === "holder" && premiumPayable ? (
          <Button className="w-full" onClick={onPayPremium}>
            Pay premium ({formatAmount(policy.premium)} 0G)
          </Button>
        ) : null}

        {role === "holder" && status === POLICY_STATUS.ACTIVE && inCoverage ? (
          <ClaimDialog
            id={id}
            insuranceAddress={insuranceAddress}
            chainId={chainId}
            bond={bond}
            holder={policy.holder}
            onDone={onRefetch}
          />
        ) : null}

        {role === "holder" && status === POLICY_STATUS.CLAIM_PENDING ? (
          <Button variant="outline" className="w-full" onClick={onRescueInvalid}>
            Rescue INVALID claim
          </Button>
        ) : null}

        {role === "insurer" && status === POLICY_STATUS.ACTIVE && afterEnd ? (
          <Button variant="outline" className="w-full" onClick={onReclaim}>
            Reclaim collateral
          </Button>
        ) : null}

        {nothingToDo ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
            <OutcomeBadge
              outcome={status === POLICY_STATUS.PAID ? "TRUE" : "PENDING"}
            />
            {status === POLICY_STATUS.PAID
              ? "Payout delivered to holder."
              : "Coverage ended without a triggered claim."}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClaimDialog({
  id,
  insuranceAddress,
  chainId,
  bond,
  holder,
  onDone,
}: {
  id: bigint;
  insuranceAddress: Address;
  chainId: number;
  bond: bigint;
  holder: Address;
  onDone: () => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const [open, setOpen] = useState(false);
  const [rootHash, setRootHash] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pseudoAssertion = (`0x${id.toString(16).padStart(64, "0")}`) as `0x${string}`;

  async function submit() {
    if (!rootHash) return;
    try {
      setSubmitting(true);
      await runTx(
        writeContractAsync({
          address: insuranceAddress,
          abi: abis.parametricInsurance,
          functionName: "claim",
          args: [id, rootHash],
          value: bond,
        }),
        {
          chainId,
          pending: "Filing claim + opening verdict…",
          success: "Claim filed",
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
        <Button className="w-full">File claim</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File a parametric claim</DialogTitle>
          <DialogDescription>
            Upload evidence of the trigger (oracle snapshot, flight data, on-chain
            feed dump — whatever the condition cited). Bond is{" "}
            <span className="font-mono text-white/80">{formatAmount(bond)} 0G</span>.
          </DialogDescription>
        </DialogHeader>
        <EvidenceUploader
          assertionId={pseudoAssertion}
          uploader={holder}
          onUploaded={(res) => setRootHash(res.rootHash)}
        />
        <DialogFooter>
          <Button
            disabled={!rootHash || submitting}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : `File claim · ${formatAmount(bond)} bond`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
