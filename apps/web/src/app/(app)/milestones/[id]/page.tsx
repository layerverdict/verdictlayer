import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/verdict/page-header";
import { formatAmount, formatTimestamp, truncateAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getGrant, type GrantRow } from "@/lib/api-server";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress, zgMainnet } from "@/lib/web3/chains";

import { MilestoneList } from "./milestone-list";

export const dynamic = "force-dynamic";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? zgMainnet.id);

export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const vaultAddress = maybeContractAddress("milestoneVault");

  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

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
        <GrantDetailBody id={id} vaultAddress={vaultAddress} />
      )}
    </div>
  );
}

async function GrantDetailBody({
  id,
  vaultAddress,
}: {
  id: number;
  vaultAddress: `0x${string}`;
}) {
  const res = await getGrant(id);
  if (!res) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Grant not found</CardTitle>
          <CardDescription>
            No grant with id <span className="font-mono">#{id}</span> exists on
            this chain yet. The indexer may still be catching up — try again in
            a few seconds.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const grant = res.grant;

  return (
    <div className="space-y-6">
      <OverviewCard id={id} grant={grant} vaultAddress={vaultAddress} />
      <MilestoneList
        grantId={id}
        chainId={CHAIN_ID}
        vaultAddress={vaultAddress}
        dao={grant.dao}
        grantee={grant.grantee}
        milestoneCount={grant.milestoneCount}
        grantExpiresAt={grant.grantExpiresAt}
        reclaimed={false}
      />
    </div>
  );
}

function OverviewCard({
  id,
  grant,
  vaultAddress,
}: {
  id: number;
  grant: GrantRow;
  vaultAddress: `0x${string}`;
}) {
  const released = BigInt(grant.releasedAmount);
  const total = BigInt(grant.totalAmount);
  const progress = total > 0n ? Number((released * 100n) / total) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Grant #{id}</CardTitle>
          <Badge variant="outline">{grant.milestoneCount} milestones</Badge>
        </div>
        <CardDescription>
          <a
            href={explorerAddress(CHAIN_ID, vaultAddress)}
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
            {formatAmount(released)}
            <span className="mx-2 text-white/30">/</span>
            {formatAmount(total)}
          </div>
          <span className="font-mono text-[11px] text-white/40">
            {truncateAddress(grant.token, 4)} · {progress}% released
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Field label="DAO" value={truncateAddress(grant.dao, 6)} mono />
          <Field
            label="Grantee"
            value={truncateAddress(grant.grantee, 6)}
            mono
          />
          <Field
            label="Expires"
            value={formatTimestamp(new Date(grant.grantExpiresAt).getTime())}
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
