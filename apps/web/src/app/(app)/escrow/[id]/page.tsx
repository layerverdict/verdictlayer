"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { type Address, decodeEventLog, zeroAddress } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";

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
import { AppealPanel } from "@/components/verdict/appeal-panel";
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
import { PageHeader } from "@/components/verdict/page-header";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import { attachEvidence } from "@/lib/api";
import {
  formatAmount,
  formatTimestamp,
  isZeroHash,
  truncateAddress,
  truncateHash,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress } from "@/lib/web3/chains";
import {
  ESCROW_STATUS,
  ESCROW_STATUS_LABEL,
  decodeStatus,
  type EscrowRecord,
  type EscrowStatus,
} from "@/lib/web3/escrow";
import { runTx } from "@/lib/web3/tx";

export default function EscrowDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id ?? "";
  const escrowAddress = maybeContractAddress("escrow");

  let parsedId: bigint | null = null;
  try {
    if (/^\d+$/.test(rawId)) parsedId = BigInt(rawId);
  } catch {
    parsedId = null;
  }

  if (!parsedId || parsedId <= 0n) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Escrow"
          title="Not found"
          description="That escrow id isn't a positive integer."
          action={
            <Button variant="ghost" asChild>
              <Link href="/escrow">Back to list</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const id = parsedId;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Escrow · #${id}`}
        title="Case detail"
        description="Track the delivery, the evidence chain, and the verdict. Actions light up when it's your move."
        action={
          <Button variant="ghost" asChild>
            <Link href="/escrow">All escrows</Link>
          </Button>
        }
      />
      {!escrowAddress ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set <code className="font-mono text-white/70">NEXT_PUBLIC_ESCROW</code> to the
              Escrow address for your active chain.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <EscrowDetail id={id} escrowAddress={escrowAddress} />
      )}
    </div>
  );
}

