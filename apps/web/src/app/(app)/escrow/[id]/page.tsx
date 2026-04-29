import Link from "next/link";
import { notFound } from "next/navigation";
import { zeroAddress } from "viem";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppealPanel } from "@/components/verdict/appeal-panel";
import { PageHeader } from "@/components/verdict/page-header";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import {
  formatAmount,
  formatTimestamp,
  isZeroHash,
  truncateAddress,
  truncateHash,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { getEscrow, type EscrowRow } from "@/lib/api-server";
import { maybeContractAddress } from "@/lib/web3/addresses";
import {
  ESCROW_STATUS,
  ESCROW_STATUS_LABEL,
  decodeEscrowStatusLabel,
} from "@/lib/web3/escrow";
import { explorerAddress, zgMainnet } from "@/lib/web3/chains";

import { EscrowActions } from "./actions";

export const dynamic = "force-dynamic";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? zgMainnet.id);

export default async function EscrowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const escrowAddress = maybeContractAddress("escrow");

  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

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
              Set <code className="font-mono text-white/70">NEXT_PUBLIC_ESCROW</code>{" "}
              to the Escrow address for your active chain.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <EscrowDetailBody id={id} escrowAddress={escrowAddress} />
      )}
    </div>
  );
}

async function EscrowDetailBody({
  id,
  escrowAddress,
}: {
  id: number;
  escrowAddress: `0x${string}`;
}) {
  const res = await getEscrow(id);
  if (!res) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Escrow not found</CardTitle>
          <CardDescription>
            No escrow with id <span className="font-mono">#{id}</span> exists on
            this chain yet. The indexer may still be catching up — try again in
            a few seconds.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const record = res.escrow;
  const status = decodeEscrowStatusLabel(record.status);
  const assertionId =
    record.assertionId && !isZeroHash(record.assertionId)
      ? record.assertionId
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <OverviewCard id={id} record={record} escrowAddress={escrowAddress} />

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

        {assertionId ? <ReasoningStream assertionId={assertionId} /> : null}
        {assertionId ? <AppealPanel assertionId={assertionId} /> : null}
      </div>

      <aside className="space-y-6">
        <EscrowActions
          id={id}
          chainId={CHAIN_ID}
          escrowAddress={escrowAddress}
          client={record.client}
          freelancer={record.freelancer}
          statusLabel={record.status}
          assertionId={assertionId}
        />

        <EvidenceTimeline record={record} />
      </aside>
    </div>
  );
}

function OverviewCard({
  id,
  record,
  escrowAddress,
}: {
  id: number;
  record: EscrowRow;
  escrowAddress: `0x${string}`;
}) {
  const status = decodeEscrowStatusLabel(record.status);
  const terminal =
    status === ESCROW_STATUS.ACCEPTED ||
    status === ESCROW_STATUS.RESOLVED_CLIENT ||
    status === ESCROW_STATUS.RESOLVED_FREELANCER ||
    status === ESCROW_STATUS.EXPIRED;

  const deadlineMs = record.deadline ? Number(record.deadline) * 1000 : 0;
  const disputeDeadlineMs = record.disputeResponseDeadline
    ? Number(record.disputeResponseDeadline) * 1000
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Escrow #{id}</CardTitle>
          <Badge variant={terminal ? "secondary" : "info"}>
            {ESCROW_STATUS_LABEL[status]}
          </Badge>
        </div>
        <CardDescription>
          <a
            href={explorerAddress(CHAIN_ID, escrowAddress)}
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
        <Field
          label="Freelancer"
          value={truncateAddress(record.freelancer, 6)}
          mono
        />
        <Field
          label="Amount"
          value={`${formatAmount(BigInt(record.amount))} ${truncateAddress(
            record.token,
            4,
          )}`}
          mono
        />
        <Field
          label="Deadline"
          value={deadlineMs > 0 ? formatTimestamp(deadlineMs) : "—"}
        />
        {disputeDeadlineMs > 0 ? (
          <Field
            label="Dispute response by"
            value={formatTimestamp(disputeDeadlineMs)}
          />
        ) : null}
        {record.assertionId && !isZeroHash(record.assertionId) ? (
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
      <div className={cn("text-sm text-white/80", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function EvidenceTimeline({ record }: { record: EscrowRow }) {
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
  ].filter((i): i is { label: string; hash: `0x${string}`; who: `0x${string}` } =>
    Boolean(i.hash && !isZeroHash(i.hash)),
  );

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
