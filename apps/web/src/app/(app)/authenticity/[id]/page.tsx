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
import { getCheck, type CheckRow } from "@/lib/api-server";
import {
  formatRelative,
  formatTimestamp,
  isZeroHash,
  truncateAddress,
  truncateHash,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { maybeContractAddress } from "@/lib/web3/addresses";
import {
  CHECK_STATUS,
  CHECK_STATUS_LABEL,
  decodeCheckStatusLabel,
  type CheckStatus,
} from "@/lib/web3/authenticity";
import { explorerAddress, zgMainnet } from "@/lib/web3/chains";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? zgMainnet.id);

export const dynamic = "force-dynamic";

export default async function CheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const certifier = maybeContractAddress("authenticityCertifier");

  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Check · #${id}`}
        title="Authenticity check"
        description="The judge compares the uploaded asset against the reference and publishes a signed outcome."
        action={
          <Button variant="ghost" asChild>
            <Link href="/authenticity">All checks</Link>
          </Button>
        }
      />
      {!certifier ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set{" "}
              <code className="font-mono text-white/70">
                NEXT_PUBLIC_AUTHENTICITY_CERTIFIER
              </code>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <CheckDetailBody id={id} certifier={certifier} />
      )}
    </div>
  );
}

async function CheckDetailBody({
  id,
  certifier,
}: {
  id: number;
  certifier: `0x${string}`;
}) {
  const res = await getCheck(id);
  if (!res) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check not found</CardTitle>
          <CardDescription>
            No authenticity check with id <span className="font-mono">#{id}</span>{" "}
            exists on this chain yet. The indexer may still be catching up — try
            again in a few seconds.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const check = res.check;
  const status = decodeCheckStatusLabel(check.status);
  const activeAssertion =
    check.assertionId && !isZeroHash(check.assertionId) ? check.assertionId : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <OverviewCard id={id} check={check} status={status} certifier={certifier} />

          {status === CHECK_STATUS.CERTIFIED ? <CertifiedBanner check={check} /> : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integration</CardTitle>
              <CardDescription>
                Query whether any asset hash has been certified on this chain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <pre className="rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-white/70">
{`certifier.isCertified(
  assetHash
) → bool`}
              </pre>
              <p className="text-white/40">
                Emits <span className="font-mono text-white/60">CertificateIssued</span>{" "}
                when a check lands TRUE. Marketplaces can index directly on it.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {activeAssertion ? <ReasoningStream assertionId={activeAssertion} /> : null}
    </div>
  );
}

function OverviewCard({
  id,
  check,
  status,
  certifier,
}: {
  id: number;
  check: CheckRow;
  status: CheckStatus;
  certifier: `0x${string}`;
}) {
  const submittedAt = check.submittedAt ? new Date(check.submittedAt).getTime() : 0;
  const decidedAt = check.decidedAt ? new Date(check.decidedAt).getTime() : 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-2xl">Check #{id}</CardTitle>
          <StatusBadge status={status} />
        </div>
        <CardDescription>
          <a
            href={explorerAddress(CHAIN_ID, certifier)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:text-white/70"
          >
            {truncateAddress(certifier, 6)}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Submitter"
          value={truncateAddress(check.submitter, 6)}
          mono
        />
        <Field
          label="Submitted"
          value={submittedAt > 0 ? formatTimestamp(submittedAt) : "—"}
        />
        <Field
          label="Asset hash"
          value={truncateHash(check.assetHash, 10, 8)}
          mono
        />
        <Field
          label="Reference hash"
          value={truncateHash(check.referenceHash, 10, 8)}
          mono
        />
        {decidedAt > 0 ? (
          <Field
            label="Decided"
            value={`${formatTimestamp(decidedAt)} · ${formatRelative(decidedAt)}`}
          />
        ) : null}
        {check.reasoningRoot && !isZeroHash(check.reasoningRoot) ? (
          <Field
            label="Reasoning"
            value={truncateHash(check.reasoningRoot, 10, 8)}
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

function CertifiedBanner({ check }: { check: CheckRow }) {
  return (
    <Card className="border-green-400/30 bg-green-400/10">
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-green-400/30 bg-green-400/10 text-green-300">
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <div className="text-base font-semibold text-white">
            Certificate issued
          </div>
          <div className="mt-1 font-mono text-xs text-white/50">
            asset · {truncateHash(check.assetHash, 12, 10)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  switch (status) {
    case CHECK_STATUS.CERTIFIED:
      return <Badge variant="success">{CHECK_STATUS_LABEL[status]}</Badge>;
    case CHECK_STATUS.REJECTED:
      return <Badge variant="danger">{CHECK_STATUS_LABEL[status]}</Badge>;
    case CHECK_STATUS.PENDING:
      return <Badge variant="info">{CHECK_STATUS_LABEL[status]}</Badge>;
    default:
      return <Badge variant="outline">{CHECK_STATUS_LABEL[status]}</Badge>;
  }
}
