"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type Address, decodeEventLog } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";

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
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { LoginButton } from "@/components/verdict/login-button";
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import { attachEvidence } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import {
  ESCROW_STATUS,
  decodeEscrowStatusLabel,
  type EscrowStatus,
} from "@/lib/web3/escrow";
import { runTx } from "@/lib/web3/tx";

export interface EscrowActionsInput {
  id: number;
  chainId: number;
  escrowAddress: Address;
  client: Address;
  freelancer: Address;
  statusLabel: string;
  assertionId: `0x${string}` | null;
  serverAssertionId?: `0x${string}` | null;
}

export function EscrowActions(props: EscrowActionsInput) {
  const { address, isConnected } = useAccount();
  const [disputeAssertionId, setDisputeAssertionId] = useState<`0x${string}` | null>(null);
  const status = decodeEscrowStatusLabel(props.statusLabel);

  const bondRead = useReadContract({
    address: props.escrowAddress,
    abi: abis.escrow,
    functionName: "assertionBond",
    chainId: props.chainId,
  }) as { data: bigint | undefined };

  const role: "client" | "freelancer" | "observer" = !isConnected
    ? "observer"
    : address?.toLowerCase() === props.client.toLowerCase()
      ? "client"
      : address?.toLowerCase() === props.freelancer.toLowerCase()
        ? "freelancer"
        : "observer";

  const terminal =
    status === ESCROW_STATUS.ACCEPTED ||
    status === ESCROW_STATUS.RESOLVED_CLIENT ||
    status === ESCROW_STATUS.RESOLVED_FREELANCER ||
    status === ESCROW_STATUS.EXPIRED;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your move</CardTitle>
          <CardDescription>
            {!isConnected
              ? "Sign in to see the actions available to you on this case."
              : terminal
                ? "This case is closed. No further actions required."
                : role === "observer"
                  ? "You're observing this case. Only the client or freelancer can act."
                  : "Actions below are what the contract allows for your role right now."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected ? (
            <div className="flex justify-center">
              <LoginButton />
            </div>
          ) : (
            <EscrowActionButtons
              {...props}
              status={status}
              role={role}
              bond={bondRead.data ?? 0n}
              terminal={terminal}
              onDisputeFiled={setDisputeAssertionId}
            />
          )}
        </CardContent>
      </Card>
      {disputeAssertionId && disputeAssertionId !== props.serverAssertionId ? (
        <ReasoningStream assertionId={disputeAssertionId} />
      ) : null}
    </>
  );
}

function EscrowActionButtons({
  id,
  chainId,
  escrowAddress,
  client,
  freelancer,
  assertionId,
  status,
  role,
  bond,
  terminal,
  onDisputeFiled,
}: EscrowActionsInput & {
  status: EscrowStatus;
  role: "client" | "freelancer" | "observer";
  bond: bigint;
  terminal: boolean;
  onDisputeFiled: (assertionId: `0x${string}`) => void;
}) {
  const { writeContractAsync } = useWriteContract();

  async function onAccept() {
    await runTx(
      writeContractAsync({
        address: escrowAddress,
        abi: abis.escrow,
        functionName: "accept",
        args: [BigInt(id)],
      }),
      { chainId, pending: "Releasing funds…", success: "Accepted" },
    );
  }

  async function onExpire() {
    await runTx(
      writeContractAsync({
        address: escrowAddress,
        abi: abis.escrow,
        functionName: "expire",
        args: [BigInt(id)],
      }),
      { chainId, pending: "Expiring escrow…", success: "Escrow expired" },
    );
  }

  return (
    <>
      {role === "freelancer" && status === ESCROW_STATUS.FUNDED ? (
        <DeliverDialog
          id={BigInt(id)}
          escrowAddress={escrowAddress}
          chainId={chainId}
          freelancer={freelancer}
        />
      ) : null}

      {role === "client" &&
      (status === ESCROW_STATUS.DELIVERED || status === ESCROW_STATUS.FUNDED) ? (
        <Button className="w-full" onClick={onAccept}>
          Accept delivery
        </Button>
      ) : null}

      {role === "client" && status === ESCROW_STATUS.DELIVERED ? (
        <DisputeDialog
          id={BigInt(id)}
          escrowAddress={escrowAddress}
          chainId={chainId}
          bond={bond}
          client={client}
          onDisputeFiled={onDisputeFiled}
        />
      ) : null}

      {role === "freelancer" &&
      status === ESCROW_STATUS.DISPUTED &&
      assertionId ? (
        <RespondDialog
          id={BigInt(id)}
          escrowAddress={escrowAddress}
          chainId={chainId}
          freelancer={freelancer}
          assertionId={assertionId}
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

      {terminal ? (
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
    </>
  );
}

/* ─────────── Deliver ─────────── */

function DeliverDialog({
  id,
  escrowAddress,
  chainId,
  freelancer,
}: {
  id: bigint;
  escrowAddress: Address;
  chainId: number;
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
      setOpen(false);
      setRootHash(null);
    } finally {
      setSubmitting(false);
    }
  }

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
  client,
  onDisputeFiled,
}: {
  id: bigint;
  escrowAddress: Address;
  chainId: number;
  bond: bigint;
  client: Address;
  onDisputeFiled: (assertionId: `0x${string}`) => void;
}) {
  const router = useRouter();
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

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const assertionId = readDisputeAssertionId(receipt.logs);
      if (assertionId) {
        onDisputeFiled(assertionId);
        attachEvidence({ rootHash, assertionId, uploader: client }).catch(
          (err) => console.warn("attachEvidence failed", err),
        );
      }

      setOpen(false);
      setRootHash(null);
      router.refresh();
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
            <span className="font-mono text-white/80">{formatAmount(bond)} 0G</span>{" "}
            is posted to the registry as spam protection — returned if you win
            the verdict.
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
  freelancer,
  assertionId,
}: {
  id: bigint;
  escrowAddress: Address;
  chainId: number;
  freelancer: Address;
  assertionId: `0x${string}`;
}) {
  const router = useRouter();
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

      await publicClient.waitForTransactionReceipt({ hash });
      attachEvidence({ rootHash, assertionId, uploader: freelancer }).catch(
        (err) => console.warn("attachEvidence failed", err),
      );

      setOpen(false);
      setRootHash(null);
      router.refresh();
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

function readDisputeAssertionId(
  logs: {
    address: `0x${string}`;
    topics: readonly `0x${string}`[];
    data: `0x${string}`;
  }[],
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
