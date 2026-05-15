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
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import {
  formatAmount,
  formatTimestamp,
  isZeroHash,
  truncateAddress,
  truncateHash,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPolicy, type PolicyRow } from "@/lib/api-server";
import { maybeContractAddress } from "@/lib/web3/addresses";
import {
  POLICY_STATUS,
  POLICY_STATUS_LABEL,
  decodePolicyStatusLabel,
} from "@/lib/web3/insurance";
import { explorerAddress, zgMainnet } from "@/lib/web3/chains";

import { InsuranceActions } from "./actions";

export const dynamic = "force-dynamic";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? zgMainnet.id);

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const insuranceAddress = maybeContractAddress("parametricInsurance");

  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

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
        <PolicyDetailBody id={id} insuranceAddress={insuranceAddress} />
      )}
    </div>
  );
}

async function PolicyDetailBody({
  id,
  insuranceAddress,
}: {
  id: number;
  insuranceAddress: `0x${string}`;
}) {
  const res = await getPolicy(id);
  if (!res) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Policy not found</CardTitle>
          <CardDescription>
            No policy with id <span className="font-mono">#{id}</span> exists on
            this chain yet. The indexer may still be catching up — try again in
            a few seconds.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const policy = res.policy;
  const assertionId =
    policy.assertionId && !isZeroHash(policy.assertionId)
      ? policy.assertionId
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <OverviewCard id={id} policy={policy} insuranceAddress={insuranceAddress} />

          <Card>
            <CardHeader>
              <CardTitle>Trigger condition</CardTitle>
              <CardDescription>
                The Verdict Layer judge reads this verbatim when the claim is filed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80">
                {policy.condition || "—"}
              </pre>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <InsuranceActions
            id={id}
            chainId={CHAIN_ID}
            insuranceAddress={insuranceAddress}
            insurer={policy.insurer}
            holder={policy.holder}
            statusLabel={policy.status}
            premium={policy.premium}
            coverageStart={policy.coverageStart}
            coverageEnd={policy.coverageEnd}
            serverAssertionId={assertionId}
          />
        </aside>
      </div>

      {assertionId ? <ReasoningStream assertionId={assertionId} /> : null}
    </div>
  );
}

function OverviewCard({
  id,
  policy,
  insuranceAddress,
}: {
  id: number;
  policy: PolicyRow;
  insuranceAddress: `0x${string}`;
}) {
  const status = decodePolicyStatusLabel(policy.status);
  const terminal =
    status === POLICY_STATUS.PAID || status === POLICY_STATUS.EXPIRED;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Policy #{id}</CardTitle>
          <Badge variant={terminal ? "secondary" : "info"}>
            {POLICY_STATUS_LABEL[status]}
          </Badge>
        </div>
        <CardDescription>
          <a
            href={explorerAddress(CHAIN_ID, insuranceAddress)}
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
        <Field
          label="Payout"
          value={`${formatAmount(BigInt(policy.payout))} 0G`}
          mono
        />
        <Field
          label="Premium"
          value={`${formatAmount(BigInt(policy.premium))} 0G`}
          mono
        />
        <Field
          label="Coverage start"
          value={formatTimestamp(new Date(policy.coverageStart).getTime())}
        />
        <Field
          label="Coverage end"
          value={formatTimestamp(new Date(policy.coverageEnd).getTime())}
        />
        {policy.assertionId && !isZeroHash(policy.assertionId) ? (
          <Field
            label="Assertion"
            value={truncateHash(policy.assertionId, 8, 6)}
            mono
          />
        ) : null}
        {policy.claimEvidence && !isZeroHash(policy.claimEvidence) ? (
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