function EscrowDetail({
  id,
  escrowAddress,
}: {
  id: bigint;
  escrowAddress: Address;
}) {
  const chainId = useChainId();
  const { address } = useAccount();
  const { data, isLoading, refetch } = useReadContract({
    address: escrowAddress,
    abi: abis.escrow,
    functionName: "getEscrow",
    args: [id],
  });

  const bond = useReadContract({
    address: escrowAddress,
    abi: abis.escrow,
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

  const record = data as unknown as EscrowRecord;
  const status = decodeStatus(record.status);
  const role =
    address?.toLowerCase() === record.client.toLowerCase()
      ? "client"
      : address?.toLowerCase() === record.freelancer.toLowerCase()
        ? "freelancer"
        : "observer";

  const activeAssertion = isZeroHash(record.assertionId) ? null : record.assertionId;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <OverviewCard
          id={id}
          record={record}
          status={status}
          role={role}
          chainId={chainId}
          escrowAddress={escrowAddress}
        />

        <Card>
          <CardHeader>
            <CardTitle>Scope</CardTitle>
            <CardDescription>
              The judge interprets this verbatim when a dispute is filed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80">
              {record.scope || "—"}
            </pre>
          </CardContent>
        </Card>

        {activeAssertion ? <ReasoningStream assertionId={activeAssertion} /> : null}
        {activeAssertion ? <AppealPanel assertionId={activeAssertion} /> : null}
      </div>

      <aside className="space-y-6">
        <ActionsCard
          id={id}
          record={record}
          status={status}
          role={role}
          chainId={chainId}
          escrowAddress={escrowAddress}
          bond={bond.data ?? 0n}
          onRefetch={refetch}
        />

        <EvidenceTimeline record={record} />
      </aside>
    </div>
  );
}

function OverviewCard({
  id,
  record,
  status,
  role,
  chainId,
  escrowAddress,
}: {
  id: bigint;
  record: EscrowRecord;
  status: EscrowStatus;
  role: "client" | "freelancer" | "observer";
  chainId: number;
  escrowAddress: Address;
}) {
  const terminal =
    status === ESCROW_STATUS.ACCEPTED ||
    status === ESCROW_STATUS.RESOLVED_CLIENT ||
    status === ESCROW_STATUS.RESOLVED_FREELANCER ||
    status === ESCROW_STATUS.EXPIRED;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Escrow #{id.toString()}</CardTitle>
          <Badge variant={terminal ? "secondary" : "info"}>
            {ESCROW_STATUS_LABEL[status]}
          </Badge>
          <Badge variant="outline">you are {role}</Badge>
        </div>
        <CardDescription>
          <a
            href={explorerAddress(chainId, escrowAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:text-white/70"
          >
            {truncateAddress(escrowAddress, 6)}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" value={truncateAddress(record.client, 6)} mono />
        <Field label="Freelancer" value={truncateAddress(record.freelancer, 6)} mono />
        <Field
          label="Amount"
          value={`${formatAmount(record.amount)} ${truncateAddress(record.token, 4)}`}
          mono
        />
        <Field label="Deadline" value={formatTimestamp(Number(record.deadline) * 1000)} />
        {record.disputeResponseDeadline > 0n ? (
          <Field
            label="Dispute response by"
            value={formatTimestamp(Number(record.disputeResponseDeadline) * 1000)}
          />
        ) : null}
        {!isZeroHash(record.assertionId) ? (
          <Field
            label="Assertion"
            value={truncateHash(record.assertionId, 8, 6)}
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
      <div className={cn("text-sm text-white/80", mono && "font-mono")}>{value}</div>
    </div>
  );
}

/* ─────────── Actions ─────────── */

function ActionsCard({
  id,
  record,
  status,
  role,
  chainId,
  escrowAddress,
  bond,
  onRefetch,
}: {
  id: bigint;
  record: EscrowRecord;
  status: EscrowStatus;
  role: "client" | "freelancer" | "observer";
  chainId: number;
  escrowAddress: Address;
  bond: bigint;
  onRefetch: () => void;
}) {
  const { writeContractAsync } = useWriteContract();

  async function onAccept() {
    await runTx(
      writeContractAsync({
        address: escrowAddress,
        abi: abis.escrow,
        functionName: "accept",
        args: [id],
      }),
      { chainId, pending: "Releasing funds…", success: "Accepted" },
    );
    onRefetch();
  }

  async function onExpire() {
    await runTx(
      writeContractAsync({
        address: escrowAddress,
        abi: abis.escrow,
        functionName: "expire",
        args: [id],
      }),
      { chainId, pending: "Expiring escrow…", success: "Escrow expired" },
    );
    onRefetch();
  }

  const nothingToDo =
    status === ESCROW_STATUS.ACCEPTED ||
    status === ESCROW_STATUS.RESOLVED_CLIENT ||
    status === ESCROW_STATUS.RESOLVED_FREELANCER ||
    status === ESCROW_STATUS.EXPIRED;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your move</CardTitle>
        <CardDescription>
          {nothingToDo
            ? "This case is closed. No further actions required."
            : "Actions below are what the contract allows for your role right now."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {role === "freelancer" && status === ESCROW_STATUS.FUNDED ? (
          <DeliverDialog
            id={id}
            escrowAddress={escrowAddress}
            chainId={chainId}
            onDone={onRefetch}
            freelancer={record.freelancer}
          />
        ) : null}

        {role === "client" &&
          (status === ESCROW_STATUS.DELIVERED ||
            status === ESCROW_STATUS.FUNDED) ? (
          <Button className="w-full" onClick={onAccept}>
            Accept delivery
          </Button>
        ) : null}

        {role === "client" && status === ESCROW_STATUS.DELIVERED ? (
          <DisputeDialog
            id={id}
            escrowAddress={escrowAddress}
            chainId={chainId}
            bond={bond}
            onDone={onRefetch}
            client={record.client}
          />
        ) : null}

        {role === "freelancer" && status === ESCROW_STATUS.DISPUTED ? (
          <RespondDialog
            id={id}
            escrowAddress={escrowAddress}
            chainId={chainId}
            onDone={onRefetch}
            freelancer={record.freelancer}
            assertionId={record.assertionId}
          />
        ) : null}

        {(role === "client" || role === "freelancer") &&
          (status === ESCROW_STATUS.FUNDED ||
            status === ESCROW_STATUS.DELIVERED ||
            status === ESCROW_STATUS.DISPUTED) ? (
          <Button variant="outline" className="w-full" onClick={onExpire}>
            Expire (after deadline + 30d)
          </Button>
        ) : null}

        {nothingToDo ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
            <OutcomeBadge
              outcome={
                status === ESCROW_STATUS.RESOLVED_CLIENT
                  ? "TRUE"
                  : status === ESCROW_STATUS.RESOLVED_FREELANCER
                    ? "FALSE"
                    : "PENDING"
              }
            />
            Funds already settled.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ─────────── Deliver ─────────── */

function DeliverDialog({
  id,
  escrowAddress,
  chainId,
  onDone,
  freelancer,
}: {
  id: bigint;
  escrowAddress: Address;
  chainId: number;
  onDone: () => void;
  freelancer: Address;
}) {
  const { writeContractAsync } = useWriteContract();
  const [open, setOpen] = useState(false);
  const [rootHash, setRootHash] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!rootHash) return;
    try {
      setSubmitting(true);
      await runTx(
        writeContractAsync({
          address: escrowAddress,
          abi: abis.escrow,
          functionName: "deliver",
          args: [id, rootHash],
        }),
        { chainId, pending: "Marking delivery…", success: "Delivered" },
      );
      onDone();
      setOpen(false);
      setRootHash(null);
    } finally {
      setSubmitting(false);
    }
  }

  // Delivery doesn't create an assertion on-chain — only the evidence
  // root ends up in the Escrow struct. The evidence row is uploaded
  // with a null assertion; it stays orphan on purpose (no verdict ever
  // references this hash).

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">Mark delivered</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload delivery evidence</DialogTitle>
          <DialogDescription>
            Anything that proves completion — source archive, screencast,
            deployment URL doc. The root hash lives on-chain; the content stays
            on 0G Storage.
          </DialogDescription>
        </DialogHeader>
        <EvidenceUploader
          uploader={freelancer}
          onUploaded={(res) => setRootHash(res.rootHash)}
          helper="Evidence is stored under a merkle root; the hash goes on-chain."
        />
        <DialogFooter>
          <Button
            disabled={!rootHash || submitting}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : "Submit to chain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── Dispute ─────────── */

function DisputeDialog({
  id,
  escrowAddress,
  chainId,
  bond,
  onDone,
  client,
}: {
  id: bigint;
  escrowAddress: Address;
  chainId: number;
  bond: bigint;
  onDone: () => void;
  client: Address;
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
          address: escrowAddress,
          abi: abis.escrow,
          functionName: "openDispute",
          args: [id, rootHash],
          value: bond,
        }),
        {
          chainId,
          pending: "Opening dispute on-chain…",
          success: "Dispute opened",
        },
      );

      // Pull the fresh assertionId from the receipt and attach the
      // previously-uploaded evidence row to it. Best-effort: if the
      // indexer is still catching up, attachEvidence retries with
      // backoff and either succeeds or surfaces a toast on timeout.
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const assertionId = readDisputeAssertionId(receipt.logs);
      if (assertionId) {
        try {
          await attachEvidence({ rootHash, assertionId, uploader: client });
        } catch (err) {
          console.warn("attachEvidence failed", err);
        }
      }

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
        <Button variant="outline" className="w-full">
          Open dispute
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            Upload the evidence that the delivery missed scope. A bond of{" "}
            <span className="font-mono text-white/80">{formatAmount(bond)} 0G</span> is
            posted to the registry as spam protection — returned if you win the
            verdict.
          </DialogDescription>
        </DialogHeader>
        <EvidenceUploader
          uploader={client}
          onUploaded={(res) => setRootHash(res.rootHash)}
          helper="Screenshots, diffs, logs — anything the judge should weigh."
        />
        <DialogFooter>
          <Button
            disabled={!rootHash || submitting || bond === 0n}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : `Open dispute · ${formatAmount(bond)} bond`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── Respond ─────────── */

function RespondDialog({
  id,
  escrowAddress,
  chainId,
  onDone,
  freelancer,
  assertionId,
}: {
  id: bigint;
  escrowAddress: Address;
  chainId: number;
  onDone: () => void;
  freelancer: Address;
  assertionId: `0x${string}`;
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
          address: escrowAddress,
          abi: abis.escrow,
          functionName: "respondToDispute",
          args: [id, rootHash],
        }),
        {
          chainId,
          pending: "Posting rebuttal evidence…",
          success: "Response filed",
        },
      );

      // The assertion already exists (dispute opened earlier); once
      // the tx confirms we attach the rebuttal hash to it so the
      // judgment worker sees both sides.
      await publicClient.waitForTransactionReceipt({ hash });
      try {
        await attachEvidence({ rootHash, assertionId, uploader: freelancer });
      } catch (err) {
        console.warn("attachEvidence failed", err);
      }

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
        <Button className="w-full">Respond with evidence</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Respond to the dispute</DialogTitle>
          <DialogDescription>
            This attaches rebuttal evidence to the live assertion. Once filed
            the judge re-reads the full evidence set before finalising.
          </DialogDescription>
        </DialogHeader>
        <EvidenceUploader
          uploader={freelancer}
          onUploaded={(res) => setRootHash(res.rootHash)}
        />
        <DialogFooter>
          <Button
            disabled={!rootHash || submitting}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : "File response"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Decode a `DisputeOpened(uint256 escrowId, bytes32 assertionId, bytes32 clientEvidence)`
 * event from a receipt's logs and return the assertionId.
 *
 * Uses viem's `decodeEventLog` against the Escrow ABI — safer than
 * positionally indexing topics and resilient to ABI changes.
 */
function readDisputeAssertionId(
  logs: { address: `0x${string}`; topics: readonly `0x${string}`[]; data: `0x${string}` }[],
): `0x${string}` | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: abis.escrow,
        topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
        data: log.data,
      });
      if (
        decoded.eventName === "DisputeOpened" &&
        decoded.args &&
        "assertionId" in decoded.args
      ) {
        return (decoded.args as { assertionId: `0x${string}` }).assertionId;
      }
    } catch {
      // Not an Escrow event — skip.
    }
  }
  return null;
}

/* ─────────── Evidence Timeline ─────────── */

function EvidenceTimeline({ record }: { record: EscrowRecord }) {
  const items = [
    {
      label: "Delivery",
      hash: record.deliveryEvidence,
      who: record.freelancer,
    },
    {
      label: "Client evidence",
      hash: record.clientEvidence,
      who: record.client,
    },
    {
      label: "Freelancer rebuttal",
      hash: record.freelancerEvidence,
      who: record.freelancer,
    },
  ].filter((i) => !isZeroHash(i.hash));

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence timeline</CardTitle>
          <CardDescription>
            No evidence posted yet. It appears here as root hashes land on-chain.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evidence timeline</CardTitle>
        <CardDescription>
          Every hash resolves to the original file in 0G Storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm text-white/80">{item.label}</span>
              <span className="font-mono text-[11px] text-white/40">
                {item.who === zeroAddress ? "—" : truncateAddress(item.who, 4)}
              </span>
            </div>
            <div className="font-mono text-[11px] text-white/60">
              {truncateHash(item.hash, 12, 10)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
